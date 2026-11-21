package in.apsp.suite;

import static in.apsp.suite.Store.*;

import java.math.BigDecimal;
import java.util.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/catalog-admin")
class CatalogAdmin {

  final Store s;

  CatalogAdmin(Store s) {
    this.s = s;
  }

  static String scope(Map<String, Object> user, String branch) {
    role(user, "ADMIN");
    if (!branches.contains(branch)) throw fail(400, "Unknown showroom");
    if (
      !permit(user, "SUPER_ADMIN") && !branch.equals(user.get("branch"))
    ) throw fail(403, "Different showroom");
    return branch;
  }

  private static final String LISTINGS =
    "select v.*,coalesce(l.archived,false) archived from showroom_item v " +
    "left join catalog_listing l on l.product_id=v.id and l.branch=v.branch ";

  static Map<String, Object> lockListing(Store s, long product, String branch) {
    s.one("select product_id from stock where product_id=? and branch=? for update", product, branch);
    return s.one(LISTINGS + "where v.id=? and v.branch=?", product, branch);
  }

  static Map<String, Object> editableListing(Store s, long product, String branch) {
    var row = lockListing(s, product, branch);
    if (Boolean.TRUE.equals(row.get("archived"))) throw fail(409, "Restore this listing before editing it");
    return row;
  }

  @GetMapping
  List<Map<String, Object>> listings(
    @RequestParam String branch,
    @RequestAttribute("viewer") Map<String, Object> user
  ) {
    return s.rows(
      LISTINGS + "where v.branch=? order by v.name,v.sku",
      scope(user, branch)
    );
  }

  private record Fields(
    String name,
    String category,
    String finish,
    String dimensions,
    String warranty
  ) {
    static Fields from(Map<String, Object> b) {
      return new Fields(
        req(b, "name", 120),
        req(b, "category", 60),
        req(b, "finish", 120),
        req(b, "dimensions", 120),
        req(b, "warranty", 150)
      );
    }
  }

  @PostMapping
  @Transactional
  Map<String, Long> create(
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> user
  ) {
    String branch = scope(user, req(b, "branch", 60)),
      sku = req(b, "sku", 60).toUpperCase(Locale.ROOT);
    if (!sku.matches("[A-Z0-9][A-Z0-9._-]{1,59}")) throw fail(
      400,
      "Use a unique SKU of 2–60 letters, digits, dots, underscores or hyphens"
    );
    var f = Fields.from(b);
    var selling = price(b.get("price"));
    var cost = price(b.get("cost"));
    long onHand = id(b.get("onHand"));
    if (selling.signum() <= 0 || onHand < 0 || onHand > 1000000) throw fail(
      400,
      "Check selling price and opening stock"
    );
    String photo = req(b, "photo", 12);
    if (
      !Set.of("bed", "chair", "dining", "sofa", "lounge").contains(photo)
    ) throw fail(400, "Select a catalogue photo");
    long p = s.add(
      "insert into product(sku,name,category,finish,dimensions,price,cost,photo,warranty) values(?,?,?,?,?,?,?,?,?)",
      sku,
      f.name,
      f.category,
      f.finish,
      f.dimensions,
      selling,
      cost,
      "/images/" + photo + ".jpg",
      f.warranty
    );
    s.db.update(
      "insert into stock(product_id,branch,on_hand) values(?,?,?)",
      p,
      branch,
      onHand
    );
    s.audit(
      null,
      user.get("id"),
      "Created SKU " +
        sku +
        " in " +
        branch +
        " with " +
        onHand +
        " opening units"
    );
    return Map.of("id", p);
  }

  @GetMapping("/prices")
  List<Map<String, Object>> requests(
    @RequestParam String branch,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    return s.rows(
      "select r.*,p.sku from catalog_price_request r join product p on p.id=r.product_id where r.branch=? order by r.id desc fetch first 50 rows only",
      scope(u, branch)
    );
  }

  @PostMapping("/{product}/price-request")
  @Transactional
  void request(
    @PathVariable long product,
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    String branch = scope(u, req(b, "branch", 60));
    var p = s.one("select price from product where id=? for update", product);
    editableListing(s, product, branch);
    var next = price(b.get("price"));
    if (
      next.signum() <= 0 || next.compareTo((BigDecimal) p.get("price")) == 0
    ) throw fail(400, "Enter a new positive price");
    if (
      !s
        .rows(
          "select id from catalog_price_request where product_id=? and branch=? and stage='PENDING'",
          product,
          branch
        )
        .isEmpty()
    ) throw fail(409, "A price request is already pending");
    s.db.update(
      "insert into catalog_price_request(product_id,branch,current_price,proposed,reason,requester) values(?,?,?,?,?,?)",
      product,
      branch,
      p.get("price"),
      next,
      req(b, "reason", 250),
      u.get("id")
    );
    s.audit(null, u.get("id"), "Requested master price for SKU #" + product);
  }

  @PostMapping("/prices/{request}")
  @Transactional
  void decide(
    @PathVariable long request,
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    role(u, "SUPER_ADMIN");
    var r = s.one(
      "select * from catalog_price_request where id=? for update",
      request
    );
    String state = req(b, "stage", 15);
    if (
      !Set.of("APPROVED", "DECLINED").contains(state) ||
      !"PENDING".equals(r.get("stage"))
    ) throw fail(409, "Select a pending request");
    long product = id(r.get("product_id"));
    if (state.equals("APPROVED")) {
      var old = (BigDecimal) s
        .one("select price from product where id=? for update", product)
        .get("price");
      editableListing(s, product, (String) r.get("branch"));
      var next = (BigDecimal) r.get("proposed");
      if (old.compareTo((BigDecimal) r.get("current_price")) != 0) throw fail(
        409,
        "Master price changed. Decline and request the current price."
      );
      s.db.update("update product set price=? where id=?", next, product);
      ShoppingTools.changed(s, product, old, next);
    }
    s.db.update(
      "update catalog_price_request set stage=?,decider=? where id=?",
      state,
      u.get("id"),
      request
    );
    s.audit(null, u.get("id"), "Price request #" + request + " · " + state);
  }

  @PostMapping("/{product}")
  @Transactional
  void edit(
    @PathVariable long product,
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> user
  ) {
    String branch = scope(user, req(b, "branch", 60));
    var f = Fields.from(b);
    var previous = editableListing(s, product, branch);
    long rev = id(previous.get("listing_revision"));
    if (rev != id(b.get("revision"))) throw fail(
      409,
      "Listing changed. Reload and try again."
    );
    if (!(b.get("published") instanceof Boolean)) throw fail(
      400,
      "Choose a listing status"
    );
    s.db.update(
      "merge into catalog_listing(product_id,branch,name,category,finish,dimensions,warranty,published,revision) key(product_id,branch) values(?,?,?,?,?,?,?,?,?)",
      product,
      branch,
      f.name,
      f.category,
      f.finish,
      f.dimensions,
      f.warranty,
      b.get("published"),
      rev + 1
    );
    s.audit(
      null,
      user.get("id"),
      "Updated listing #" + product + " in " + branch
    );
  }
}
