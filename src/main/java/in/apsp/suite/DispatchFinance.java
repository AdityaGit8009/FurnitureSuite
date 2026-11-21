package in.apsp.suite;

import static in.apsp.suite.Store.*;

import java.math.*;
import java.util.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
class DispatchFinance {

  final Store s;
  final Desk desk;

  DispatchFinance(Store s, Desk desk) {
    this.s = s;
    this.desk = desk;
  }

  @PostMapping("/vehicles")
  @Transactional
  void vehicle(
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    role(u, "ADMIN");
    String branch = desk.location(b, u);
    var capacity = price(b.get("capacity"));
    if (capacity.signum() <= 0) throw fail(400, "Capacity must be positive");
    s.db.update(
      "insert into vehicle values(?,?,?)",
      req(b, "name", 80),
      branch,
      capacity
    );
    s.audit(null, u.get("id"), "Registered delivery vehicle");
  }

  @PostMapping("/work/{id}/dispatch-slot")
  @Transactional
  void slot(
    @PathVariable long id,
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    role(u, "ADMIN", "WAREHOUSE");
    var w = desk.get(id, u, true);
    if (
      !"ORDER".equals(w.get("kind")) ||
      !Set.of("CONFIRMED", "PACKED").contains(w.get("stage"))
    ) throw fail(409, "Schedule an open order");
    var van = s.one(
      "select * from vehicle where name=? and branch=? for update",
      req(b, "vehicle", 80),
      w.get("branch")
    );
    var day = Desk.date(b);
    var volume = price(b.get("volume"));
    var used = (BigDecimal) s
      .one(
        "select coalesce(sum(r.volume),0) used from route_stop r join work w on w.id=r.work_id where r.vehicle=? and r.slot=? and r.work_id<>? and w.stage<>'CANCELLED' and w.enabled=true and w.archived=false",
        van.get("name"),
        day,
        id
      )
      .get("used");
    if (
      volume.signum() <= 0 ||
      volume.add(used).compareTo((BigDecimal) van.get("capacity")) > 0
    ) throw fail(409, "Load exceeds remaining capacity");
    s.db.update(
      "merge into route_stop key(work_id) values(?,?,?,?,?)",
      id,
      van.get("name"),
      day,
      req(b, "crew", 100),
      volume
    );
    s.db.update("update work set due_date=?,revision=revision+1 where id=?", day, id);
    s.audit(
      id,
      u.get("id"),
      "Delivery booked for " + day + " · " + van.get("name")
    );
  }

  @GetMapping("/operations")
  Map<String, Object> ops(@RequestAttribute("viewer") Map<String, Object> u) {
    role(u, "ADMIN", "WAREHOUSE", "DELIVERY", "ACCOUNTANT", "CASHIER");
    Map<String, Object> out = new HashMap<>();
    boolean owner = u.get("role").equals("SUPER_ADMIN");
    Object[] args = owner ? new Object[0] : new Object[] { u.get("branch") };
    String scoped = owner ? "" : " where w.branch=?";
    if (permit(u, "ADMIN", "WAREHOUSE", "DELIVERY")) {
      out.put(
        "vehicles",
        s.rows(
          "select * from vehicle" +
            (owner ? "" : " where branch=?") +
            " order by name",
          args
        )
      );
      String assignee = u.get("role").equals("DELIVERY")
        ? " and w.assignee=?"
        : "";
      out.put(
        "route",
        s.rows(
          "select r.*,w.detail,w.stage,w.branch from route_stop r join work w on w.id=r.work_id" +
            (owner ? " where " : scoped + " and ") + "w.enabled=true and w.archived=false and w.stage<>'CANCELLED'" +
            assignee +
            " order by r.slot,r.vehicle,w.detail",
          assignee.isEmpty()
            ? args
            : new Object[] { u.get("branch"), u.get("id") }
        )
      );
    }
    if (permit(u, "ADMIN", "ACCOUNTANT", "CASHIER")) out.put(
      "payments",
      s.rows(
        "select m.id,m.work_id,m.ref,m.amount,m.created_at,w.branch,b.statement_ref from money m join work w on m.work_id=w.id left join bank_match b on b.payment_id=m.id" +
          scoped +
          " order by m.id desc",
        args
      )
    );
    return out;
  }

  @PostMapping("/bank/{id}")
  @Transactional
  void reconcile(
    @PathVariable long id,
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    role(u, "ADMIN", "ACCOUNTANT");
    var payment = s.one("select * from money where id=? for update", id);
    var w = desk.get(Store.id(payment.get("work_id")), u, true);
    BigDecimal expected = (BigDecimal) payment.get("amount");
    if (expected.abs().compareTo(price(b.get("amount"))) != 0) throw fail(
      409,
      "Bank amount does not match"
    );
    s.db.update(
      "insert into bank_match(payment_id,statement_ref,actor) values(?,?,?)",
      id,
      req(b, "ref", 120),
      u.get("id")
    );
    s.audit(w.get("id"), u.get("id"), "Matched bank entry " + b.get("ref"));
  }
}
