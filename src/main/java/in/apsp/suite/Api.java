package in.apsp.suite;

import static in.apsp.suite.Store.*;

import java.io.*;
import java.math.*;
import java.util.*;
import org.springframework.http.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api")
class Api {

  final Store s;
  final Desk desk;
  final Payments gateway;

  final ShopContact contact;

  final Experience experience;
  final TestCheckout sandbox;

  Api(
    Store s,
    Desk desk,
    Payments gateway,
    ShopContact contact,
    Experience experience,
    TestCheckout sandbox
  ) {
    this.sandbox = sandbox;
    this.experience = experience;
    this.contact = contact;
    this.s = s;
    this.desk = desk;
    this.gateway = gateway;
  }

  private String checkoutMode() {
    return gateway.enabled()
      ? "RAZORPAY_LIVE"
      : sandbox.configured()
        ? "RAZORPAY_TEST"
        : "OFFLINE";
  }

  @GetMapping("/catalog")
  Map<String, Object> catalog() {
    return Map.of(
      "checkoutMode",
      checkoutMode(),
      "experience",
      experience.storefront(),
      "contact",
      contact.publicDetails(),
      "products",
      s.rows(
        "select id,name,sku,category,finish,dimensions,price,photo,warranty,variant_family,branch,available from showroom_item where published=true order by id,branch"
      ),
      "settings",
      s.rows("select * from setting"),
      "reviews",
      s.rows(
        "select title,detail from work where kind='REVIEW' and stage='PUBLISHED' and enabled=true and archived=false order by id desc fetch first 30 rows only"
      )
    );
  }

  @GetMapping("/desk")
  Map<String, Object> workspace(
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    String role = (String) u.get("role");
    String where = role.equals("SUPER_ADMIN")
      ? "1=1"
      : role.equals("CUSTOMER")
        ? "person_id=?"
        : "(branch=? or (kind='TRANSFER' and detail=?))";
    Object[] args = role.equals("SUPER_ADMIN")
      ? new Object[0]
      : role.equals("CUSTOMER")
        ? new Object[] { u.get("id") }
        : new Object[] { u.get("branch"), u.get("branch") };
    var all = s
      .rows(
        "select w.*," + (permit(u, "ADMIN") ? AdminRecords.HISTORY + "," : "") +
          "p.display_name customer,a.display_name assigned_to,coalesce(m.collected,0) collected,coalesce(r.credits,0) return_credit," +
          "(select z.status from sandbox_order z where z.work_id=w.id order by z.created_at desc fetch first row only) test_status " +
          "from work w left join person p on p.id=w.person_id left join person a on a.id=w.assignee " +
          "left join (select work_id,sum(amount) collected from money group by work_id) m on m.work_id=w.id " +
          "left join (select parent_id,sum(amount) credits from work where kind='RETURN' and stage='REFUNDED' group by parent_id) r on r.parent_id=w.id where " +
          where
            .replace("person_id=?", "w.person_id=?")
            .replace("branch=?", "w.branch=?") +
          " order by w.id desc",
        args
      )
      .stream()
      .filter(w -> Flows.visible(u, w))
      .toList();
    Map<String, Object> m = new HashMap<>();
    if (permit(u, "ADMIN")) all.forEach(AdminRecords::describeActions);
    m.put("work", all);
    m.put(
      "wishlist",
      s.rows("select product_id from wishlist where person_id=?", u.get("id"))
    );
    m.put(
      "inbox",
      s.rows(
        "select i.message,i.created_at from inbox i left join work w on w.id=i.work_id where i.person_id=?" +
          (permit(u, "ADMIN") ? "" : " and (i.work_id is null or (w.enabled=true and w.archived=false))") +
          " order by i.id desc fetch first 50 rows only",
        u.get("id")
      )
    );
    if(role.equals("CUSTOMER")) m.put("fitProducts",s.rows("select product_id,branch from delivery_fit where person_id=?",u.get("id")));
    m.put("roles", Store.roles);
    if(StaffAccess.internal(role))m.put("assignedRoles",StaffAccess.granted(s,u.get("id")));
    m.put("branches", branches);
    m.put(
      "mfa",
      s
        .one(
          "select email_mfa enabled from person where id=?",
          u.get("id")
        )
        .get("enabled")
    );
    if (permit(u, "ADMIN")) m.put(
      "team",
      s.rows(
        "select id,display_name,email,role,branch,active,archived,auth_version from person where role<>'CUSTOMER' " +
          (role.equals("SUPER_ADMIN") ? "" : "and branch=?") +
          " order by id",
        role.equals("SUPER_ADMIN")
          ? new Object[0]
          : new Object[] { u.get("branch") }
      )
    );
    if (permit(u, "SUPER_ADMIN")) m.put(
      "audit",
      s.rows(
        "select j.id,j.created_at,j.work_id,j.action,p.display_name actor from journal j left join person p on p.id=j.actor order by j.id desc fetch first 150 rows only"
      )
    );
    if (permit(u, "ADMIN", "MARKETING")) m.put(
      "audience",
      s.rows(
        "select id,display_name,email from person where active and marketing and role='CUSTOMER' and branch=?",
        u.get("branch")
      )
    );
    return m;
  }

