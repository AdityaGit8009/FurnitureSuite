package in.apsp.suite;

import static in.apsp.suite.Store.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/shop-tools")
class ShoppingTools {

  final Store s;

  ShoppingTools(Store s) {
    this.s = s;
  }

  static LocalDateTime time(Map<String, Object> b, String key) {
    try {
      return LocalDateTime.parse(req(b, key, 30));
    } catch (java.time.format.DateTimeParseException x) {
      throw fail(400, "Choose a valid local delivery time");
    }
  }

  @GetMapping("/windows")
  List<Map<String, Object>> windows(
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    Experience.manage(u);
    return Experience.owner(u)
      ? s.rows("select * from delivery_window order by starts desc")
      : s.rows(
          "select * from delivery_window where branch=? order by starts desc",
          u.get("branch")
        );
  }

  @PostMapping("/windows")
  @Transactional
  void window(
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    Experience.manage(u);
    String br = branch(b);
    Experience.scope(u, br);
    LocalDateTime start = time(b, "start"),
      end = time(b, "end");
    if (
      !start.isAfter(LocalDateTime.now()) ||
      !end.isAfter(start) ||
      end.isAfter(start.plusHours(24))
    ) throw fail(400, "Choose a future delivery window up to one day long");
    s.db.update(
      "insert into delivery_window(branch,starts,ends,capacity) values(?,?,?,?)",
      br,
      start,
      end,
      qty(b.get("capacity"))
    );
    s.audit(null, u.get("id"), "Added delivery window at " + br);
  }

  @PostMapping("/windows/{slot}/close")
  @Transactional
  void close(
    @PathVariable long slot,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    Experience.scope(
      u,
      s.one("select branch from delivery_window where id=?", slot).get("branch")
    );
    s.db.update("update delivery_window set active=false where id=?", slot);
    s.audit(null, u.get("id"), "Closed delivery window " + slot);
  }

  static void reserve(Store s, long order, String branch, Object slot) {
    if (slot == null || slot.toString().isBlank()) return;
    long key = id(slot);
    if (
      s.db.update(
        "update delivery_window set booked=booked+1 where id=? and branch=? and active and starts>current_timestamp and booked<capacity",
        key,
        branch
      ) != 1
    ) throw fail(
      409,
      "Delivery window is full or unavailable. Choose another."
    );
    s.db.update(
      "insert into delivery_booking(work_id,slot_id) values(?,?)",
      order,
      key
    );
  }

  static void release(Store s, long order) {
    s.db.update(
      "update delivery_window set booked=booked-1 where id=(select slot_id from delivery_booking where work_id=? and active)",
      order
    );
    s.db.update(
      "update delivery_booking set active=false where work_id=?",
      order
    );
  }

  @PostMapping("/watch/{product}")
  @Transactional
  void watch(
    @PathVariable long product,
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    if (!"CUSTOMER".equals(u.get("role"))) throw fail(
      403,
      "Use a customer account"
    );
    var p = s.one("select price from product where id=? for update", product);
    var target = price(b.get("price"));
    if (
      target.signum() <= 0 || target.compareTo((BigDecimal) p.get("price")) >= 0
    ) throw fail(400, "Choose a positive target below the current price");
    s.db.update(
      "merge into price_watch key(actor,product_id) values(?,?,?)",
      u.get("id"),
      product,
      target
    );
  }

  @GetMapping("/watches")
  List<Map<String, Object>> watches(
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    return s.rows(
      "select p.id,p.name,p.price,w.target from price_watch w join product p on p.id=w.product_id where actor=? order by p.name",
      u.get("id")
    );
  }

  @PostMapping("/watch/{product}/remove")
  void remove(
    @PathVariable long product,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    s.db.update(
      "delete from price_watch where actor=? and product_id=?",
      u.get("id"),
      product
    );
  }

  static void changed(Store s, long id, BigDecimal old, BigDecimal next) {
    if (old.compareTo(next) == 0) return;
    s.db.update(
      "insert into price_history(product_id,previous_price,new_price) values(?,?,?)",
      id,
      old,
      next
    );
    if (next.compareTo(old) < 0) {
      String name = (String) s
        .one("select name from product where id=?", id)
        .get("name");
      s.db.update(
        "insert into inbox(person_id,message,notice_kind) select actor,?,'PRICE_ALERT' from price_watch where product_id=? and target>=?",
        name + " has reached your target. Current price: INR " + next,
        id,
        next
      );
      s.db.update(
        "delete from price_watch where product_id=? and target>=?",
        id,
        next
      );
    }
  }
}
