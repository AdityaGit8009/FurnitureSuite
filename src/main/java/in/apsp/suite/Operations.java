package in.apsp.suite;

import static in.apsp.suite.Store.*;

import java.math.BigDecimal;
import java.util.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
class Operations {

  final Store s;
  final Desk desk;

  Operations(Store s, Desk desk) {
    this.s = s;
    this.desk = desk;
  }

  @PostMapping("/restock/{id}")
  void subscribe(
    @PathVariable long id,
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    String branch = branch(b);
    s.db.update(
      "merge into restock key(person_id,product_id,branch) values(?,?,?)",
      u.get("id"),
      id,
      branch
    );
  }

  @PostMapping("/work/{id}/estimate")
  @Transactional
  void estimate(
    @PathVariable long id,
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    role(u, "SALES", "ADMIN");
    var w = desk.get(id, u, true);
    if (
      !w.get("kind").equals("LEAD") || !w.get("stage").equals("MEASURED")
    ) throw fail(409, "Measure the project first");
    var m = price(b.get("materials"));
    var l = price(b.get("labour"));
    var f = price(b.get("freight"));
    var d = price(b.get("discount"));
    var gross = m.add(l).add(f);
    if (gross.compareTo(d) <= 0) throw fail(
      400,
      "Discount must be below the estimate"
    );
    boolean approved = d.multiply(BigDecimal.TEN).compareTo(gross) <= 0;
    s.db.update(
      "merge into quote_calc key(work_id) values(?,?,?,?,?,?,?)",
      id,
      m,
      l,
      f,
      d,
      approved,
      u.get("id")
    );
    s.audit(
      id,
      u.get("id"),
      "Costed estimate INR " +
        gross.subtract(d) +
        (approved ? "" : " · Manager approval required")
    );
  }

  @PostMapping("/work/{id}/discount")
  @Transactional
  void approve(
    @PathVariable long id,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    role(u, "ADMIN");
    desk.get(id, u, true);
    if (
      s.db.update(
        "update quote_calc set approved=true where work_id=? and approved=false and requester<>?",
        id,
        u.get("id")
      ) != 1
    ) throw fail(409, "A different manager must approve a pending discount");
    s.audit(id, u.get("id"), "Approved discount");
  }

  @PostMapping("/work/{id}/bom")
  @Transactional
  void plan(
    @PathVariable long id,
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    role(u, "PRODUCTION", "ADMIN");
    var w = desk.get(id, u, true);
    if (
      !"JOB".equals(w.get("kind")) ||
      !Set.of("PLANNED", "AWAITING_ADVANCE").contains(w.get("stage"))
    ) throw fail(409, "Material plans are editable before cutting");
    s.db.update(
      "merge into plan_material key(job_id,product_id) values(?,?,?)",
      id,
      Store.id(b.get("productId")),
      qty(b.get("qty"))
    );
    s.audit(id, u.get("id"), "Updated material plan");
  }

  @PostMapping("/work/{id}/ship")
  @Transactional
  void ship(
    @PathVariable long id,
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    role(u, "WAREHOUSE", "DELIVERY", "ADMIN");
    var w = desk.get(id, u, true);
    if (
      !"ORDER".equals(w.get("kind")) || !"PACKED".equals(w.get("stage"))
    ) throw fail(409, "Pack the order first");
    var line = s.one(
      "select * from item where id=? and work_id=?",
      Store.id(b.get("lineId")),
      id
    );
    int q = qty(b.get("qty"));
    if (
      q + Store.id(line.get("shipped")) > Store.id(line.get("qty"))
    ) throw fail(409, "Shipment exceeds remaining quantity");
    if (line.get("product_id") != null) s.db.update(
      "update stock set on_hand=on_hand-?,held=held-? where product_id=? and branch=?",
      q,
      q,
      line.get("product_id"),
      w.get("branch")
    );
    s.db.update(
      "update item set shipped=shipped+? where id=?",
      q,
      line.get("id")
    );
    s.db.update(
      "insert into shipment(work_id,item_id,qty,reference_no) values(?,?,?,?)",
      id,
      line.get("id"),
      q,
      req(b, "ref", 150)
    );
    boolean done = s
      .rows("select id from item where work_id=? and shipped<qty", id)
      .isEmpty();
    s.db.update(
      "update work set stage=?,revision=revision+1 where id=?",
      done ? "DISPATCHED" : "PACKED",
      id
    );
    s.audit(
      id,
      u.get("id"),
      "Shipped " + q + " × " + line.get("name") + " · " + b.get("ref")
    );
  }

  @GetMapping("/insights")
  Map<String, Object> insights(
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    role(u, "ADMIN", "ACCOUNTANT", "PURCHASE", "WAREHOUSE", "PRODUCTION");
    String branch = (String) u.get("branch");
    boolean owner = "SUPER_ADMIN".equals(u.get("role"));
    String scope = owner ? "" : " and w.branch=?";
    Object[] args = owner ? new Object[0] : new Object[] { branch };
    Map<String, Object> m = new HashMap<>();
    m.put(
      "demand",
      s.rows(
        "select p.sku,p.name,st.branch,st.on_hand-st.held available,coalesce(sum(case when w.kind='ORDER' and w.stage<>'CANCELLED' and w.branch=st.branch and w.created_at>=dateadd(day,-30,current_timestamp) then i.qty else 0 end),0) sold from stock st join product p on p.id=st.product_id left join item i on i.product_id=p.id left join work w on w.id=i.work_id where 1=1 " +
          (owner ? "" : "and st.branch=?") +
          " group by p.sku,p.name,st.branch,st.on_hand,st.held order by sold desc",
        args
      )
    );
    if (permit(u, "ADMIN", "ACCOUNTANT")) m.put(
      "margin",
      s.rows(
        "select w.id,w.title,w.branch,w.amount invoiced,coalesce(sum(i.cost*i.qty),0) item_cost from work w join item i on i.work_id=w.id where w.kind='ORDER' and w.stage in ('DELIVERED','INSTALLED')" +
          scope +
          " group by w.id,w.title,w.branch,w.amount order by w.id desc",
        args
      )
    );
    return m;
  }
}
