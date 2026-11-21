package in.apsp.suite;

import static in.apsp.suite.Store.*;

import java.util.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.ObjectMapper;

/** Storefront publishing and typed extensions. Published content is data rendered by React. */
@RestController
@RequestMapping("/api/studio")
class Experience {

  final Store s;
  final ObjectMapper json;

  Experience(Store s, ObjectMapper json) {
    this.s = s;
    this.json = json;
  }

  static boolean owner(Map<String, Object> u) {
    return "SUPER_ADMIN".equals(u.get("role"));
  }

  static void manage(Map<String, Object> u) {
    role(u, "ADMIN");
  }

  static void scope(Map<String, Object> u, Object branch) {
    manage(u);
    if (!owner(u) && !u.get("branch").equals(branch)) throw fail(
      403,
      "Different branch"
    );
  }

  static void version(Map<String, Object> row, Map<String, Object> b) {
    if (id(row.get("version")) != id(b.get("version"))) throw fail(
      409,
      "Another editor changed this record. Reload before saving."
    );
  }

  String blockJson(Map<String, Object> b) {
    if (
      !(b.get("blocks") instanceof List<?> list) ||
      list.isEmpty() ||
      list.size() > 20
    ) throw fail(400, "Use 1 to 20 sections");
    var clean = new ArrayList<Map<String, String>>();
    for (Object v : list) {
      if (!(v instanceof Map<?, ?> m)) throw fail(400, "Invalid section");
      String type = Objects.toString(m.get("type"), ""),
        heading = Objects.toString(m.get("heading"), "").trim(),
        text = Objects.toString(m.get("text"), "").trim(),
        option = Objects.toString(m.get("option"), "").trim(),
        align = Objects.toString(m.get("align"), "left");
      if(!Set.of("left","center","right").contains(align)) throw fail(400,"Choose left, centre or right text alignment");
      if (
        !List.of(
          "hero",
          "text",
          "faq",
          "collection",
          "contact",
          "action"
        ).contains(type) ||
        heading.isEmpty() ||
        heading.length() > 130 ||
        text.length() > 1800 ||
        option.length() > 90
      ) throw fail(400, "Check section type, heading and length");
      if (
        type.equals("hero") &&
        !List.of("room", "sofa", "chair", "bed", "dining", "lounge").contains(
          option
        )
      ) throw fail(400, "Select a studio image");
      if (
        type.equals("action") &&
        !List.of("quote", "shop", "contact", "planner").contains(option)
      ) throw fail(400, "Choose a supported action");
      var section=new LinkedHashMap<>(Map.of("type",type,"heading",heading,"text",text,"option",option));
      if(!align.equals("left")) section.put("align",align);
      clean.add(section);
    }
    String encoded = json.writeValueAsString(clean);
    if (encoded.length() > 30000) throw fail(400, "Page is too large");
    return encoded;
  }

  Map<String, Object> storefront() {
    var modules = s.rows(
      "select id,title,kind,description,config from studio_module where enabled order by id"
    );
    for (var m : modules)
      if ("POLL".equals(m.get("kind"))) m.put(
        "results",
        s.rows(
          "select choice,count(*) votes from poll_vote where module_id=? group by choice",
          m.get("id")
        )
      );
    var flags = s.rows("select * from experience_flag order by code");
    return Map.of(
      "pages",
      s.rows(
        "select slug,branch,live_title title,live_blocks blocks from site_page where live_version is not null order by id"
      ),
      "slots",
      s.rows(
        "select id,branch,starts,ends,capacity-booked remaining from delivery_window where active and starts>current_timestamp and booked<capacity order by starts"
      ),
      "prices",
      s.rows(
        "select product_id,previous_price,new_price,changed from price_history order by id desc fetch first 300 rows only"
      ),
      "modules",
      modules,
      "flags",
      flags,
      "questions",
      enabled("QUESTIONS")
        ? s.rows(
            "select id,product_id,question,answer from product_question where answer is not null order by id desc fetch first 300 rows only"
          )
        : List.of(),
      "trending",
      enabled("DISCOVERY")
        ? s.rows(
            "select w.branch,i.product_id,sum(i.qty) units from item i join work w on w.id=i.work_id where i.product_id is not null and w.kind='ORDER' and w.stage<>'CANCELLED' and w.created_at>=dateadd(day,-30,current_timestamp) group by w.branch,i.product_id order by units desc,i.product_id"
          )
        : List.of()
    );
  }

  boolean enabled(String code) {
    return Boolean.TRUE.equals(
      s
        .one("select enabled from experience_flag where code=?", code)
        .get("enabled")
    );
  }