  @PostMapping("/wishlist/{id}")
  @Transactional
  void wish(
    @PathVariable long id,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    if (
      s.db.update(
        "delete from wishlist where product_id=? and person_id=?",
        id,
        u.get("id")
      ) == 0
    ) s.db.update("insert into wishlist values(?,?)", u.get("id"), id);
  }

  @PostMapping("/work")
  Map<String, Long> create(
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    if ("ORDER".equals(b.get("kind"))) {
      String method = str(b, "paymentMethod", 16);
      if (
        !method.isEmpty() &&
        !"OFFLINE".equals(method) &&
        (!method.equals(checkoutMode()) || !"CUSTOMER".equals(u.get("role")))
      ) throw fail(409, "Payment option unavailable. Refresh checkout.");
    }
    return Map.of("id", desk.create(b, u));
  }

  @GetMapping("/work/{id}")
  Map<String, Object> view(
    @PathVariable long id,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    var w = desk.get(id, u, false);
    var result = new HashMap<String, Object>();
    result.put("record", w);
    result.put(
      "booking",
      s.rows(
        "select d.starts,d.ends,b.active from delivery_booking b join delivery_window d on b.slot_id=d.id where b.work_id=?",
        id
      )
    );
    result.put("actions", Flows.actions(u, w));
    if("REVIEW".equals(w.get("kind"))) result.put("feedback",s.rows("select f.product_id,p.name,f.stars,f.verified,f.author_title,f.author_body,f.edited_by_staff from product_feedback f join product p on p.id=f.product_id where f.work_id=?",id));
    if ("JOB".equals(w.get("kind"))) result.put(
      "bom",
      s.rows(
        "select p.name,b.required_qty,st.on_hand-st.held available,coalesce((select sum(i.qty) from item i where i.work_id=b.job_id and i.product_id=b.product_id),0) issued from plan_material b join product p on p.id=b.product_id join stock st on st.product_id=p.id and st.branch=? where b.job_id=?",
        w.get("branch"),
        id
      )
    );
    if (
      "LEAD".equals(w.get("kind")) && !"CUSTOMER".equals(u.get("role"))
    ) result.put(
      "estimate",
      s.rows("select * from quote_calc where work_id=?", id)
    );
    var lines = desk.lines(id);
    if (!permit(u, "ADMIN", "ACCOUNTANT", "PURCHASE")) lines.forEach(l ->
      l.remove("cost")
    );
    result.put("items", lines);
    result.put(
      "payments",
      s.rows(
        "select amount,ref,created_at from money where work_id=? order by id",
        id
      )
    );
    result.put("paid", desk.balance(id));
    result.put("due", desk.outstanding(id));
    result.put("onlinePay", gateway.enabled());
    if ("ORDER".equals(w.get("kind"))) {
      result.put("checkoutMode", checkoutMode());
      result.put("deliveryFit",s.rows("select f.verdict,f.summary,f.checked_at,p.sku from order_fit f join product p on p.id=f.product_id where f.work_id=?",id));
      result.put(
        "testReceipts",
        s.rows(
          "select provider_order,amount_paise,status,payment_id,created_at from sandbox_order where work_id=? order by created_at desc",
          id
        )
      );
    }
    result.put(
      "events",
      s.rows(
        "select j.action,j.created_at,p.display_name actor from journal j left join person p on p.id=j.actor where work_id=? order by j.id desc",
        id
      )
    );
    result.put(
      "files",
      s.rows("select id,name from attachment where work_id=?", id)
    );
    result.put(
      "links",
      s
        .rows("select * from work where parent_id=? order by id", id)
        .stream()
        .filter(x -> Flows.visible(u, x))
        .toList()
    );
    return result;
  }

  @PostMapping("/work/{id}/test-checkout")
  @Transactional
  Map<String, Object> testCheckout(
    @PathVariable long id,
    @RequestAttribute("viewer") Map<String, Object> u
  ) throws Exception {
    if (!"CUSTOMER".equals(u.get("role"))) throw fail(
      403,
      "This checkout is for the purchasing customer"
    );
    var w = desk.get(id, u, true);
    if (!"RAZORPAY_TEST".equals(checkoutMode())) throw fail(
      409,
      "Test checkout is unavailable"
    );
    if (
      !"ORDER".equals(w.get("kind")) || "CANCELLED".equals(w.get("stage"))
    ) throw fail(409, "This order is not payable");
    long due = desk.outstanding(id).movePointRight(2).longValueExact();
    if (due <= 0) throw fail(409, "This order has no outstanding balance");
    var result = sandbox.purchase(u, id, due);
    s.db.update(
      "update work set payment_method='RAZORPAY_TEST' where id=?",
      id
    );
    return Payments.withCustomer(result, u);
  }

