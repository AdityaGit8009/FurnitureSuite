package in.apsp.suite;

import static in.apsp.suite.Store.*;

import java.math.BigDecimal;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.ObjectMapper;

@RestController
class Payments {

  final Store s;
  final Desk desk;
  final ObjectMapper json;
  final HttpClient http = HttpClient.newBuilder()
    .connectTimeout(Duration.ofSeconds(5))
    .build();
  final String key = System.getenv("RAZORPAY_KEY_ID"),
    secret = System.getenv("RAZORPAY_KEY_SECRET"),
    hook = System.getenv("RAZORPAY_WEBHOOK_SECRET");

  Payments(Store s, Desk desk, ObjectMapper json) {
    this.s = s;
    this.desk = desk;
    this.json = json;
  }

  boolean enabled() {
    return (
      key != null &&
      key.startsWith("rzp_live_") &&
      secret != null &&
      !secret.isBlank() &&
      hook != null &&
      !hook.isBlank()
    );
  }

  static Map<String, Object> withCustomer(
    Map<String, Object> options,
    Map<String, Object> user
  ) {
    if (
      !"CUSTOMER".equals(user.get("role")) || !options.containsKey("key")
    ) return options;
    Map<String, Object> prefill = new HashMap<>();
    prefill.put("name", user.get("display_name"));
    prefill.put("email", user.get("email"));
    String phone = Objects.toString(user.get("phone"), "").replaceAll(
      "[ ()-]",
      ""
    );
    if (!phone.isEmpty()) prefill.put("contact", phone);
    var checkout = new HashMap<>(options);
    checkout.put("prefill", prefill);
    return checkout;
  }

  @PostMapping("/api/work/{id}/checkout")
  @Transactional
  Map<String, Object> checkout(
    @PathVariable long id,
    @RequestAttribute("viewer") Map<String, Object> u
  ) throws Exception {
    if (!enabled()) throw fail(503, "Online payments are not configured");
    var w = desk.get(id, u, true);
    if (
      !w.get("kind").equals("ORDER") || w.get("stage").equals("CANCELLED")
    ) throw fail(409, "This order is not payable");
    BigDecimal amount = desk.outstanding(id);
    if (amount.signum() <= 0) throw fail(409, "Order has no amount due");
    long paise = amount.movePointRight(2).longValueExact();
    var existing = s.rows(
      "select provider_id from payment_intent where work_id=? and amount=? and state='OPEN' order by provider_id fetch first row only",
      id,
      amount
    );
    String provider;
    if (!existing.isEmpty()) provider = (String) existing
      .get(0)
      .get("provider_id");
    else {
      String payload = json.writeValueAsString(
        Map.of("amount", paise, "currency", "INR", "receipt", "apsp-" + id)
      );
      var req = HttpRequest.newBuilder(
        URI.create("https://api.razorpay.com/v1/orders")
      )
        .timeout(Duration.ofSeconds(12))
        .header(
          "Authorization",
          "Basic " +
            Base64.getEncoder().encodeToString(
              (key + ":" + secret).getBytes(StandardCharsets.UTF_8)
            )
        )
        .header("Content-Type", "application/json")
        .POST(HttpRequest.BodyPublishers.ofString(payload))
        .build();
      var resp = http.send(req, HttpResponse.BodyHandlers.ofString());
      if (resp.statusCode() / 100 != 2) throw fail(
        502,
        "Gateway could not create a payment order"
      );
      provider = json.readTree(resp.body()).path("id").asString();
      s.db.update(
        "insert into payment_intent values(?,?,?,'OPEN')",
        provider,
        id,
        amount
      );
    }
    s.db.update(
      "update work set payment_method='RAZORPAY_LIVE' where id=?",
      id
    );
    return withCustomer(
      Map.of(
        "key",
        key,
        "order_id",
        provider,
        "amount",
        paise,
        "currency",
        "INR",
        "name",
        "APSP Furniture Studio"
      ),
      u
    );
  }

  @PostMapping("/payments/razorpay/events")
  @Transactional
  void capture(
    @RequestBody byte[] body,
    @RequestHeader(
      value = "X-Razorpay-Signature",
      defaultValue = ""
    ) String signature
  ) throws Exception {
    if (!enabled()) throw fail(503, "Payments disabled");
    Mac h = Mac.getInstance("HmacSHA256");
    h.init(
      new SecretKeySpec(hook.getBytes(StandardCharsets.UTF_8), "HmacSHA256")
    );
    if (
      !MessageDigest.isEqual(
        HexFormat.of()
          .formatHex(h.doFinal(body))
          .getBytes(StandardCharsets.US_ASCII),
        signature.getBytes(StandardCharsets.US_ASCII)
      )
    ) throw fail(403, "Invalid signature");
    var event = json.readTree(body);
    if (!"payment.captured".equals(event.path("event").asString())) return;
    var p = event.path("payload").path("payment").path("entity");
    String oid = p.path("order_id").asString(),
      pid = p.path("id").asString();
    var intent = s.one(
      "select * from payment_intent where provider_id=? for update",
      oid
    );
    if (!"OPEN".equals(intent.get("state"))) return;
    long work = id(intent.get("work_id"));
    var w = s.one("select * from work where id=? for update", work);
    BigDecimal captured = BigDecimal.valueOf(p.path("amount").asLong(), 2);
    if (
      !"INR".equals(p.path("currency").asString()) ||
      captured.compareTo((BigDecimal) intent.get("amount")) != 0 ||
      captured.compareTo(desk.outstanding(work)) > 0 ||
      "CANCELLED".equals(w.get("stage"))
    ) {
      s.db.update(
        "update payment_intent set state='REVIEW' where provider_id=?",
        oid
      );
      s.audit(
        work,
        null,
        "Gateway reconciliation required · " + pid + " · " + captured
      );
      return;
    }
    s.db.update(
      "insert into money(work_id,amount,ref) values(?,?,?)",
      work,
      captured,
      "gateway:" + pid
    );
    s.db.update(
      "update payment_intent set state='PAID' where provider_id=?",
      oid
    );
    Ledger.auto(
      s,
      w,
      null,
      "Cash and bank",
      "Receivables",
      captured,
      "Gateway collection"
    );
    s.audit(work, null, "Online payment captured · INR " + captured);
  }
}