  List<Map<String, Object>> scoped(
    String select,
    String alias,
    Map<String, Object> u
  ) {
    return owner(u)
      ? s.rows(select + " order by " + alias + ".id desc")
      : s.rows(
          select +
            " where " +
            alias +
            ".branch=? order by " +
            alias +
            ".id desc",
          u.get("branch")
        );
  }

  @GetMapping("/manage")
  Map<String, Object> manageData(
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    manage(u);
    return Map.of(
      "pages",
      scoped("select * from site_page p", "p", u),
      "flags",
      s.rows("select * from experience_flag order by code"),
      "modules",
      owner(u)
        ? s.rows("select * from studio_module order by id desc")
        : List.of(),
      "entries",
      scoped(
        "select e.*,m.title,p.display_name customer from studio_entry e join studio_module m on e.module_id=m.id join person p on p.id=e.actor",
        "e",
        u
      ),
      "questions",
      scoped(
        "select q.*,p.name product from product_question q join product p on p.id=q.product_id",
        "q",
        u
      )
    );
  }

  @PostMapping("/pages")
  @Transactional
  Map<String, Object> savePage(
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    manage(u);
    String title = req(b, "title", 120),
      blocks = blockJson(b);
    long page;
    if (b.get("id") == null) {
      String slug = req(b, "slug", 80);
      if (!slug.matches("[a-z0-9]+(-[a-z0-9]+)*")) throw fail(
        400,
        "Use a lowercase URL slug with hyphens"
      );
      String branch =
        owner(u) && "All".equals(b.get("branch")) ? "All" : branch(b);
      scope(u, branch);
      page = s.add(
        "insert into site_page(branch,slug,title,blocks) values(?,?,?,?)",
        branch,
        slug,
        title,
        blocks
      );
    } else {
      page = id(b.get("id"));
      var row = s.one("select * from site_page where id=? for update", page);
      scope(u, row.get("branch"));
      version(row, b);
      s.db.update(
        "update site_page set title=?,blocks=?,version=version+1,updated_at=current_timestamp where id=?",
        title,
        blocks,
        page
      );
    }
    s.audit(null, u.get("id"), "Saved page draft #" + page);
    return s.one("select * from site_page where id=?", page);
  }

  @PostMapping("/pages/{page}/{action}")
  @Transactional
  Map<String, Object> publish(
    @PathVariable long page,
    @PathVariable String action,
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    manage(u);
    var row = s.one("select * from site_page where id=? for update", page);
    scope(u, row.get("branch"));
    version(row, b);
    switch (action) {
      case "publish" -> {
        s.db.update(
          "insert into page_history(page_id,revision,title,blocks) values(?,?,?,?)",
          page,
          row.get("version"),
          row.get("title"),
          row.get("blocks")
        );
        s.db.update(
          "update site_page set live_title=title,live_blocks=blocks,live_version=version,version=version+1 where id=?",
          page
        );
      }
      case "unpublish" -> s.db.update(
        "update site_page set live_version=null,live_title=null,live_blocks=null,version=version+1 where id=?",
        page
      );
      case "restore" -> {
        var rev = s.one(
          "select * from page_history where page_id=? and revision=?",
          page,
          id(b.get("revision"))
        );
        s.db.update(
          "update site_page set title=?,blocks=?,version=version+1 where id=?",
          rev.get("title"),
          rev.get("blocks"),
          page
        );
      }
      default -> throw fail(400, "Unknown publishing action");
    }
    s.audit(null, u.get("id"), action + " page #" + page);
    return s.one("select * from site_page where id=?", page);
  }

  @GetMapping("/pages/{page}/history")
  List<Map<String, Object>> history(
    @PathVariable long page,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    scope(
      u,
      s.one("select branch from site_page where id=?", page).get("branch")
    );
    return s.rows(
      "select revision,title,created_at from page_history where page_id=? order by revision desc",
      page
    );
  }

  @PostMapping("/flags/{code}")
  @Transactional
  void flag(
    @PathVariable String code,
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    role(u, "SUPER_ADMIN");
    if (
      s.db.update(
        "update experience_flag set enabled=? where code=?",
        Boolean.TRUE.equals(b.get("enabled")),
        code
      ) != 1
    ) throw fail(404, "Unknown feature");
    s.audit(null, u.get("id"), code + " enabled=" + b.get("enabled"));
  }

