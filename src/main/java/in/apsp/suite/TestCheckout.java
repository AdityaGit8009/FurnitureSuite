package in.apsp.suite;

import static in.apsp.suite.Store.*;

import jakarta.servlet.http.HttpServletRequest;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Component
class TestProvider {

  final ObjectMapper json;
  final HttpClient client = HttpClient.newBuilder()
    .connectTimeout(Duration.ofSeconds(6))
    .build();

  TestProvider(ObjectMapper j) {
    json = j;
  }

  JsonNode call(
    String key,
    String secret,
    String path,
    Map<String, Object> payload
  ) throws Exception {
    var r = HttpRequest.newBuilder(
      URI.create("https://api.razorpay.com/v1/" + path)
    )
      .timeout(Duration.ofSeconds(12))
      .header(
        "Authorization",
        "Basic " +
          Base64.getEncoder().encodeToString(
            (key + ":" + secret).getBytes(StandardCharsets.UTF_8)
          )
      );
    if (payload == null) r.GET();
    else r.header("Content-Type", "application/json").POST(
      HttpRequest.BodyPublishers.ofString(json.writeValueAsString(payload))
    );
    var response = client.send(r.build(), HttpResponse.BodyHandlers.ofString());
    if (response.statusCode() / 100 != 2) throw fail(
      response.statusCode() == 401 ? 400 : 502,
      "Razorpay rejected the request. Check your test credentials or try again."
    );
    return json.readTree(response.body());
  }
}

@RestController
@RequestMapping("/api/test-payments")
class TestCheckout {

  private static final class Keys {

    final String id, secret;

    Keys(String id, String secret) {
      this.id = id;
      this.secret = secret;
    }
  }

  private volatile Keys keys;
  final Store s;
  final TestProvider provider;

  TestCheckout(Store s, TestProvider provider) {
    this.s = s;
    this.provider = provider;
    String key = System.getenv("RAZORPAY_TEST_KEY_ID"),
      secret = System.getenv("RAZORPAY_TEST_KEY_SECRET");
    if (
      key == null &&
      System.getenv("RAZORPAY_KEY_ID") != null &&
      System.getenv("RAZORPAY_KEY_ID").startsWith("rzp_test_")
    ) {
      key = System.getenv("RAZORPAY_KEY_ID");
      secret = System.getenv("RAZORPAY_KEY_SECRET");
    }
    if (
      key != null &&
      key.startsWith("rzp_test_") &&
      secret != null &&
      !secret.isBlank()
    ) keys = new Keys(key, secret);
  }

  @GetMapping
  Map<String, Object> status(
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    role(u, "SUPER_ADMIN");
    return Map.of(
      "connected",
      keys != null,
      "orders",
      s.rows(
        "select provider_order,amount_paise,status,payment_id,created_at from sandbox_order where actor=? and work_id is null order by created_at desc fetch first 15 rows only",
        u.get("id")
      )
    );
  }

  @PostMapping("/connect")
  void connect(
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u,
    HttpServletRequest req
  ) throws Exception {
    role(u, "SUPER_ADMIN");
    if (
      !req.isSecure() &&
      !InetAddress.getByName(req.getRemoteAddr()).isLoopbackAddress()
    ) throw fail(403, "Use HTTPS or localhost");
    String key = req(b, "keyId", 80);
    if (!key.matches("rzp_test_[a-zA-Z0-9]+")) throw fail(
      400,
      "Enter a test key beginning with rzp_test_"
    );
    String secret = req(b, "secret", 160);
    if (
      !s.encoder.matches(
        req(b, "password", 100),
        (String) s
          .one("select password_hash from person where id=?", u.get("id"))
          .get("password_hash")
      )
    ) throw fail(403, "Verify your Studio password");
    provider.call(key, secret, "orders?count=1", null);
    keys = new Keys(key, secret);
    s.audit(null, u.get("id"), "Connected Razorpay test mode");
  }

  @PostMapping("/disconnect")
  void disconnect(@RequestAttribute("viewer") Map<String, Object> u) {
    role(u, "SUPER_ADMIN");
    keys = null;
    s.audit(null, u.get("id"), "Disconnected Razorpay test mode");
  }

  boolean configured() {
    return keys != null;
  }

  private Keys connected() {
    Keys k = keys;
    if (k == null) throw fail(409, "Connect your merchant test keys first");
    return k;
  }

  @PostMapping("/orders")
  @Transactional
  Map<String, Object> order(
    @RequestAttribute("viewer") Map<String, Object> u
  ) throws Exception {
    role(u, "SUPER_ADMIN");
    return create(u, connected(), 10000, null);
  }

  Map<String, Object> purchase(
    Map<String, Object> user,
    long work,
    long paise
  ) throws Exception {
    Keys k = connected();
    var prior = s.rows(
      "select provider_order,status from sandbox_order where work_id=? and key_id=? and amount_paise=? and status<>'FAILED' order by created_at desc fetch first row only",
      work,
      k.id,
      paise
    );
    if (!prior.isEmpty()) {
      var attempt = prior.get(0);
      String oid = (String) attempt.get("provider_order");
      if (!"CREATED".equals(attempt.get("status"))) return Map.of(
        "status",
        attempt.get("status")
      );
      String status = refresh(oid, user).get("status");
      if (!"CREATED".equals(status)) return Map.of("status", status);
      return options(k, oid, paise);
    }
    return create(user, k, paise, work);
  }

