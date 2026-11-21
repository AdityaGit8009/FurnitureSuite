package in.apsp.suite;

import static in.apsp.suite.Store.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/ledger")
class Ledger {

  final Store s;

  Ledger(Store s) {
    this.s = s;
  }

  static final List<String> accounts = List.of(
    "Cash and bank",
    "Receivables",
    "Inventory",
    "Payables",
    "Sales",
    "Sales returns",
    "Cost of sales",
    "Operating expenses",
    "Owner equity",
    "Tax payable"
  );

  static void post(
    Store s,
    String branch,
    Object work,
    Object actor,
    String debit,
    String credit,
    BigDecimal amount,
    String memo,
    LocalDate day
  ) {
    if (amount.signum() == 0) return;
    if (
      amount.signum() < 0 ||
      debit.equals(credit) ||
      !accounts.contains(debit) ||
      !accounts.contains(credit)
    ) throw fail(400, "Invalid journal posting");
    var period = s.one(
      "select * from accounting_period where branch=? for update",
      branch
    );
    if (
      period.get("closed_to") instanceof java.sql.Date closed &&
      !day.isAfter(closed.toLocalDate())
    ) throw fail(409, "Accounting period is closed");
    s.db.update(
      "insert into posting(branch,work_id,actor,debit,credit,amount,memo,book_date) values(?,?,?,?,?,?,?,?)",
      branch,
      work,
      actor,
      debit,
      credit,
      amount,
      memo,
      day
    );
  }

  static void auto(
    Store s,
    Map<String, Object> w,
    Object actor,
    String debit,
    String credit,
    BigDecimal amount,
    String memo
  ) {
    post(
      s,
      (String) w.get("branch"),
      w.get("id"),
      actor,
      debit,
      credit,
      amount,
      memo,
      LocalDate.now()
    );
  }

  @GetMapping
  Map<String, Object> view(@RequestAttribute("viewer") Map<String, Object> u) {
    role(u, "ADMIN", "ACCOUNTANT");
    boolean all = "SUPER_ADMIN".equals(u.get("role"));
    var rows = s.rows(
      "select * from posting" +
        (all ? "" : " where branch=?") +
        " order by id desc",
      all ? new Object[] {} : new Object[] { u.get("branch") }
    );
    Map<String, BigDecimal> balances = new LinkedHashMap<>();
    for (var x : rows) {
      var a = (BigDecimal) x.get("amount");
      balances.merge((String) x.get("debit"), a, BigDecimal::add);
      balances.merge((String) x.get("credit"), a.negate(), BigDecimal::add);
    }
    return Map.of(
      "rows",
      rows,
      "balances",
      balances,
      "accounts",
      accounts,
      "periods",
      s.rows(
        "select * from accounting_period" + (all ? "" : " where branch=?"),
        all ? new Object[] {} : new Object[] { u.get("branch") }
      )
    );
  }

  @PostMapping
  @Transactional
  void journal(
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    role(u, "ADMIN", "ACCOUNTANT");
    String branch = "SUPER_ADMIN".equals(u.get("role"))
      ? branch(b)
      : (String) u.get("branch");
    var date = Desk.date(b).toLocalDate();
    if (date.isAfter(LocalDate.now())) throw fail(
      400,
      "Choose today or an earlier book date"
    );
    var amt = price(b.get("amount"));
    if (amt.signum() == 0) throw fail(400, "Amount must be positive");
    post(
      s,
      branch,
      null,
      u.get("id"),
      req(b, "debit", 40),
      req(b, "credit", 40),
      amt,
      req(b, "memo", 200),
      date
    );
    s.audit(null, u.get("id"), "Manual journal: " + b.get("memo"));
  }

  @PostMapping("/close")
  @Transactional
  void close(
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    role(u, "SUPER_ADMIN");
    String branch = branch(b);
    var day = Desk.date(b);
    if (!day.toLocalDate().isBefore(LocalDate.now())) throw fail(
      400,
      "Close completed days only"
    );
    if (
      s.db.update(
        "update accounting_period set closed_to=? where branch=? and (closed_to is null or closed_to<?)",
        day,
        branch,
        day
      ) != 1
    ) throw fail(409, "This period is already closed");
    s.audit(null, u.get("id"), "Closed " + branch + " through " + day);
  }
}