  @PostMapping("/work/{id}/move")
  void move(
    @PathVariable long id,
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    desk.move(id, b, u);
  }

  @PostMapping("/work/{id}/collect")
  void collect(
    @PathVariable long id,
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    desk.collect(id, b, u);
  }

  @PostMapping("/work/{id}/note")
  @Transactional
  void note(
    @PathVariable long id,
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    desk.get(id, u, true);
    s.audit(id, u.get("id"), req(b, "note", 1600));
  }

  @PostMapping("/work/{id}/schedule")
  @Transactional
  void schedule(
    @PathVariable long id,
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    role(u, "SALES", "ADMIN", "SUPPORT", "PRODUCTION");
    var w = desk.get(id, u, true);
    s.db.update("update work set due_date=?,revision=revision+1 where id=?", Desk.date(b), id);
    if (!str(b, "assignee", 25).isBlank()) {
      role(u, "ADMIN");
      long staff = Store.id(b.get("assignee"));
      var a = s.user(staff);
      if (
        !w.get("branch").equals(a.get("branch")) ||
        "CUSTOMER".equals(a.get("role"))
      ) throw fail(400, "Choose staff in the same branch");
      s.db.update("update work set assignee=? where id=?", staff, id);
    }
    s.audit(id, u.get("id"), "Scheduled for " + Desk.date(b));
  }

  @PostMapping("/work/{id}/revise")
  @Transactional
  void revise(
    @PathVariable long id,
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    role(u, "SALES", "ADMIN");
    var w = desk.get(id, u, true);
    if (
      !"LEAD".equals(w.get("kind")) || !"QUOTED".equals(w.get("stage"))
    ) throw fail(409, "Only open quotes can be revised");
    BigDecimal amount = price(b.get("amount"));
    if (amount.signum() <= 0) throw fail(400, "Enter positive price");
    if (
      !s.rows("select work_id from quote_calc where work_id=?", id).isEmpty()
    ) {
      role(u, "ADMIN");
      if (
        amount.compareTo((java.math.BigDecimal) w.get("amount")) < 0
      ) throw fail(
        409,
        "A lower costed quotation needs a new approved estimate"
      );
    }
    s.db.update(
      "update work set amount=?,revision=revision+1,valid_until=dateadd(day,30,current_date) where id=?",
      amount,
      id
    );
    s.audit(
      id,
      u.get("id"),
      "Revised quote INR " + amount + " · " + req(b, "note", 1000)
    );
  }

  @PostMapping("/work/{id}/materials")
  @Transactional
  void materials(
    @PathVariable long id,
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    role(u, "PRODUCTION", "ADMIN");
    var w = desk.get(id, u, true);
    if (
      !"JOB".equals(w.get("kind")) || !"PLANNED".equals(w.get("stage"))
    ) throw fail(409, "Issue materials during planning");
    long p = Store.id(b.get("productId"));
    int q = qty(b.get("qty"));
    if (
      s.db.update(
        "update stock set on_hand=on_hand-? where product_id=? and branch=? and on_hand-held>=?",
        q,
        p,
        w.get("branch"),
        q
      ) != 1
    ) throw fail(409, "Insufficient material");
    var product = s.one("select * from product where id=?", p);
    s.db.update(
      "insert into item(work_id,product_id,name,qty,price,cost) values(?,?,?,?,?,?)",
      id,
      p,
      product.get("name"),
      q,
      product.get("cost"),
      product.get("cost")
    );
    s.db.update(
      "update item set cost=cost+? where work_id=?",
      ((BigDecimal) product.get("cost")).multiply(BigDecimal.valueOf(q)),
      w.get("parent_id")
    );
    s.audit(id, u.get("id"), "Issued " + q + " × " + product.get("name"));
  }

