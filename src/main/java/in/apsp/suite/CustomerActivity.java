package in.apsp.suite;

import static in.apsp.suite.Store.*;

import java.util.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
class CustomerActivity {

  final Store s;
  final Desk desk;

  CustomerActivity(Store s, Desk desk) {
    this.s = s;
    this.desk = desk;
  }

  private static final String CUSTOMER_SCOPE =
    "(p.branch=? or exists(select 1 from work w where w.person_id=p.id and w.branch=? and w.enabled=true and w.archived=false and w.kind in ('ORDER','LEAD','TICKET','VISIT','RETURN','REVIEW')))";

  @GetMapping("/crm/customers")
  List<Map<String, Object>> customers(
    @RequestParam(defaultValue = "") String q,
    @RequestParam(defaultValue = "1") int page,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    role(u, "ADMIN", "SALES", "SUPPORT");
    if (q.length() > 180 || page < 1 || page > 100000) throw fail(
      400,
      "Invalid search"
    );
    List<Object> args = new ArrayList<>();
    args.add(q.strip().toLowerCase(Locale.ROOT));
    String where = "";
    if (!permit(u, "SUPER_ADMIN")) {
      where = " and " + CUSTOMER_SCOPE;
      args.add(u.get("branch"));
      args.add(u.get("branch"));
    }
    args.add((page - 1) * 30);
    return s.rows(
      "select p.id,p.display_name,p.email,p.branch from person p where p.role='CUSTOMER' and locate(?,lower(concat(p.display_name,' ',p.email,' ',coalesce(p.phone,''))))>0" +
        where +
        " order by p.display_name,p.id offset ? rows fetch next 30 rows only",
      args.toArray()
    );
  }

  @GetMapping("/crm/customers/{person}")
  Map<String, Object> history(
    @PathVariable long person,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    role(u, "ADMIN", "SALES", "SUPPORT");
    String projection =
      "select p.id,p.display_name,p.email,p.phone,p.branch from person p where p.id=? and p.role='CUSTOMER'";
    var profile = permit(u, "SUPER_ADMIN")
      ? s.one(projection, person)
      : s.one(
          projection + " and " + CUSTOMER_SCOPE,
          person,
          u.get("branch"),
          u.get("branch")
        );
    String where =
      "select id,kind,title,stage,branch,person_id,assignee,detail,amount,created_at,due_date,parent_id,enabled,archived from work where person_id=? and archived=false and enabled=true";
    var all = permit(u, "SUPER_ADMIN")
      ? s.rows(where + " order by id desc", person)
      : s.rows(
          where + " and branch=? order by id desc",
          person,
          u.get("branch")
        );
    var activity = all
      .stream()
      .filter(w -> Flows.visible(u, w))
      .toList();
    return Map.of("customer", profile, "activity", activity);
  }

  @GetMapping("/orders/{order}/tracking")
  @Transactional(readOnly = true)
  Map<String, Object> tracking(
    @PathVariable long order,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    var w = desk.get(order, u, false);
    if (!"ORDER".equals(w.get("kind"))) throw fail(404, "Order not found");
    var jobs = s.rows(
      "select stage from work where parent_id=? and kind='JOB' order by id",
      order
    );
    Map<String, Object> milestones = new LinkedHashMap<>();
    milestones.put(
      jobs.isEmpty() ? "CONFIRMED" : "IN_PRODUCTION",
      w.get("created_at")
    );
    for (var event : s.rows(
      "select action,created_at from journal where work_id=? order by id",
      order
    )) {
      String action = (String) event.get("action");
      if (
        action.equals("Workshop quality check passed")
      ) milestones.putIfAbsent("CONFIRMED", event.get("created_at"));
      String[] transition = action.split(" · ", 2)[0].split(" → ", 2);
      if (
        transition.length == 2 &&
        Set.of(
          "PACKED",
          "DISPATCHED",
          "DELIVERED",
          "INSTALLED",
          "CANCELLED"
        ).contains(transition[1])
      ) milestones.putIfAbsent(transition[1], event.get("created_at"));
    }
    var shipments = s.rows(
      "select i.name,sh.qty,sh.reference_no,sh.created_at from shipment sh join item i on i.id=sh.item_id where sh.work_id=? order by sh.id",
      order
    );
    if (
      !shipments.isEmpty() &&
      Set.of("DISPATCHED", "DELIVERED", "INSTALLED").contains(w.get("stage"))
    ) milestones.putIfAbsent(
      "DISPATCHED",
      shipments.get(shipments.size() - 1).get("created_at")
    );
    return Map.of(
      "id",
      order,
      "branch",
      w.get("branch"),
      "stage",
      w.get("stage"),
      "milestones",
      milestones,
      "workshop",
      jobs,
      "items",
      s.rows(
        "select name,qty,shipped from item where work_id=? order by id",
        order
      ),
      "shipments",
      shipments,
      "route",
      s.rows("select slot from route_stop where work_id=?", order),
      "windows",
      s.rows(
        "select d.starts,d.ends from delivery_booking b join delivery_window d on d.id=b.slot_id where b.work_id=? and b.active=true",
        order
      )
    );
  }
}