  @PostMapping("/modules")
  @Transactional
  void module(
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    role(u, "SUPER_ADMIN");
    String kind = req(b, "kind", 24),
      title = req(b, "title", 110),
      desc = str(b, "description", 500);
    if (!Set.of("POLL", "REQUEST", "SHELF").contains(kind)) throw fail(
      400,
      "Unknown module type"
    );
    if (
      !(b.get("options") instanceof List<?> l) ||
      l.isEmpty() ||
      l.size() > 12 ||
      (kind.equals("POLL") && l.size() < 2)
    ) throw fail(400, "Enter the module options");
    var opts = new LinkedHashSet<String>();
    for (Object o : l) {
      String v = Objects.toString(o, "").strip();
      if (v.isBlank() || v.length() > 100 || !opts.add(v)) throw fail(
        400,
        "Use distinct, nonempty options"
      );
      if (kind.equals("SHELF")) s.one("select id from product where sku=?", v);
    }
    long k = s.add(
      "insert into studio_module(title,kind,description,config,enabled) values(?,?,?,?,?)",
      title,
      kind,
      desc,
      json.writeValueAsString(opts),
      Boolean.TRUE.equals(b.get("enabled"))
    );
    s.audit(null, u.get("id"), "Created experience module #" + k);
  }

  @PostMapping("/modules/{module}/toggle")
  @Transactional
  void toggle(
    @PathVariable long module,
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    role(u, "SUPER_ADMIN");
    var row = s.one(
      "select * from studio_module where id=? for update",
      module
    );
    version(row, b);
    s.db.update(
      "update studio_module set enabled=?,version=version+1 where id=?",
      Boolean.TRUE.equals(b.get("enabled")),
      module
    );
    s.audit(null, u.get("id"), "Updated visibility of module #" + module);
  }

  @PostMapping("/modules/{module}/submit")
  @Transactional
  void submit(
    @PathVariable long module,
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    if (!"CUSTOMER".equals(u.get("role"))) throw fail(
      403,
      "Use a customer account"
    );
    var m = s.one(
      "select * from studio_module where id=? and enabled for update",
      module
    );
    var options = json.readValue((String) m.get("config"), String[].class);
    if ("POLL".equals(m.get("kind"))) {
      String choice = req(b, "choice", 100);
      if (!Arrays.asList(options).contains(choice)) throw fail(
        400,
        "Unknown choice"
      );
      s.db.update(
        "merge into poll_vote key(module_id,actor) values(?,?,?)",
        module,
        u.get("id"),
        choice
      );
    } else if ("REQUEST".equals(m.get("kind"))) {
      if (!(b.get("answers") instanceof Map<?, ?> input)) throw fail(
        400,
        "Complete the form"
      );
      Map<String, String> data = new LinkedHashMap<>();
      for (String opt : options) {
        String v = Objects.toString(input.get(opt), "").strip();
        if (v.isBlank() || v.length() > 450) throw fail(
          400,
          "Complete each field (450 characters maximum)"
        );
        data.put(opt, v);
      }
      s.db.update(
        "insert into studio_entry(module_id,actor,branch,answers) values(?,?,?,?)",
        module,
        u.get("id"),
        branch(b),
        json.writeValueAsString(data)
      );
    } else throw fail(400, "This feature is a product shelf");
  }

  @PostMapping("/entries/{entry}")
  @Transactional
  void triage(
    @PathVariable long entry,
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    manage(u);
    var row = s.one("select * from studio_entry where id=? for update", entry);
    scope(u, row.get("branch"));
    String next = req(b, "stage", 24);
    if (
      !(
        ("NEW".equals(row.get("stage")) && "IN_REVIEW".equals(next)) ||
        ("IN_REVIEW".equals(row.get("stage")) && "DONE".equals(next))
      )
    ) throw fail(409, "Request has changed");
    s.db.update("update studio_entry set stage=? where id=?", next, entry);
    s.audit(null, u.get("id"), "Service request #" + entry + " " + next);
  }

  @GetMapping("/mine")
  List<Map<String, Object>> mine(
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    return s.rows(
      "select e.id,e.stage,e.branch,m.title from studio_entry e join studio_module m on e.module_id=m.id where e.actor=? order by e.id desc",
      u.get("id")
    );
  }

  @PostMapping("/questions/{product}")
  @Transactional
  void ask(
    @PathVariable long product,
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    if (!enabled("QUESTIONS")) throw fail(409, "Product questions are off");
    if (!"CUSTOMER".equals(u.get("role"))) throw fail(
      403,
      "Use a customer account"
    );
    s.one("select id from product where id=?", product);
    s.db.update(
      "insert into product_question(product_id,actor,branch,question) values(?,?,?,?)",
      product,
      u.get("id"),
      branch(b),
      req(b, "question", 450)
    );
  }

  @PostMapping("/answers/{question}")
  @Transactional
  void answer(
    @PathVariable long question,
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    manage(u);
    scope(
      u,
      s
        .one("select branch from product_question where id=?", question)
        .get("branch")
    );
    s.db.update(
      "update product_question set answer=? where id=?",
      req(b, "answer", 1800),
      question
    );
    s.audit(null, u.get("id"), "Answered product question #" + question);
  }
}