  private Map<String, Object> create(
    Map<String, Object> u,
    Keys k,
    long amount,
    Long work
  ) throws Exception {
    var result = provider.call(
      k.id,
      k.secret,
      "orders",
      Map.of(
        "amount",
        amount,
        "currency",
        "INR",
        "receipt",
        "test-" + UUID.randomUUID().toString().substring(0, 24)
      )
    );
    String oid = result.path("id").asString();
    if (
      !oid.matches("order_[a-zA-Z0-9]+") ||
      result.path("amount").asLong() != amount ||
      !"INR".equals(result.path("currency").asString())
    ) throw fail(502, "Unexpected test order from Razorpay");
    s.db.update(
      "insert into sandbox_order(provider_order,actor,key_id,amount_paise,status,work_id) values(?,?,?,?, 'CREATED',?)",
      oid,
      u.get("id"),
      k.id,
      amount,
      work
    );
    return options(k, oid, amount);
  }

  private Map<String, Object> options(Keys k, String oid, long amount) {
    return Map.of(
      "key",
      k.id,
      "order_id",
      oid,
      "amount",
      amount,
      "currency",
      "INR",
      "name",
      "APSP Studio · Test Mode",
      "description",
      "Simulated furniture checkout"
    );
  }

  @PostMapping("/orders/{oid}/resume")
  Map<String, Object> resume(
    @PathVariable String oid,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    role(u, "SUPER_ADMIN");
    Keys k = connected();
    var pending = s.one(
      "select amount_paise,status from sandbox_order where provider_order=? and actor=? and key_id=? and work_id is null",
      oid,
      u.get("id"),
      k.id
    );
    if (!"CREATED".equals(pending.get("status"))) throw fail(
      409,
      "This test order was already submitted"
    );
    return options(k, oid, id(pending.get("amount_paise")));
  }

  @PostMapping("/orders/{oid}/verify")
  @Transactional
  Map<String, String> verify(
    @PathVariable String oid,
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) throws Exception {
    Keys k = connected();
    var order = s.one(
      "select * from sandbox_order where provider_order=? and actor=? and key_id=? for update",
      oid,
      u.get("id"),
      k.id
    );
    String pid = req(b, "razorpay_payment_id", 80);
    if (
      !pid.matches("pay_[a-zA-Z0-9]+") ||
      !oid.equals(b.get("razorpay_order_id"))
    ) throw fail(400, "Mismatched test payment");
    Mac mac = Mac.getInstance("HmacSHA256");
    mac.init(
      new SecretKeySpec(k.secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256")
    );
    String sig = HexFormat.of().formatHex(
      mac.doFinal((oid + "|" + pid).getBytes(StandardCharsets.UTF_8))
    );
    if (
      !MessageDigest.isEqual(
        sig.getBytes(StandardCharsets.US_ASCII),
        req(b, "razorpay_signature", 128).getBytes(StandardCharsets.US_ASCII)
      )
    ) throw fail(403, "Payment signature did not verify");
    return check(order, k, pid);
  }

  @PostMapping("/orders/{oid}/refresh")
  @Transactional
  Map<String, String> refresh(
    @PathVariable String oid,
    @RequestAttribute("viewer") Map<String, Object> u
  ) throws Exception {
    Keys k = connected();
    var row = s.one(
      "select * from sandbox_order where provider_order=? and actor=? and key_id=? for update",
      oid,
      u.get("id"),
      k.id
    );
    if (row.get("payment_id") == null) {
      var attempts = provider
        .call(k.id, k.secret, "orders/" + oid + "/payments", null)
        .path("items");
      for (String state : List.of("captured", "authorized")) {
        for (var attempt : attempts) {
          if (state.equals(attempt.path("status").asString())) {
            String pid = attempt.path("id").asString();
            if (pid.matches("pay_[a-zA-Z0-9]+")) return check(row, k, pid);
          }
        }
      }
      return Map.of("status", "CREATED");
    }
    return check(row, k, (String) row.get("payment_id"));
  }

  private Map<String, String> check(
    Map<String, Object> row,
    Keys k,
    String pid
  ) throws Exception {
    if ("CAPTURED".equals(row.get("status"))) return Map.of(
      "status",
      "CAPTURED"
    );
    var p = provider.call(k.id, k.secret, "payments/" + pid, null);
    if (
      !pid.equals(p.path("id").asString()) ||
      !row.get("provider_order").equals(p.path("order_id").asString()) ||
      !"INR".equals(p.path("currency").asString()) ||
      p.path("amount").asLong() != id(row.get("amount_paise"))
    ) throw fail(409, "Payment details do not match the test order");
    String state = switch (p.path("status").asString()) {
      case "captured" -> "CAPTURED";
      case "authorized" -> "AUTHORIZED";
      case "failed" -> "FAILED";
      default -> "PENDING";
    };
    s.db.update(
      "update sandbox_order set payment_id=?,status=? where provider_order=?",
      pid,
      state,
      row.get("provider_order")
    );
    return Map.of("status", state);
  }
}