  @PostMapping("/work/{id}/files")
  @Transactional
  void upload(
    @PathVariable long id,
    @RequestParam MultipartFile file,
    @RequestAttribute("viewer") Map<String, Object> u
  ) throws IOException {
    desk.get(id, u, true);
    byte[] data = file.getBytes();
    String type =
      data.length > 8 &&
      data[0] == (byte) 137 &&
      data[1] == 80 &&
      data[2] == 78 &&
      data[3] == 71
        ? "image/png"
        : data.length > 3 &&
            data[0] == (byte) 255 &&
            data[1] == (byte) 216 &&
            data[2] == (byte) 255
          ? "image/jpeg"
          : null;
    if (type == null || data.length > 5 * 1024 * 1024) throw fail(
      400,
      "Upload a PNG or JPEG up to 5 MB"
    );
    try (
      var input = javax.imageio.ImageIO.createImageInputStream(
        new java.io.ByteArrayInputStream(data)
      )
    ) {
      var readers = javax.imageio.ImageIO.getImageReaders(input);
      if (!readers.hasNext()) throw fail(400, "Unreadable image");
      var reader = readers.next();
      try {
        reader.setInput(input, true, true);
        if (
          (long) reader.getWidth(0) * reader.getHeight(0) > 12000000
        ) throw fail(400, "Image exceeds twelve megapixels");
        var clean = new ByteArrayOutputStream();
        javax.imageio.ImageIO.write(
          reader.read(0),
          type.equals("image/png") ? "png" : "jpeg",
          clean
        );
        data = clean.toByteArray();
        if (data.length > 5 * 1024 * 1024) throw fail(
          400,
          "Save a smaller image"
        );
      } finally {
        reader.dispose();
      }
    } catch (IOException ex) {
      throw fail(400, "Image could not be decoded");
    }
    String name = Objects.toString(
      file.getOriginalFilename(),
      "photo"
    ).replaceAll("[^a-zA-Z0-9._ -]", "_");
    s.db.update(
      "insert into attachment(work_id,actor,name,mime,bytes) values(?,?,?,?,?)",
      id,
      u.get("id"),
      name.substring(0, Math.min(145, name.length())),
      type,
      data
    );
    s.audit(id, u.get("id"), "Attached a photo");
  }

  @GetMapping("/files/{id}")
  ResponseEntity<byte[]> file(
    @PathVariable long id,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    var f = s.one("select work_id,name,mime from attachment where id=?", id);
    desk.get(Store.id(f.get("work_id")), u, false);
    return ResponseEntity.ok()
      .header(
        "Content-Disposition",
        "attachment; filename=\"" + f.get("name") + "\""
      )
      .contentType(MediaType.parseMediaType((String) f.get("mime")))
      .body(
        s.db.queryForObject(
          "select bytes from attachment where id=?",
          byte[].class,
          id
        )
      );
  }

  @PostMapping("/products")
  @Transactional
  void product(
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    role(u, "SUPER_ADMIN");
    BigDecimal price = price(b.get("price"));
    if (price.signum() <= 0) throw fail(400, "Price must be positive");
    long p = s.add(
      "insert into product(sku,name,category,finish,dimensions,price,cost,photo,warranty) values(?,?,?,?,?,?,?,?,?)",
      req(b, "sku", 60),
      req(b, "name", 120),
      req(b, "category", 60),
      req(b, "finish", 120),
      req(b, "dimensions", 120),
      price,
      price(b.get("cost")),
      "/images/room.jpg",
      str(b, "warranty", 150)
    );
    for (var branch : branches)
      s.db.update(
        "insert into stock(product_id,branch) values(?,?)",
        p,
        branch
      );
    s.audit(null, u.get("id"), "Created SKU " + p);
  }

  @PostMapping("/promotion")
  @Transactional
  void promotion(
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    role(u, "SUPER_ADMIN");
    var pct = price(b.get("coupon_pct"));
    if (pct.compareTo(java.math.BigDecimal.valueOf(90)) > 0) throw fail(
      400,
      "Maximum discount is 90%"
    );
    for (String key : List.of(
      "coupon_code",
      "coupon_pct",
      "assembly_fee",
      "carry_fee",
      "store_note"
    )) {
      String val = key.equals("coupon_code")
        ? str(b, key, 60)
        : key.equals("store_note")
          ? str(b, key, 250)
          : price(b.get(key)).toPlainString();
      s.db.update("merge into setting key(name) values(?,?)", key, val);
    }
    s.audit(null, u.get("id"), "Updated shop promotion and services");
  }

  @PostMapping("/settings")
  @Transactional
  void settings(
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    role(u, "SUPER_ADMIN");
    String prefix = str(b, "delivery_prefix", 6);
    if (!prefix.matches("[0-9]{0,6}")) throw fail(
      400,
      "Invalid pincode prefix"
    );
    for (String key : List.of("delivery_fee", "free_above", "delivery_prefix"))
      s.db.update(
        "update setting set val=? where name=?",
        key,
        key.equals("delivery_prefix")
          ? prefix
          : price(b.get(key)).toPlainString(),
        key
      );
    s.audit(null, u.get("id"), "Updated delivery pricing and service area");
  }
}
