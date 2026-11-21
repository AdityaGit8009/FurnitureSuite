package in.apsp.suite;

import static in.apsp.suite.Store.*;

import java.util.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/inventory")
class Inventory {

  final Store s;

  Inventory(Store s) {
    this.s = s;
  }

  @GetMapping
  Map<String, Object> view(@RequestAttribute("viewer") Map<String, Object> u) {
    role(u, "WAREHOUSE", "PURCHASE", "PRODUCTION", "ADMIN");
    boolean all = "SUPER_ADMIN".equals(u.get("role"));
    Object[] a = all ? new Object[] {} : new Object[] { u.get("branch") };
    String scope = all ? "" : " where st.branch=?";
    return Map.of(
      "units",
      s.rows(
        "select st.*,p.name,p.sku from stock st join showroom_item p on st.product_id=p.id and st.branch=p.branch" +
          scope +
          " order by p.id,st.branch",
        a
      ),
      "counts",
      s.rows(
        "select st.*,p.sku from stock_count st join product p on st.product_id=p.id" +
          scope +
          " order by st.id desc",
        a
      )
    );
  }

  @PostMapping("/count")
  @Transactional
  void count(
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    role(u, "WAREHOUSE", "ADMIN");
    String branch = "SUPER_ADMIN".equals(u.get("role"))
      ? branch(b)
      : (String) u.get("branch");
    long product = id(b.get("productId"));
    var row = s.one(
      "select * from stock where branch=? and product_id=? for update",
      branch,
      product
    );
    long sell = id(b.get("sellable")),
      damage = id(b.get("damaged")),
      display = id(b.get("display"));
    if (
      sell < id(row.get("held")) ||
      damage < 0 ||
      display < 0 ||
      Math.max(sell, Math.max(damage, display)) > 1000000
    ) throw fail(400, "Check quantities and reserved units");
    s.db.update(
      "insert into stock_count(product_id,branch,sellable,damaged,display_units,reason,creator,baseline,baseline_damaged,baseline_display) values(?,?,?,?,?,?,?,?,?,?)",
      product,
      branch,
      sell,
      damage,
      display,
      req(b, "reason", 200),
      u.get("id"),
      row.get("on_hand"),
      row.get("damaged"),
      row.get("display_units")
    );
    s.audit(null, u.get("id"), "Submitted stock count for SKU " + product);
  }

  @PostMapping("/count/{id}/approve")
  @Transactional
  void approve(
    @PathVariable long id,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    role(u, "ADMIN");
    var c = s.one("select * from stock_count where id=? for update", id);
    if (
      !"SUPER_ADMIN".equals(u.get("role")) &&
      !u.get("branch").equals(c.get("branch"))
    ) throw fail(403, "Different branch");
    if (
      c.get("creator").equals(u.get("id")) || c.get("approver") != null
    ) throw fail(409, "An independent manager must approve a pending count");
    if (
      s.db.update(
        "update stock set on_hand=?,damaged=?,display_units=? where product_id=? and branch=? and on_hand=? and damaged=? and display_units=? and held<=?",
        c.get("sellable"),
        c.get("damaged"),
        c.get("display_units"),
        c.get("product_id"),
        c.get("branch"),
        c.get("baseline"),
        c.get("baseline_damaged"),
        c.get("baseline_display"),
        c.get("sellable")
      ) != 1
    ) throw fail(409, "Stock changed. Submit a fresh count.");
    s.db.update(
      "update stock_count set approver=? where id=?",
      u.get("id"),
      id
    );
    s.audit(null, u.get("id"), "Approved stock count #" + id);
  }

  @PostMapping("/product/{id}")
  @Transactional
  void priceChange(
    @PathVariable long id,
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    role(u, "SUPER_ADMIN");
    var old=(java.math.BigDecimal)s.one("select price from product where id=? for update",id).get("price");
    var next = Store.price(b.get("price"));
    if (next.signum() <= 0) throw fail(400, "Enter positive price");
    if (
      s.db.update(
        "update product set price=?,cost=?,warranty=? where id=?",
        next,
        Store.price(b.get("cost")),
        req(b, "warranty", 150),
        id
      ) != 1
    ) throw fail(404, "Unknown SKU");
    ShoppingTools.changed(s,id,old,next);
    s.audit(null, u.get("id"), "Changed price for SKU " + id + " to " + next);
  }
}
