package in.apsp.suite;

import static in.apsp.suite.Store.*;

import java.util.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
class ProductReviews {

  final Store s;
  final Desk desk;

  ProductReviews(Store s, Desk desk) {
    this.s = s;
    this.desk = desk;
  }

  @GetMapping("/catalog/products/{product}/reviews")
  Map<String, Object> published(
    @PathVariable long product,
    @RequestParam(defaultValue = "1") int page
  ) {
    if (page < 1 || page > 100000) throw fail(400, "Invalid review page");
    var summary = s.one(
      "select count(*) total,coalesce(avg(cast(f.stars as decimal(8,2))),0) average from product_feedback f join work w on w.id=f.work_id where f.product_id=? and w.stage='PUBLISHED' and w.enabled=true and w.archived=false",
      product
    );
    summary.put(
      "reviews",
      s.rows(
        "select w.title,w.detail,w.created_at,f.stars,f.verified,f.edited_by_staff from product_feedback f join work w on w.id=f.work_id where f.product_id=? and w.stage='PUBLISHED' and w.enabled=true and w.archived=false order by w.id desc offset ? rows fetch next 10 rows only",
        product,
        (page - 1) * 10
      )
    );
    return summary;
  }

  @GetMapping("/products/{product}/my-review")
  List<Map<String, Object>> mine(
    @PathVariable long product,
    @RequestAttribute("viewer") Map<String, Object> user
  ) {
    return s.rows(
      "select w.id,w.stage,w.revision,f.author_title title,f.author_body detail,f.stars,f.verified from product_feedback f join work w on w.id=f.work_id where f.product_id=? and f.author=? and w.enabled=true and w.archived=false",
      product,
      user.get("id")
    );
  }

  @PostMapping("/products/{product}/review")
  @Transactional
  Map<String, Object> save(
    @PathVariable long product,
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> user
  ) {
    if (!"CUSTOMER".equals(user.get("role"))) throw fail(
      403,
      "Sign in with a customer account to review a product"
    );
    Object author = user.get("id");
    int stars = qty(b.get("stars"));
    if (stars > 5) throw fail(400, "Choose 1 to 5 stars");
    String title = req(b, "title", 180),
      detail = req(b, "detail", 2000),
      branch = branch(b);
    s.one("select id from person where id=? for update", author);
    var orders = s.rows(
      "select w.id,w.branch from work w join item i on i.work_id=w.id where i.product_id=? and w.person_id=? and w.kind='ORDER' and w.stage in ('DELIVERED','INSTALLED') order by w.id desc fetch first row only",
      product,
      author
    );
    boolean verified = !orders.isEmpty();
    if (!verified) s.one(
      "select id from showroom_item where id=? and branch=? and published=true",
      product,
      branch
    );
    var existing = s.rows(
      "select f.work_id,w.enabled,w.archived from product_feedback f join work w on w.id=f.work_id where f.product_id=? and f.author=?",
      product,
      author
    );
    long version = id(b.get("revision"));
    long work;
    if (existing.isEmpty()) {
      if (version != 0) throw fail(409, "Reload your review");
      work = desk.make(
        "REVIEW",
        "PENDING",
        title,
        author,
        author,
        verified ? (String) orders.get(0).get("branch") : branch,
        verified ? orders.get(0).get("id") : null,
        detail,
        java.math.BigDecimal.ZERO
      );
      s.db.update(
        "insert into product_feedback(work_id,product_id,author,stars,author_title,author_body,verified) values(?,?,?,?,?,?,?)",
        work,
        product,
        author,
        stars,
        title,
        detail,
        verified
      );
    } else {
      var previous = existing.get(0);
      if (Boolean.FALSE.equals(previous.get("enabled")) || Boolean.TRUE.equals(previous.get("archived"))) {
        throw fail(409, "The showroom has closed this review for editing.");
      }
      work = id(previous.get("work_id"));
      if (
        s.db.update(
          "update work set title=?,detail=?,stage='PENDING',revision=revision+1,parent_id=coalesce(parent_id,?) where id=? and revision=? and enabled=true and archived=false",
          title,
          detail,
          verified ? orders.get(0).get("id") : null,
          work,
          version
        ) != 1
      ) throw fail(409, "Review changed. Reload before editing.");
      s.db.update(
        "update product_feedback set stars=?,author_title=?,author_body=?,verified=?,edited_by_staff=false where work_id=?",
        stars,
        title,
        detail,
        verified,
        work
      );
      s.audit(work, author, "Customer revised review; awaiting moderation");
    }
    return Map.of("id", work, "stage", "PENDING", "verified", verified);
  }

  @PostMapping("/reviews/{work}/moderate")
  @Transactional
  void moderate(
    @PathVariable long work,
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> user
  ) {
    role(user, "ADMIN");
    var row = desk.get(work, user, true);
    if (!"REVIEW".equals(row.get("kind"))) throw fail(400, "Select a review");
    String title = req(b, "title", 180),
      detail = req(b, "detail", 2000),
      stage = req(b, "stage", 20),
      reason = req(b, "reason", 350);
    if (!Set.of("PENDING", "PUBLISHED", "DECLINED").contains(stage)) throw fail(
      400,
      "Unknown review status"
    );
    if (
      s.db.update(
        "update work set title=?,detail=?,stage=?,revision=revision+1 where id=? and revision=?",
        title,
        detail,
        stage,
        work,
        id(b.get("revision"))
      ) != 1
    ) throw fail(409, "Review changed. Reload before moderating.");
    s.db.update(
      "update product_feedback set edited_by_staff=case when author_title=? and author_body=? then false else true end where work_id=?",
      title,
      detail,
      work
    );
    s.audit(
      work,
      user.get("id"),
      "Review moderation · " + stage + " · " + reason
    );
  }
}
