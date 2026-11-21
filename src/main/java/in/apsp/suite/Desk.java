package in.apsp.suite;

import static in.apsp.suite.Store.*;

import java.math.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class Desk {

  final Store s;

  Desk(Store s) {
    this.s = s;
  }

  long make(
    String kind,
    String stage,
    String title,
    Object person,
    Object actor,
    String branch,
    Object parent,
    String detail,
    BigDecimal amount
  ) {
    long k = s.add(
      "insert into work(kind,stage,title,person_id,creator,branch,parent_id,detail,amount) values(?,?,?,?,?,?,?,?,?)",
      kind,
      stage,
      title,
      person,
      actor,
      branch,
      parent,
      detail,
      amount
    );
    s.audit(k, actor, "Created · " + stage);
    if (Set.of("ORDER", "LEAD").contains(kind)) {
      String event = kind.equals("ORDER") ? "Order" : "Enquiry";
      s.db.update(
        "insert into inbox(person_id,message,work_id) select id,?,? from person where active and role='SUPER_ADMIN'",
        "New " + event.toLowerCase(Locale.ROOT) + " #" + k + " at " + branch,
        k
      );
      if (person != null) s.db.update(
        "insert into inbox(person_id,message,work_id) select id,?,? from person where id=? and role='CUSTOMER'",
        "Your " +
          event.toLowerCase(Locale.ROOT) +
          " #" +
          k +
          " has been received at " +
          branch,
        k,
        person
      );
    }
    return k;
  }

  Map<String, Object> get(long n, Map<String, Object> u, boolean lock) {
    var w = s.one(
      "select * from work where id=?" + (lock ? " for update" : ""),
      n
    );
    if (!Flows.visible(u, w)) throw fail(
      403,
      "This record is outside your access"
    );
    if (lock && (Boolean.FALSE.equals(w.get("enabled")) || Boolean.TRUE.equals(w.get("archived")))) throw fail(409,"Enable or restore this record before changing it");
    return w;
  }

  String location(Map<String, Object> b, Map<String, Object> u) {
    return permit(u, "CUSTOMER") ? branch(b) : u.get("branch").toString();
  }

  Object customer(Map<String, Object> b, Map<String, Object> u) {
    if (
      permit(u, "CUSTOMER") && !"SUPER_ADMIN".equals(u.get("role"))
    ) return u.get("id");
    String email = str(b, "customerEmail", 200);
    if (email.isBlank()) return null;
    return s
      .one("select id from person where email=? and role='CUSTOMER'", email)
      .get("id");
  }

  List<Map<String, Object>> lines(long k) {
    return s.rows("select * from item where work_id=? order by id", k);
  }

  BigDecimal balance(long k) {
    return (BigDecimal) s
      .one(
        "select coalesce(sum(amount),0) as paid from money where work_id=?",
        k
      )
      .get("paid");
  }

  BigDecimal outstanding(long k) {
    BigDecimal credits = (BigDecimal) s
      .one(
        "select coalesce(sum(amount),0) as credits from work where parent_id=? and kind='RETURN' and stage='REFUNDED'",
        k
      )
      .get("credits");
    return (
      (BigDecimal) s.one("select amount from work where id=?", k).get("amount")
    )
      .subtract(credits)
      .subtract(balance(k));
  }

  void reserve(long p, String branch, int q) {
    if (
      s.db.update(
        "update stock set held=held+? where product_id=? and branch=? and on_hand-held>=?",
        q,
        p,
        branch,
        q
      ) != 1
    ) throw fail(409, "Insufficient available stock");
  }

  @Transactional
  long create(Map<String, Object> b, Map<String, Object> u) {
    String kind = req(b, "kind", 24),
      branch = location(b, u),
      detail = str(b, "detail", 2300);
    Object actor = u.get("id"),
      person = customer(b, u);
    String title = str(b, "title", 180);
    BigDecimal zero = BigDecimal.ZERO;
    if ("ORDER".equals(kind)) {
      role(u, "CUSTOMER", "ADMIN", "CASHIER", "SALES");
      String token = str(b, "requestKey", 80);
      if (!token.isBlank()) {
        s.one("select id from person where id=? for update", actor);
        var existing = s.rows(
          "select work_id from checkout_key where person_id=? and request_key=?",
          actor,
          token
        );
        if (!existing.isEmpty()) return id(existing.get(0).get("work_id"));
      }
      String address = req(b, "detail", 1500),
        pin = req(b, "pincode", 6);
      if (!pin.matches("[1-9][0-9]{5}")) throw fail(
        400,
        "Enter a six-digit pincode"
      );
      var config = s.rows("select * from setting");
      String prefix = cfg(config, "delivery_prefix");
      if (!pin.startsWith(prefix)) throw fail(400, "Outside the delivery area");
      String coupon = str(b, "coupon", 60);
      BigDecimal pct = zero;
      if (!coupon.isBlank()) {
        if (!coupon.equalsIgnoreCase(cfg(config, "coupon_code"))) throw fail(
          400,
          "Invalid coupon"
        );
        pct = price(cfg(config, "coupon_pct"));
      }
      BigDecimal extras = (
        Boolean.TRUE.equals(b.get("assembly"))
          ? price(cfg(config, "assembly_fee"))
          : zero
      ).add(
        Boolean.TRUE.equals(b.get("carry"))
          ? price(cfg(config, "carry_fee"))
          : zero
      );
      if (
        !(b.get("items") instanceof List<?> cart) ||
        cart.isEmpty() ||
        cart.size() > 60
      ) throw fail(400, "Add at least one item");
      long k = make(
        kind,
        "CONFIRMED",
        "Furniture order",
        person,
        actor,
        branch,
        null,
        address + " · " + pin,
        zero
      );
      BigDecimal total = zero;
      for (Object raw : cart) {
        if (!(raw instanceof Map<?, ?> l)) throw fail(400, "Invalid cart");
        long p = id(l.get("productId"));
        int q = qty(l.get("qty"));
        s.one("select product_id from stock where product_id=? and branch=? for update", p, branch);
        var prod = s.one("select * from showroom_item where id=? and branch=? and published=true",p,branch);
        reserve(p, branch, q);
        var unit = ((BigDecimal) prod.get("price"))
          .multiply(BigDecimal.valueOf(100).subtract(pct))
          .movePointLeft(2)
          .setScale(2, RoundingMode.HALF_UP);
        s.db.update(
          "insert into item(work_id,product_id,name,qty,price,cost) values(?,?,?,?,?,?)",
          k,
          p,
          prod.get("name"),
          q,
          unit,
          prod.get("cost")
        );
        total = total.add(unit.multiply(BigDecimal.valueOf(q)));
      }
      BigDecimal fee =
        total.compareTo(price(cfg(config, "free_above"))) >= 0
          ? zero
          : price(cfg(config, "delivery_fee"));
      s.db.update(
        "update work set amount=?,payment_method=?,title=? where id=?",
        total.add(fee).add(extras),
        str(b,"paymentMethod",16).isEmpty()?"OFFLINE":str(b,"paymentMethod",16),
        "Furniture order #" + k,
        k
      );
      s.audit(
        k,
        actor,
        "Delivery fee INR " +
          fee +
          " · Assembly/carry INR " +
          extras +
          (coupon.isBlank() ? "" : " · Coupon " + coupon)
      );
      if(Boolean.TRUE.equals(b.get("includeFit")) && "CUSTOMER".equals(u.get("role"))) s.db.update("insert into order_fit(work_id,product_id,verdict,summary,checked_at) select distinct ?,df.product_id,case when df.packing_revision=coalesce(pp.revision,0) then df.verdict else 'RECHECK_PACKING' end,df.summary,df.checked_at from item i join delivery_fit df on df.product_id=i.product_id and df.person_id=? and df.branch=? left join packing_profile pp on pp.product_id=df.product_id and pp.branch=df.branch where i.work_id=?",k,person,branch,k);
      ShoppingTools.reserve(s,k,branch,b.get("deliverySlot"));
      if (!token.isBlank()) s.db.update(
        "insert into checkout_key values(?,?,?)",
        actor,
        token,
        k
      );
      return k;
    }
    if ("PURCHASE".equals(kind) || "TRANSFER".equals(kind)) {
      if (kind.equals("PURCHASE")) role(u, "PURCHASE", "ADMIN");
      else role(u, "WAREHOUSE", "ADMIN");
      var prod = s.one(
        "select * from product where id=?",
        id(b.get("productId"))
      );
      int q = qty(b.get("qty"));
      if (title.isBlank()) throw fail(
        400,
        "Enter supplier or transfer reference"
      );
      if (
        kind.equals("TRANSFER") &&
        (!branches.contains(detail) || detail.equals(branch))
      ) throw fail(400, "Choose a different destination branch");
      long k = make(
        kind,
        "REQUESTED",
        title,
        null,
        actor,
        branch,
        null,
        detail,
        ((BigDecimal) prod.get("cost")).multiply(BigDecimal.valueOf(q))
      );
      s.db.update(
        "insert into item(work_id,product_id,name,qty,price,cost) values(?,?,?,?,?,?)",
        k,
        prod.get("id"),
        prod.get("name"),
        q,
        prod.get("cost"),
        prod.get("cost")
      );
      return k;
    }
    if (
      "RETURN".equals(kind) || "REVIEW".equals(kind) || "TICKET".equals(kind)
    ) {
      role(u, "CUSTOMER", "SUPPORT", "ADMIN");
      long order = id(b.get("parentId"));
      var w = get(order, u, true);
      if (!"ORDER".equals(w.get("kind"))) throw fail(400, "Select an order");
      if (
        !kind.equals("TICKET") &&
        !Set.of("INSTALLED", "DELIVERED").contains(w.get("stage"))
      ) throw fail(409, "Delivery must be complete");
      if (detail.isBlank()) throw fail(400, "Please describe your request");
      BigDecimal amount = zero;
      Map<String, Object> line = null;
      int q = 0;
      if (kind.equals("RETURN")) {
        line = s.one(
          "select * from item where id=? and work_id=?",
          id(b.get("lineId")),
          order
        );
        q = qty(b.get("qty"));
        if (
          s.db.update(
            "update item set returned_qty=returned_qty+? where id=? and qty-returned_qty>=?",
            q,
            line.get("id"),
            q
          ) != 1
        ) throw fail(409, "Quantity exceeds eligible units");
        amount = ((BigDecimal) line.get("price")).multiply(
          BigDecimal.valueOf(q)
        );
      }
      long k = make(
        kind,
        kind.equals("RETURN")
          ? "REQUESTED"
          : kind.equals("REVIEW")
            ? "PENDING"
            : "OPEN",
        title.isBlank() ? kind + " for order #" + order : title,
        w.get("person_id"),
        actor,
        (String) w.get("branch"),
        order,
        detail,
        amount
      );
      if (line != null) s.db.update(
        "insert into return_line(work_id,item_id,quantity) values(?,?,?)",
        k,
        line.get("id"),
        q
      );
      return k;
    }
    String stage = switch (kind) {
      case "LEAD" -> {
        role(u, "CUSTOMER", "SALES", "ADMIN");
        yield "NEW";
      }
      case "CAMPAIGN" -> {
        role(u, "MARKETING", "ADMIN");
        yield "DRAFT";
      }
      case "VISIT" -> {
        role(u, "SALES", "DESIGNER", "ADMIN");
        yield "SCHEDULED";
      }
      default -> throw fail(400, "Unsupported workflow");
    };
    Object parent = null;
    if (kind.equals("VISIT")) {
      var lead = get(id(b.get("parentId")), u, true);
      if (!"LEAD".equals(lead.get("kind"))) throw fail(400, "Select a lead");
      parent = lead.get("id");
      person = lead.get("person_id");
      branch = (String) lead.get("branch");
    }
    if (title.isBlank()) throw fail(400, "Title is required");
    long k = make(
      kind,
      stage,
      title,
      person,
      actor,
      branch,
      parent,
      detail,
      zero
    );
    if ("LEAD".equals(kind)) {
      String source = str(b, "source", 100);
      if (source.isBlank()) source = "CUSTOMER".equals(u.get("role"))
        ? "Website"
        : "Showroom";
      BigDecimal budget = str(b, "budget", 25).isBlank()
        ? BigDecimal.ZERO
        : price(b.get("budget"));
      int days = str(b, "buyDays", 10).isBlank() ? 90 : qty(b.get("buyDays"));
      var reps = s.rows(
        "select p.id from person p left join work w on w.assignee=p.id and w.kind='LEAD' and w.enabled=true and w.archived=false and w.stage not in ('ACCEPTED','LOST') where (p.role='SALES' or exists(select 1 from staff_role sr where sr.person_id=p.id and sr.role='SALES')) and p.active and p.branch=? group by p.id order by count(w.id),p.id fetch first row only",
        branch
      );
      s.db.update(
        "update work set source=?,budget=?,buy_days=?,assignee=? where id=?",
        source,
        budget,
        days,
        reps.isEmpty() ? null : reps.get(0).get("id"),
        k
      );
    }
    if (!str(b, "due", 10).isEmpty()) s.db.update(
      "update work set due_date=? where id=?",
      date(b),
      k
    );
    return k;
  }

  static java.sql.Date date(Map<String, Object> b) {
    try {
      return java.sql.Date.valueOf(req(b, "due", 10));
    } catch (IllegalArgumentException e) {
      throw fail(400, "Enter a valid date");
    }
  }

  static String cfg(List<Map<String, Object>> list, String key) {
    return list
      .stream()
      .filter(x -> key.equals(x.get("name")))
      .findFirst()
      .orElseThrow()
      .get("val")
      .toString();
  }

  @Transactional
  void move(long k, Map<String, Object> b, Map<String, Object> u) {
    var w = get(k, u, true);
    String to = req(b, "to", 32),
      kind = (String) w.get("kind"),
      branch = (String) w.get("branch");
    Object actor = u.get("id");
    String note = str(b, "note", 1400);
    if (!Flows.actions(u, w).contains(to)) throw fail(
      409,
      "Transition is unavailable for this role or stage"
    );
    if (id(b.get("revision")) != id(w.get("revision"))) throw fail(
      409,
      "Record changed. Refresh and retry."
    );
    if (
      Set.of(
        "MEASURED",
        "QUOTED",
        "LOST",
        "REWORK",
        "DECLINED",
        "REFUND_APPROVED",
        "MATCHED",
        "INSTALLED",
        "DELIVERED",
        "RESOLVED"
      ).contains(to) &&
      note.isBlank()
    ) throw fail(
      400,
      "Add measurements, reference or reason in the action note"
    );
    if (kind.equals("LEAD") && to.equals("QUOTED")) {
      var cs = s.rows("select * from quote_calc where work_id=?", k);
      var a = price(b.get("amount"));
      if (!cs.isEmpty()) {
        var c = cs.get(0);
        if (!Boolean.TRUE.equals(c.get("approved"))) throw fail(
          409,
          "Manager must approve the discount"
        );
        var total = ((BigDecimal) c.get("materials"))
          .add((BigDecimal) c.get("labour"))
          .add((BigDecimal) c.get("freight"))
          .subtract((BigDecimal) c.get("discount"));
        if (a.compareTo(total) != 0) throw fail(
          409,
          "Quote must match the approved estimate of " + total
        );
      }
      if (a.signum() == 0) throw fail(400, "Quote must be positive");
      s.db.update("update work set amount=? where id=?", a, k);
    }
    if (kind.equals("LEAD") && to.equals("QUOTED")) s.db.update(
      "update work set valid_until=dateadd(day,30,current_date) where id=?",
      k
    );
    if (kind.equals("LEAD") && to.equals("ACCEPTED")) {
      if (
        w.get("valid_until") instanceof java.sql.Date until &&
        until.toLocalDate().isBefore(java.time.LocalDate.now())
      ) throw fail(409, "Request a fresh quote. This version has expired.");
      var a = (BigDecimal) w.get("amount");
      long order = make(
        "ORDER",
        "IN_PRODUCTION",
        "Custom · " + w.get("title"),
        w.get("person_id"),
        actor,
        branch,
        k,
        (String) w.get("detail"),
        a
      );
      s.db.update(
        "insert into item(work_id,name,qty,price,cost) values(?,?,1,?,0)",
        order,
        w.get("title"),
        a
      );
      make(
        "JOB",
        "AWAITING_ADVANCE",
        "Build · " + w.get("title"),
        w.get("person_id"),
        actor,
        branch,
        order,
        "Approved quote #" + k + " revision " + w.get("revision"),
        a
      );
    }
    if (kind.equals("ORDER")) {
      if (to.equals("CANCELLED") && balance(k).signum() != 0) throw fail(
        409,
        "Reconcile collected funds before cancellation"
      );
      for (var line : lines(k)) {
        Object product = line.get("product_id");
        if (to.equals("DISPATCHED")) {
          long remaining = id(line.get("qty")) - id(line.get("shipped"));
          if (product != null && remaining > 0) s.db.update(
            "update stock set on_hand=on_hand-?,held=held-? where product_id=? and branch=?",
            remaining,remaining,product,branch
          );
          s.db.update("update item set shipped=qty where id=?",line.get("id"));
        }
        if (to.equals("CANCELLED") && product != null) s.db.update(
          "update stock set held=held-? where product_id=? and branch=?",
          line.get("qty"),product,branch
        );
      }
    }
    if(kind.equals("ORDER") && to.equals("DELIVERED") && w.get("person_id")!=null) {
      s.db.update("update product_feedback set verified=true where verified=false and author=? and product_id in (select product_id from item where work_id=? and product_id is not null)",w.get("person_id"),k);
    }
    if(kind.equals("ORDER")&&to.equals("CANCELLED")) ShoppingTools.release(s,k);
    if (kind.equals("JOB")) {
      long order = id(w.get("parent_id"));
      if (
        to.equals("CUTTING") &&
        !s
          .rows(
            "select b.product_id from plan_material b where b.job_id=? and b.required_qty>(select coalesce(sum(i.qty),0) from item i where i.work_id=b.job_id and i.product_id=b.product_id)",
            k
          )
          .isEmpty()
      ) throw fail(409, "Issue all planned materials before cutting");
      if (to.equals("PLANNED") && balance(order).signum() <= 0) throw fail(
        409,
        "Record the customer advance on the linked order first"
      );
      if (to.equals("READY")) {
        s.db.update(
          "update work set stage='CONFIRMED',revision=revision+1 where id=?",
          order
        );
        s.audit(order, actor, "Workshop quality check passed");
      }
    }
    if (kind.equals("PURCHASE") || kind.equals("TRANSFER")) {
      var l = lines(k).get(0);
      Object p = l.get("product_id");
      int q = qty(l.get("qty"));
      if (
        kind.equals("PURCHASE") &&
        to.equals("MATCHED") &&
        price(b.get("invoiceAmount")).compareTo((BigDecimal) w.get("amount")) !=
          0
      ) throw fail(409, "Supplier invoice must match received order value");
      if (to.equals("APPROVED") && actor.equals(w.get("creator"))) throw fail(
        403,
        "A different manager must approve this request"
      );
      if (
        kind.equals("TRANSFER") &&
        to.equals("IN_TRANSIT") &&
        s.db.update(
          "update stock set on_hand=on_hand-? where product_id=? and branch=? and on_hand-held>=?",
          q,
          p,
          branch,
          q
        ) != 1
      ) throw fail(409, "Insufficient stock");
      if (to.equals("RECEIVED")) {
        String dest = kind.equals("TRANSFER")
          ? w.get("detail").toString()
          : branch;
        int count = kind.equals("TRANSFER") ? q : qty(b.get("qty"));
        int received = ((Number) l.get("received")).intValue();
        if (received + count > q) throw fail(
          409,
          "Receipt exceeds outstanding quantity"
        );
        s.db.update(
          "update item set received=received+? where id=?",
          count,
          l.get("id")
        );
        s.db.update(
          "update stock set on_hand=on_hand+? where product_id=? and branch=?",
          count,
          p,
          dest
        );
        note +=
          " · QC accepted " +
          count +
          " · GRN " +
          k +
          "-" +
          (received + count) +
          " · Lot " +
          str(b, "lot", 80) +
          " · Bin " +
          str(b, "bin", 80);
        if (received + count < q) to = "INSPECTING";
      }
    }
    if (kind.equals("RETURN")) {
      var l = s.one(
        "select r.*,i.product_id from return_line r join item i on i.id=r.item_id where r.work_id=?",
        k
      );
      if (to.equals("DECLINED")) s.db.update(
        "update item set returned_qty=returned_qty-? where id=?",
        l.get("quantity"),
        l.get("item_id")
      );
      if (
        to.equals("REFUND_APPROVED") &&
        Boolean.TRUE.equals(b.get("restock")) &&
        l.get("product_id") != null
      ) {
        s.db.update(
          "update stock set on_hand=on_hand+? where product_id=? and branch=?",
          l.get("quantity"),
          l.get("product_id"),
          branch
        );
        s.db.update("update return_line set restock=true where work_id=?", k);
      }
      if (to.equals("REFUNDED")) {
        long order = id(w.get("parent_id"));
        s.one("select id from work where id=? for update", order);
        BigDecimal refund = (BigDecimal) w.get("amount");
        if (balance(order).compareTo(refund) < 0) throw fail(
          409,
          "Refund exceeds collected funds"
        );
        s.db.update(
          "insert into money(work_id,actor,amount,ref) values(?,?,?,?)",
          order,
          actor,
          refund.negate(),
          req(b, "ref", 120)
        );
      }
    }
    if (kind.equals("ORDER") && to.equals("DELIVERED")) {
      Ledger.auto(
        s,
        w,
        actor,
        "Receivables",
        "Sales",
        (BigDecimal) w.get("amount"),
        "Delivered sale"
      );
      BigDecimal costs = lines(k)
        .stream()
        .map(x ->
          ((BigDecimal) x.get("cost")).multiply(
            BigDecimal.valueOf(id(x.get("qty")))
          )
        )
        .reduce(BigDecimal.ZERO, BigDecimal::add);
      Ledger.auto(
        s,
        w,
        actor,
        "Cost of sales",
        "Inventory",
        costs,
        "Delivered item cost"
      );
    }
    if (kind.equals("PURCHASE") && to.equals("MATCHED")) Ledger.auto(
      s,
      w,
      actor,
      "Inventory",
      "Payables",
      (BigDecimal) w.get("amount"),
      "Supplier invoice matched"
    );
    if (kind.equals("PURCHASE") && to.equals("PAID")) Ledger.auto(
      s,
      w,
      actor,
      "Payables",
      "Cash and bank",
      (BigDecimal) w.get("amount"),
      "Supplier payment"
    );
    if (kind.equals("RETURN") && to.equals("REFUNDED")) {
      Ledger.auto(
        s,
        w,
        actor,
        "Sales returns",
        "Receivables",
        (BigDecimal) w.get("amount"),
        "Return credit"
      );
      Ledger.auto(
        s,
        w,
        actor,
        "Receivables",
        "Cash and bank",
        (BigDecimal) w.get("amount"),
        "Refund paid"
      );
      var ret = s.one(
        "select r.restock,r.quantity,i.cost from return_line r join item i on i.id=r.item_id where r.work_id=?",
        k
      );
      if (Boolean.TRUE.equals(ret.get("restock"))) Ledger.auto(
        s,
        w,
        actor,
        "Inventory",
        "Cost of sales",
        ((BigDecimal) ret.get("cost")).multiply(
          BigDecimal.valueOf(id(ret.get("quantity")))
        ),
        "Saleable return"
      );
    }
    if (kind.equals("CAMPAIGN") && to.equals("ACTIVE")) s.db.update(
      "insert into inbox(person_id,message,work_id) select id,?,? from person where marketing=true and active=true and role='CUSTOMER' and branch=?",
      w.get("title") + " · " + w.get("detail"),
      k,
      branch
    );
    if (
      w.get("person_id") != null &&
      Set.of("LEAD", "ORDER", "TICKET", "RETURN", "VISIT").contains(kind)
    ) s.db.update(
      "insert into inbox(person_id,message,work_id) values(?,?,?)",
      w.get("person_id"),
      kind + " #" + k + " · " + to,
      k
    );
    if (to.equals("RECEIVED")) {
      for (var row : s.rows(
        "select r.* from restock r join stock st on r.branch=st.branch and r.product_id=st.product_id where st.on_hand>st.held"
      )) {
        s.db.update(
          "insert into inbox(person_id,message) values(?,?)",
          row.get("person_id"),
          "Item #" +
            row.get("product_id") +
            " is available at " +
            row.get("branch")
        );
        s.db.update(
          "delete from restock where person_id=? and product_id=? and branch=?",
          row.get("person_id"),
          row.get("product_id"),
          row.get("branch")
        );
      }
    }
    s.db.update(
      "update work set stage=?,revision=revision+1 where id=?",
      to,
      k
    );
    s.audit(
      k,
      actor,
      w.get("stage") + " → " + to + (note.isBlank() ? "" : " · " + note)
    );
  }

  @Transactional
  void collect(long k, Map<String, Object> b, Map<String, Object> u) {
    role(u, "ACCOUNTANT", "ADMIN", "CASHIER");
    var w = get(k, u, true);
    if (
      !"ORDER".equals(w.get("kind")) || "CANCELLED".equals(w.get("stage"))
    ) throw fail(409, "Choose an active order");
    var a = price(b.get("amount"));
    if (a.signum() <= 0 || a.compareTo(outstanding(k)) > 0) throw fail(
      409,
      "Collection exceeds balance or is zero"
    );
    s.db.update(
      "insert into money(work_id,actor,amount,ref) values(?,?,?,?)",
      k,
      u.get("id"),
      a,
      req(b, "ref", 120)
    );
    Ledger.auto(
      s,
      w,
      u.get("id"),
      "Cash and bank",
      "Receivables",
      a,
      "Customer collection"
    );
    s.audit(k, u.get("id"), "Collection recorded INR " + a);
  }
}
