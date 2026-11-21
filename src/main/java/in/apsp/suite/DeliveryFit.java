package in.apsp.suite;

import static in.apsp.suite.Store.*;

import java.math.BigDecimal;
import java.util.*;
import java.util.regex.Pattern;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
class DeliveryFit {

  final Store s;
  final Desk desk;

  DeliveryFit(Store s, Desk desk) {
    this.s = s;
    this.desk = desk;
  }

  private static final Pattern BOX = Pattern.compile(
    "^\\s*(\\d+(?:\\.\\d+)?)\\s*[x×]\\s*(\\d+(?:\\.\\d+)?)\\s*[x×]\\s*(\\d+(?:\\.\\d+)?)\\s*(?:cm)?\\s*$",
    Pattern.CASE_INSENSITIVE
  );

  record Box(double w, double d, double h) {
    static Box parse(String text) {
      var m = BOX.matcher(text);
      if (!m.matches()) throw fail(
        400,
        "Enter width x depth x height in cm on each line"
      );
      return new Box(
        measure(m.group(1), false),
        measure(m.group(2), false),
        measure(m.group(3), false)
      );
    }

    String size() {
      return fmt(w) + " × " + fmt(d) + " × " + fmt(h);
    }
  }

  static String fmt(double n) {
    return BigDecimal.valueOf(n).stripTrailingZeros().toPlainString();
  }

  static double measure(Object input, boolean zeroAllowed) {
    try {
      double n = Double.parseDouble(String.valueOf(input));
      if (
        !Double.isFinite(n) ||
        n > (zeroAllowed ? 50 : 1500) ||
        n < 0 ||
        (!zeroAllowed && n == 0)
      ) throw new NumberFormatException();
      double rounded = Math.round(n * 100.0) / 100.0;
      if (!zeroAllowed && rounded <= 0) throw new NumberFormatException();
      return rounded;
    } catch (NumberFormatException e) {
      throw fail(400, "Enter valid measurements in centimetres");
    }
  }

  static boolean flag(Map<String, ?> b, String key) {
    Object val = b.get(key);
    if (val == null) return false;
    if (val.equals(true) || val.equals("true")) return true;
    if (val.equals(false) || val.equals("false")) return false;
    throw fail(400, "Choose a valid option");
  }

  record Route(
    double doorW,
    double doorH,
    Box lift,
    double allowance,
    boolean turns
  ) {
    static Route read(Map<String, ?> b) {
      boolean elevator = flag(b, "useLift");
      double margin = measure(b.get("allowance"), true);
      return new Route(
        measure(b.get("doorWidth"), false),
        measure(b.get("doorHeight"), false),
        elevator
          ? new Box(
              measure(b.get("liftWidth"), false),
              measure(b.get("liftDepth"), false),
              measure(b.get("liftHeight"), false)
            )
          : null,
        margin,
        flag(b, "turns")
      );
    }

    String description() {
      return (
        "Narrowest opening " +
        fmt(doorW) +
        " × " +
        fmt(doorH) +
        " cm" +
        (lift == null ? "" : " · lift " + lift.size() + " cm") +
        " · clearance allowance " +
        fmt(allowance) +
        " cm" +
        (turns ? " · stairs or tight turns" : " · straight route")
      );
    }

    double clearance(Box b) {
      double space = Math.min(doorW - b.w, doorH - b.h);
      if (lift != null) space = Math.min(
        space,
        Math.min(lift.w - b.w, Math.min(lift.d - b.d, lift.h - b.h))
      );
      return Math.round((space - allowance) * 100.0) / 100.0;
    }
  }

  record Profile(
    String sku,
    long revision,
    boolean upright,
    List<Box> cartons
  ) {}

  private Profile profile(long product, String branch) {
    var p = s.one(
      "select sku,dimensions from showroom_item where id=? and branch=? and published=true",
      product,
      branch
    );
    var stored = s.rows(
      "select revision,cartons,upright from packing_profile where product_id=? and branch=?",
      product,
      branch
    );
    if (!stored.isEmpty()) {
      var row = stored.get(0);
      return new Profile(
        (String) p.get("sku"),
        id(row.get("revision")),
        Boolean.TRUE.equals(row.get("upright")),
        Arrays.stream(((String) row.get("cartons")).split("\\n"))
          .map(Box::parse)
          .toList()
      );
    }
    String size = (String) p.get("dimensions");
    List<Box> fallback = List.of();
    if (size != null && BOX.matcher(size).matches()) {
      try {
        fallback = List.of(Box.parse(size));
      } catch (
        org.springframework.web.server.ResponseStatusException ignored
      ) {}
    }
    return new Profile((String) p.get("sku"), 0, false, fallback);
  }

  record Attempt(String orientation, double margin) {}

  static Attempt best(Box box, Route route, boolean upright) {
    List<Box> positions = new ArrayList<>(
      List.of(box, new Box(box.d, box.w, box.h))
    );
    if (!upright) positions.addAll(
      List.of(
        new Box(box.w, box.h, box.d),
        new Box(box.h, box.w, box.d),
        new Box(box.d, box.h, box.w),
        new Box(box.h, box.d, box.w)
      )
    );
    Box winner = positions
      .stream()
      .max(Comparator.comparingDouble(route::clearance))
      .orElseThrow();
    return new Attempt(winner.size(), route.clearance(winner));
  }

  record Result(
    String verdict,
    String source,
    String route,
    List<Attempt> cartons,
    String summary,
    long revision
  ) {}

