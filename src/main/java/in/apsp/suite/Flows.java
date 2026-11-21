package in.apsp.suite;

import java.util.*;

/** Workflow gates are shared by the HTTP command handler and the UI action list. */
final class Flows {

  record Step(String from, String to, List<String> roles) {}

  static final Map<String, List<Step>> graph = new LinkedHashMap<>();

  static void path(String kind, String from, String to, String roles) {
    graph
      .computeIfAbsent(kind, k -> new ArrayList<>())
      .add(new Step(from, to, List.of(roles.split(" "))));
  }

  static {
    path("LEAD", "NEW", "CONTACTED", "SALES ADMIN");
    path("LEAD", "CONTACTED", "QUALIFIED", "SALES ADMIN");
    path("LEAD", "QUALIFIED", "MEASURED", "DESIGNER SALES ADMIN");
    path("LEAD", "MEASURED", "QUOTED", "SALES ADMIN");
    path("LEAD", "QUOTED", "ACCEPTED", "CUSTOMER");
    for (String st : List.of(
      "NEW",
      "CONTACTED",
      "QUALIFIED",
      "MEASURED",
      "QUOTED"
    ))
      path("LEAD", st, "LOST", "SALES ADMIN");
    path("ORDER", "CONFIRMED", "PACKED", "WAREHOUSE ADMIN");
    path("ORDER", "PACKED", "DISPATCHED", "WAREHOUSE DELIVERY ADMIN");
    path("ORDER", "DISPATCHED", "DELIVERED", "DELIVERY ADMIN");
    path("ORDER", "DELIVERED", "INSTALLED", "DELIVERY ADMIN");
    path("ORDER", "CONFIRMED", "CANCELLED", "CUSTOMER ADMIN CASHIER");
    path("JOB", "AWAITING_ADVANCE", "PLANNED", "PRODUCTION ADMIN");
    path("JOB", "PLANNED", "CUTTING", "PRODUCTION ADMIN");
    path("JOB", "CUTTING", "ASSEMBLY", "PRODUCTION ADMIN");
    path("JOB", "ASSEMBLY", "FINISHING", "PRODUCTION ADMIN");
    path("JOB", "FINISHING", "QC", "PRODUCTION ADMIN");
    path("JOB", "QC", "REWORK", "PRODUCTION ADMIN");
    path("JOB", "REWORK", "QC", "PRODUCTION ADMIN");
    path("JOB", "QC", "READY", "WAREHOUSE ADMIN");
    path("PURCHASE", "REQUESTED", "APPROVED", "ADMIN");
    path("PURCHASE", "APPROVED", "ORDERED", "PURCHASE ADMIN");
    path("PURCHASE", "ORDERED", "INSPECTING", "WAREHOUSE ADMIN");
    path("PURCHASE", "INSPECTING", "RECEIVED", "WAREHOUSE ADMIN");
    path("PURCHASE", "RECEIVED", "MATCHED", "ACCOUNTANT ADMIN");
    path("PURCHASE", "MATCHED", "PAID", "ACCOUNTANT ADMIN");
    path("TRANSFER", "REQUESTED", "APPROVED", "ADMIN");
    path("TRANSFER", "APPROVED", "IN_TRANSIT", "WAREHOUSE ADMIN");
    path("TRANSFER", "IN_TRANSIT", "RECEIVED", "WAREHOUSE ADMIN");
    path("TICKET", "OPEN", "IN_PROGRESS", "SUPPORT ADMIN");
    path("TICKET", "IN_PROGRESS", "RESOLVED", "SUPPORT ADMIN");
    path("TICKET", "RESOLVED", "CLOSED", "CUSTOMER SUPPORT ADMIN");
    path("RETURN", "REQUESTED", "APPROVED", "SUPPORT ADMIN");
    path("RETURN", "REQUESTED", "DECLINED", "SUPPORT ADMIN");
    path("RETURN", "APPROVED", "INSPECTING", "WAREHOUSE ADMIN");
    path("RETURN", "INSPECTING", "REFUND_APPROVED", "ADMIN");
    path("RETURN", "REFUND_APPROVED", "REFUNDED", "ACCOUNTANT ADMIN");
    path("CAMPAIGN", "DRAFT", "ACTIVE", "MARKETING ADMIN");
    path("CAMPAIGN", "ACTIVE", "COMPLETED", "MARKETING ADMIN");
    path("VISIT", "SCHEDULED", "COMPLETED", "DESIGNER DELIVERY ADMIN");
    path("VISIT", "SCHEDULED", "CANCELLED", "SALES ADMIN");
    path("REVIEW", "PENDING", "PUBLISHED", "SUPPORT ADMIN");
    path("REVIEW", "PENDING", "DECLINED", "SUPPORT ADMIN");
  }

  static final Map<String, String> staff = Map.ofEntries(
    Map.entry("LEAD", "SALES DESIGNER"),
    Map.entry("ORDER", "SALES CASHIER ACCOUNTANT WAREHOUSE DELIVERY SUPPORT"),
    Map.entry("JOB", "PRODUCTION DESIGNER WAREHOUSE ACCOUNTANT"),
    Map.entry("PURCHASE", "PURCHASE WAREHOUSE ACCOUNTANT"),
    Map.entry("TRANSFER", "WAREHOUSE"),
    Map.entry("TICKET", "SUPPORT DELIVERY"),
    Map.entry("RETURN", "WAREHOUSE SUPPORT ACCOUNTANT"),
    Map.entry("CAMPAIGN", "MARKETING"),
    Map.entry("VISIT", "SALES DESIGNER DELIVERY"),
    Map.entry("REVIEW", "SUPPORT")
  );

  static boolean visible(Map<String, Object> u, Map<String, Object> w) {
    String r = (String) u.get("role"),
      k = (String) w.get("kind");
    if ((Boolean.TRUE.equals(w.get("archived"))||Boolean.FALSE.equals(w.get("enabled"))) && !Set.of("ADMIN","SUPER_ADMIN").contains(r)) return false;
    if ("SUPER_ADMIN".equals(r)) return true;
    if ("CUSTOMER".equals(r)) return (
      Objects.equals(w.get("person_id"), u.get("id")) &&
      Set.of("ORDER", "LEAD", "VISIT", "RETURN", "REVIEW", "TICKET").contains(k)
    );
    if (
      !Objects.equals(w.get("branch"), u.get("branch")) &&
      !(
        "TRANSFER".equals(k) && Objects.equals(w.get("detail"), u.get("branch"))
      )
    ) return false;
    if ("ADMIN".equals(r)) return true;
    if (
      ("DELIVERY".equals(r) || "DESIGNER".equals(r)) &&
      !Objects.equals(w.get("assignee"), u.get("id"))
    ) return false;
    return List.of(staff.getOrDefault(k, "").split(" ")).contains(r);
  }

  static List<String> actions(Map<String, Object> u, Map<String, Object> w) {
    String r = (String) u.get("role");
    if (Boolean.TRUE.equals(w.get("archived"))||Boolean.FALSE.equals(w.get("enabled"))) return List.of();
    return graph
      .getOrDefault(w.get("kind"), List.of())
      .stream()
      .filter(
        t ->
          t.from.equals(w.get("stage")) &&
          (t.roles.contains(r) || r.equals("SUPER_ADMIN"))
      )
      .map(Step::to)
      .toList();
  }
}
