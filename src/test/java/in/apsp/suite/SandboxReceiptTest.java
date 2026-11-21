package in.apsp.suite;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

class SandboxReceiptTest {

  @Test
  void signedTestReceiptStaysOutOfOperatingAccounts() throws Exception {
    var ds = new JdbcDataSource();
    ds.setURL("jdbc:h2:mem:sandboxreceipts;DB_CLOSE_DELAY=-1");
    new ResourceDatabasePopulator(new ClassPathResource("schema.sql")).execute(
      ds
    );
    Store store = new Store(new JdbcTemplate(ds));
    String password = "studio-fixture-password";
    long id = store.add(
      "insert into person(email,display_name,password_hash,role,branch) values(?,?,?,?,?)",
      "fixture@example.test",
      "Test owner",
      store.encoder.encode(password),
      "SUPER_ADMIN",
      "Central"
    );
    var actor = store.user(id);
    String oid = "order_fixture1",
      pid = "pay_fixture1",
      secret = "test-only-fixture";
    var mapper = new ObjectMapper();
    class Fixture extends TestProvider {

      String status = "authorized";
      long amount = 10000;
      String issued = oid;

      Fixture() {
        super(mapper);
      }

      @Override
      JsonNode call(
        String key,
        String token,
        String path,
        Map<String, Object> body
      ) {
        assertEquals("rzp_test_fixture", key);
        assertEquals(secret, token);
        if (path.equals("orders?count=1")) return mapper.valueToTree(Map.of());
        if (
          path.startsWith("orders/") && path.endsWith("/payments")
        ) return mapper.valueToTree(Map.of("items", java.util.List.of()));
        if (path.equals("orders")) {
          assertEquals(amount, body.get("amount"));
          return mapper.valueToTree(
            Map.of("id", issued, "amount", amount, "currency", "INR")
          );
        }
        assertTrue(
          path.equals("payments/" + pid) || path.equals("payments/pay_buyer")
        );
        return mapper.valueToTree(
          Map.of(
            "id",
            path.substring("payments/".length()),
            "order_id",
            issued,
            "status",
            status,
            "amount",
            amount,
            "currency",
            "INR"
          )
        );
      }
    }
    var remote = new Fixture();
    var sandbox = new TestCheckout(store, remote);
    var request = new MockHttpServletRequest();
    request.setRemoteAddr("127.0.0.1");
    sandbox.connect(
      Map.of(
        "password",
        password,
        "keyId",
        "rzp_test_fixture",
        "secret",
        secret
      ),
      actor,
      request
    );
    var checkout = sandbox.order(actor);
    assertEquals(oid, checkout.get("order_id"));
    assertFalse(checkout.containsValue(secret));
    assertEquals(checkout, sandbox.resume(oid, actor));
    var h = Mac.getInstance("HmacSHA256");
    h.init(
      new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256")
    );
    String signature = HexFormat.of().formatHex(
      h.doFinal((oid + "|" + pid).getBytes(StandardCharsets.UTF_8))
    );
    Map<String, Object> response = Map.of(
      "razorpay_order_id",
      oid,
      "razorpay_payment_id",
      pid,
      "razorpay_signature",
      signature
    );
    assertEquals(
      "AUTHORIZED",
      sandbox.verify(oid, response, actor).get("status")
    );
    assertThrows(ResponseStatusException.class, () ->
      sandbox.resume(oid, actor)
    );
    remote.amount = 5000;
    assertThrows(ResponseStatusException.class, () ->
      sandbox.refresh(oid, actor)
    );
    remote.amount = 10000;
    remote.status = "captured";
    assertEquals("CAPTURED", sandbox.refresh(oid, actor).get("status"));
    assertEquals(
      "CAPTURED",
      sandbox.verify(oid, response, actor).get("status")
    );
    for (String table : new String[] { "money", "posting", "work" })
      assertEquals(
        0,
        store.db.queryForObject("select count(*) from " + table, Integer.class)
      );
    assertEquals(
      1,
      store.db.queryForObject(
        "select count(*) from sandbox_order",
        Integer.class
      )
    );
    long buyerId = store.add(
      "insert into person(email,role,branch,display_name,password_hash) values('buyer@example.test','CUSTOMER','Central','Buyer','unused')"
    );
    long buyer2 = store.add(
      "insert into person(email,role,branch,display_name,password_hash) values('other@example.test','CUSTOMER','North','Other','unused')"
    );
    var buyer = store.user(buyerId);
    var desk = new Desk(store);
    var api = new Api(
      store,
      desk,
      new Payments(store, desk, mapper),
      null,
      null,
      sandbox
    );
    long sale = store.add(
      "insert into work(kind,stage,person_id,amount) values('ORDER','CONFIRMED',?,249.75)",
      buyerId
    );
    remote.amount = 24975;
    remote.issued = "order_buyer";
    var start = api.testCheckout(sale, buyer);
    assertEquals(24975L, start.get("amount"));
    assertEquals(start, api.testCheckout(sale, buyer));
    assertThrows(ResponseStatusException.class, () ->
      api.testCheckout(sale, store.user(buyer2))
    );
    assertThrows(ResponseStatusException.class, () ->
      sandbox.resume(remote.issued, actor)
    );
    assertThrows(ResponseStatusException.class, () ->
      sandbox.verify(oid, response, buyer)
    );
    String buyerPayment = "pay_buyer";
    String buyerSignature = HexFormat.of().formatHex(
      h.doFinal(
        (remote.issued + "|" + buyerPayment).getBytes(StandardCharsets.UTF_8)
      )
    );
    var proof = Map.<String, Object>of(
      "razorpay_order_id",
      remote.issued,
      "razorpay_payment_id",
      buyerPayment,
      "razorpay_signature",
      buyerSignature
    );
    assertThrows(ResponseStatusException.class, () ->
      sandbox.verify(
        remote.issued,
        Map.of(
          "razorpay_order_id",
          remote.issued,
          "razorpay_payment_id",
          buyerPayment,
          "razorpay_signature",
          "wrong"
        ),
        buyer
      )
    );
    assertEquals(
      "CAPTURED",
      sandbox.verify(remote.issued, proof, buyer).get("status")
    );
    assertEquals("CAPTURED", api.testCheckout(sale, buyer).get("status"));
    assertEquals(new java.math.BigDecimal("249.75"), desk.outstanding(sale));
    store.db.update("update work set stage='CANCELLED' where id=?", sale);
    assertThrows(ResponseStatusException.class, () ->
      api.testCheckout(sale, buyer)
    );
  }
}
