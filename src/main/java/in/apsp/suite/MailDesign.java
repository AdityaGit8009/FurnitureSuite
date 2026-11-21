package in.apsp.suite;

import static in.apsp.suite.Store.*;

import java.util.*;
import java.util.regex.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/studio/mail")
class MailDesign {

  final Store s;

  MailDesign(Store s) {
    this.s = s;
  }

  static final List<String> KINDS = List.of(
    "ORDER",
    "LEAD",
    "TICKET",
    "RETURN",
    "VISIT",
    "CAMPAIGN",
    "PRICE_ALERT",
    "RESTOCK"
  );
  static final String SUBJECT = "APSP Furniture Studio · {{category}}",
    BODY = "{{message}}";
  static final Pattern TOKEN = Pattern.compile("\\{\\{([^{}]+)}}");
  static final Set<String> KEYS = Set.of(
    "name",
    "message",
    "category",
    "branch",
    "reference",
    "shopEmail"
  );

  record Mail(String subject, String body) {}

  static String render(String value, Map<String, String> vars) {
    return TOKEN.matcher(value).replaceAll(m ->
      Matcher.quoteReplacement(vars.getOrDefault(m.group(1), ""))
    );
  }

  static void validate(String subject, String body) {
    if (
      subject.chars().anyMatch(Character::isISOControl) ||
      !body.contains("{{message}}") ||
      subject.contains("{{message}}")
    ) throw fail(
      400,
      "Keep the subject on one line and include {{message}} in the body only"
    );
    for (String text : List.of(subject, body)) {
      var matches = TOKEN.matcher(text);
      while (matches.find())
        if (!KEYS.contains(matches.group(1))) throw fail(
          400,
          "Unknown placeholder: " + matches.group()
        );
      String rest = TOKEN.matcher(text).replaceAll("");
      if (rest.contains("{{") || rest.contains("}}")) throw fail(
        400,
        "Incomplete placeholder"
      );
    }
  }

  Mail compose(String kind, String branch, Map<String, String> vars) {
    var rows = s.rows(
      "select subject,body from mail_design where kind=? and branch in (?, 'All') order by case when branch=? then 0 else 1 end",
      kind,
      branch,
      branch
    );
    String subject = rows.isEmpty()
        ? SUBJECT
        : (String) rows.get(0).get("subject"),
      body = rows.isEmpty() ? BODY : (String) rows.get(0).get("body");
    return new Mail(
      render(subject, vars).replaceAll("[\\p{Cntrl}]", " "),
      render(body, vars)
    );
  }

  static Map<String, String> vars(Map<String, Object> msg, String email) {
    return Map.of(
      "category",
      Objects.toString(msg.get("kind"), "RESTOCK"),
      "branch",
      Objects.toString(msg.get("mail_branch"), "Central"),
      "reference",
      Objects.toString(msg.get("work_id"), ""),
      "name",
      Objects.toString(msg.get("display_name"), ""),
      "shopEmail",
      email,
      "message",
      (String) msg.get("message")
    );
  }

  @GetMapping
  Map<String, Object> all(@RequestAttribute("viewer") Map<String, Object> u) {
    Experience.manage(u);
    return Map.of(
      "rows",
      Experience.owner(u)
        ? s.rows("select * from mail_design order by branch,kind")
        : s.rows(
            "select * from mail_design where branch in (?, 'All')",
            u.get("branch")
          ),
      "kinds",
      KINDS,
      "subject",
      SUBJECT,
      "body",
      BODY
    );
  }

  @PostMapping
  @Transactional
  void save(
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    Experience.manage(u);
    String branch = "All".equals(b.get("branch")) ? "All" : branch(b);
    Experience.scope(u, branch);
    String kind = req(b, "kind", 30);
    if (!KINDS.contains(kind)) throw fail(400, "Unknown email event");
    String subject = req(b, "subject", 180),
      body = req(b, "body", 4000);
    validate(subject, body);
    long version = id(b.get("version"));
    if (version == 0) s.db.update(
      "insert into mail_design(branch,kind,subject,body) values(?,?,?,?)",
      branch,
      kind,
      subject,
      body
    );
    else if (
      s.db.update(
        "update mail_design set subject=?,body=?,version=version+1 where branch=? and kind=? and version=?",
        subject,
        body,
        branch,
        kind,
        version
      ) != 1
    ) throw fail(409, "Template changed. Reload before saving.");
    s.audit(null, u.get("id"), "Updated " + kind + " email for " + branch);
  }

  @PostMapping("/preview")
  Mail preview(
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    Experience.manage(u);
    String subject = req(b, "subject", 180),
      body = req(b, "body", 4000);
    validate(subject, body);
    var vars = Map.of(
      "name",
      "Aditi",
      "message",
      "Your order #1042 is ready for dispatch.",
      "category",
      str(b, "kind", 30),
      "branch",
      str(b, "branch", 60),
      "reference",
      "1042",
      "shopEmail",
      sEmail()
    );
    return new Mail(render(subject, vars), render(body, vars));
  }

  @org.springframework.beans.factory.annotation.Value("${apsp.shop.email}")
  private String mailbox;

  String sEmail() {
    return mailbox;
  }
}