  private Result check(Profile p, Route route) {
    var boxes = p.cartons
      .stream()
      .map(c -> best(c, route, p.upright))
      .toList();
    boolean known = p.revision > 0;
    String source = known
      ? "Showroom carton measurements"
      : "Unpacked catalogue dimensions";
    String verdict =
      route.turns ||
      boxes.isEmpty() ||
      boxes.stream().anyMatch(c -> c.margin < 0)
        ? "MEASURE_ON_SITE"
        : known
          ? "CLEAR_ON_INPUTS"
          : "REFERENCE_ONLY";
    String delta = boxes
      .stream()
      .mapToDouble(Attempt::margin)
      .min()
      .stream()
      .mapToObj(n -> " · narrowest remaining clearance " + fmt(n) + " cm")
      .findFirst()
      .orElse("");
    return new Result(
      verdict,
      source,
      route.description(),
      boxes,
      p.sku + " · " + source + " · " + route.description() + delta,
      p.revision
    );
  }

  @GetMapping("/catalog/products/{product}/delivery-fit")
  Result preview(
    @PathVariable long product,
    @RequestParam Map<String, String> b
  ) {
    return check(profile(product, branch(b)), Route.read(b));
  }

  @GetMapping("/delivery-fit/{product}/saved")
  List<Map<String, Object>> saved(
    @PathVariable long product,
    @RequestParam String branch,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    return s.rows(
      "select df.verdict,df.summary,w.id lead_id,df.checked_at from delivery_fit df left join work w on w.id=df.lead_id and w.enabled=true and w.archived=false where df.person_id=? and df.product_id=? and df.branch=?",
      u.get("id"),
      product,
      branch
    );
  }

  @PostMapping("/delivery-fit/{product}/save")
  @Transactional
  Map<String, Object> save(
    @PathVariable long product,
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    if (!"CUSTOMER".equals(u.get("role"))) throw fail(
      403,
      "Sign in with a customer account"
    );
    String branch = branch(b);
    Object person = u.get("id");
    s.one("select id from person where id=? for update", person);
    var p = profile(product, branch);
    var result = check(p, Route.read(b));
    var previous = s.rows(
      "select lead_id,summary from delivery_fit where person_id=? and product_id=? and branch=?",
      person,
      product,
      branch
    );
    Object lead = previous.isEmpty() ? null : previous.get(0).get("lead_id");
    var linked = lead == null ? null : s.one("select * from work where id=? for update", lead);
    if (linked != null && !Flows.visible(u, linked)) lead = null;
    boolean visit = flag(b, "requestVisit");
    if (
      visit &&
      (lead == null ||
        Set.of("ACCEPTED", "LOST").contains(linked.get("stage")))
    ) {
      lead = desk.create(
        Map.of(
          "kind",
          "LEAD",
          "source",
          "Delivery fit check",
          "title",
          "Delivery measurement · " + p.sku,
          "detail",
          result.summary,
          "branch",
          branch
        ),
        u
      );
    } else if (visit) {
      if (!result.summary.equals(linked.get("detail"))) {
        if (AdminRecords.mayEdit(linked)) s.db.update(
          "update work set detail=?,revision=revision+1 where id=? and detail=?",
          result.summary,
          lead,
          previous.get(0).get("summary")
        );
        s.audit(
          id(lead),
          person,
          "Customer submitted delivery measurements · " + result.summary
        );
      }
    }
    s.db.update(
      "merge into delivery_fit(person_id,product_id,branch,verdict,summary,packing_revision,lead_id,checked_at) key(person_id,product_id,branch) values(?,?,?,?,?,?,?,current_timestamp)",
      person,
      product,
      branch,
      result.verdict,
      result.summary,
      p.revision,
      lead
    );
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("result", result);
    out.put("lead", lead);
    return out;
  }

  @GetMapping("/catalog-admin/{product}/packing")
  List<Map<String, Object>> packing(
    @PathVariable long product,
    @RequestParam String branch,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    CatalogAdmin.scope(u, branch);
    return s.rows(
      "select cartons,upright,revision from packing_profile where product_id=? and branch=?",
      product,
      branch
    );
  }

  @PostMapping("/catalog-admin/{product}/packing")
  @Transactional
  void setPacking(
    @PathVariable long product,
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    String branch = CatalogAdmin.scope(u, branch(b));
    CatalogAdmin.editableListing(s, product, branch);
    var rows = s.rows(
      "select revision from packing_profile where product_id=? and branch=?",
      product,
      branch
    );
    long rev = rows.isEmpty() ? 0 : id(rows.get(0).get("revision"));
    if (rev != id(b.get("revision"))) throw fail(
      409,
      "Packing measurements changed. Reopen the editor."
    );
    String[] lines = req(b, "cartons", 900).strip().split("\\R");
    if (lines.length > 8) throw fail(400, "Enter up to eight cartons per SKU");
    String dims = String.join(
      "\n",
      Arrays.stream(lines).map(Box::parse).map(Box::size).toList()
    );
    s.db.update(
      "merge into packing_profile(product_id,branch,revision,cartons,upright) key(product_id,branch) values(?,?,?,?,?)",
      product,
      branch,
      rev + 1,
      dims,
      flag(b, "upright")
    );
    s.audit(
      null,
      u.get("id"),
      "Updated packing measurements for product #" + product + " in " + branch
    );
  }
}
