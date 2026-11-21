package in.apsp.suite;

import static in.apsp.suite.Store.*;

import java.util.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/manage")
class AdminRecords {
  final Store store;

  AdminRecords(Store store) {
    this.store = store;
  }

  static final String HISTORY =
    "exists(select 1 from work child where child.parent_id=w.id) has_children," +
    "(exists(select 1 from money m where m.work_id=w.id) or exists(select 1 from posting p where p.work_id=w.id) " +
    "or exists(select 1 from payment_intent i where i.work_id=w.id) or exists(select 1 from sandbox_order t where t.work_id=w.id)) has_financial_history";

  static boolean mayEdit(Map<String, Object> row) {
    String stage = (String) row.get("stage");
    return switch ((String) row.get("kind")) {
      case "LEAD" -> Set.of("NEW", "CONTACTED", "QUALIFIED", "MEASURED").contains(stage);
      case "VISIT" -> "SCHEDULED".equals(stage);
      case "CAMPAIGN" -> "DRAFT".equals(stage);
      case "TICKET" -> Set.of("OPEN", "IN_PROGRESS").contains(stage);
      case "PURCHASE", "TRANSFER" -> Set.of("DRAFT", "REQUESTED").contains(stage);
      case "REVIEW" -> true; // The moderation form retains the original customer feedback.
      default -> false;
    };
  }

  static boolean mayPause(Map<String, Object> row) {
    if (Boolean.TRUE.equals(row.get("has_financial_history"))) return false;
    String stage = (String) row.get("stage");
    return switch ((String) row.get("kind")) {
      case "LEAD" -> Set.of("NEW", "CONTACTED", "QUALIFIED", "MEASURED", "LOST").contains(stage);
      case "VISIT" -> Set.of("SCHEDULED", "CANCELLED").contains(stage);
      case "CAMPAIGN" -> "DRAFT".equals(stage);
      case "PURCHASE", "TRANSFER" -> Set.of("DRAFT", "REQUESTED", "CANCELLED").contains(stage);
      case "TICKET" -> Set.of("OPEN", "CLOSED").contains(stage);
      case "ORDER" -> "CANCELLED".equals(stage);
      case "REVIEW" -> true;
      default -> false;
    };
  }

  static void describeActions(Map<String, Object> row) {
    boolean pause = mayPause(row);
    boolean children = Boolean.TRUE.equals(row.remove("has_children"));
    row.put("canEdit", mayEdit(row));
    row.put("canPause", pause || Boolean.FALSE.equals(row.get("enabled")));
    row.put("canDelete", pause && !children);
    row.remove("has_financial_history");
  }

  @PostMapping("/work/{id}")
  @Transactional
  void work(@PathVariable long id, @RequestBody Map<String, Object> body,
            @RequestAttribute("viewer") Map<String, Object> user) {
    role(user, "ADMIN");
    var row = store.one("select w.*," + HISTORY + " from work w where w.id=? for update", id);
    CatalogAdmin.scope(user, (String) row.get("branch"));
    if (id(body.get("revision")) != id(row.get("revision"))) throw fail(409, "This record changed. Refresh and try again.");
    String action = req(body, "action", 16);
    if (Boolean.TRUE.equals(row.get("archived")) != action.equals("restore")) throw fail(409, "Check the record’s current archive status.");
    switch (action) {
      case "edit" -> {
        if ("REVIEW".equals(row.get("kind"))) throw fail(409, "Use review moderation to edit customer feedback");
        if (!mayEdit(row)) throw fail(409, "This record’s workflow preserves its original details.");
        if (Boolean.FALSE.equals(row.get("enabled"))) throw fail(409, "Enable the record before editing it");
        String title = req(body, "title", 180);
        if ("TRANSFER".equals(row.get("kind"))) {
          if (body.containsKey("detail") && !Objects.equals(body.get("detail"), row.get("detail"))) {
            throw fail(400, "The transfer destination is fixed.");
          }
          store.db.update("update work set title=?,revision=revision+1 where id=?", title, id);
        } else {
          store.db.update("update work set title=?,detail=?,revision=revision+1 where id=?", title, str(body, "detail", 2500), id);
        }
      }
      case "enable", "disable", "delete", "restore" -> {
        if ((action.equals("disable") || action.equals("delete")) && !mayPause(row)) {
          throw fail(409, "Use this record’s workflow to cancel or reverse posted activity.");
        }
        if (action.equals("delete") && Boolean.TRUE.equals(row.get("has_children"))) {
          throw fail(409, "Linked activity needs this record. It can be viewed in the workflow.");
        }
        if (action.equals("enable") || action.equals("disable")) {
          boolean enable = action.equals("enable");
          if (Objects.equals(row.get("enabled"), enable)) throw fail(409, "The record already has that status.");
          store.db.update("update work set enabled=?,revision=revision+1 where id=?", enable, id);
        } else {
          store.db.update("update work set archived=?,revision=revision+1 where id=?", action.equals("delete"), id);
        }
      }
      default -> throw fail(400, "Unknown record action");
    }
    store.audit(id, user.get("id"), "Admin record action: " + action);
  }

  @PostMapping("/listing/{id}")
  @Transactional
  void listing(@PathVariable long id, @RequestBody Map<String, Object> body,
               @RequestAttribute("viewer") Map<String, Object> user) {
    String branch = CatalogAdmin.scope(user, req(body, "branch", 60));
    String action = req(body, "action", 16);
    if (!Set.of("enable", "disable", "delete", "restore").contains(action)) throw fail(400, "Unknown listing action");
    var row = CatalogAdmin.lockListing(store, id, branch);
    long revision = id(row.get("listing_revision"));
    if (id(body.get("revision")) != revision) throw fail(409, "Listing changed. Reload and try again.");
    if (Boolean.TRUE.equals(row.get("archived")) != action.equals("restore")) throw fail(409, "Check the listing’s current archive status.");
    store.db.update(
      "merge into catalog_listing(product_id,branch,name,category,finish,dimensions,warranty,published,revision,archived) key(product_id,branch) values(?,?,?,?,?,?,?,?,?,?)",
      id, branch, row.get("name"), row.get("category"), row.get("finish"), row.get("dimensions"), row.get("warranty"),
      action.equals("enable"), revision + 1, action.equals("delete"));
    store.audit(null, user.get("id"), "Listing #" + id + " (" + branch + "): " + action);
  }

  @PostMapping("/staff/{id}")
  @Transactional
  void staff(@PathVariable long id, @RequestBody Map<String, Object> body,
             @RequestAttribute("viewer") Map<String, Object> user) {
    role(user, "SUPER_ADMIN");
    var row = StaffAccess.lockCurrent(store, id, body);
    String action = req(body, "action", 16);
    if (Boolean.TRUE.equals(row.get("archived")) != action.equals("restore")) throw fail(409, "Check the account’s current archive status.");
    switch (action) {
      case "edit" -> store.db.update("update person set display_name=?,auth_version=auth_version+1 where id=?", req(body, "name", 100), id);
      case "delete", "restore" -> store.db.update("update person set active=false,archived=?,auth_version=auth_version+1 where id=?", action.equals("delete"), id);
      default -> throw fail(400, "Choose an account action");
    }
    store.audit(null, user.get("id"), "Staff account #" + id + ": " + action);
  }
}
