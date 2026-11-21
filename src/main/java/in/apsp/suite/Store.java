package in.apsp.suite;

import java.math.*;
import java.nio.file.*;
import java.sql.Statement;
import java.util.*;
import org.springframework.boot.CommandLineRunner;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Component
public class Store {

  final JdbcTemplate db;
  final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(12);
  static final List<String> roles = List.of(
    "SUPER_ADMIN",
    "ADMIN",
    "CUSTOMER",
    "SALES",
    "CASHIER",
    "DESIGNER",
    "PURCHASE",
    "WAREHOUSE",
    "PRODUCTION",
    "DELIVERY",
    "ACCOUNTANT",
    "SUPPORT",
    "MARKETING"
  );
  static final List<String> branches = List.of("Central", "North");

  Store(JdbcTemplate db) {
    this.db = db;
  }

  static ResponseStatusException fail(int n, String s) {
    return new ResponseStatusException(HttpStatus.valueOf(n), s);
  }

  static String str(Map<String, ?> b, String k, int max) {
    String s = Objects.toString(b.get(k), "").strip();
    if (s.length() > max) throw fail(400, k + " is too long");
    return s;
  }

  static String req(Map<String, ?> b, String k, int max) {
    String s = str(b, k, max);
    if (s.isBlank()) throw fail(400, k + " is required");
    return s;
  }

  static long id(Object x) {
    try {
      return Long.parseLong(String.valueOf(x));
    } catch (Exception e) {
      throw fail(400, "Invalid record ID");
    }
  }

  static int qty(Object x) {
    long n = id(x);
    if (n < 1 || n > 10000) throw fail(400, "Quantity must be 1 to 10000");
    return (int) n;
  }

  static BigDecimal price(Object v) {
    try {
      var p = new BigDecimal(String.valueOf(v)).setScale(
        2,
        RoundingMode.UNNECESSARY
      );
      if (
        p.signum() < 0 || p.compareTo(new BigDecimal("999999999")) > 0
      ) throw new Exception();
      return p;
    } catch (Exception e) {
      throw fail(400, "Enter a valid amount in rupees");
    }
  }

  static void role(Map<String, Object> u, String... r) {
    if (!permit(u, r)) throw fail(403, "Your role does not permit this action");
  }

  static boolean permit(Map<String, Object> u, String... r) {
    return (
      Arrays.asList(r).contains(u.get("role")) ||
      "SUPER_ADMIN".equals(u.get("role"))
    );
  }

  static String branch(Map<String, ?> b) {
    String s = str(b, "branch", 60);
    if (s.isBlank()) return "Central";
    if (!branches.contains(s)) throw fail(400, "Unknown branch");
    return s;
  }

  List<Map<String, Object>> rows(String sql, Object... args) {
    return db
      .queryForList(sql, args)
      .stream()
      .map(m -> {
        Map<String, Object> out = new LinkedHashMap<>();
        m.forEach((k, v) -> out.put(k.toLowerCase(Locale.ROOT), v));
        return out;
      })
      .toList();
  }

  Map<String, Object> one(String sql, Object... args) {
    return rows(sql, args)
      .stream()
      .findFirst()
      .orElseThrow(() -> fail(404, "Record not found"));
  }

  long add(String sql, Object... args) {
    var key = new GeneratedKeyHolder();
    db.update(c -> {
      var s = c.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
      for (int i = 0; i < args.length; i++) s.setObject(i + 1, args[i]);
      return s;
    }, key);
    return ((Number) key.getKeys().get("ID")).longValue();
  }

  Map<String, Object> user(long id) {
    return one(
      "select id,email,display_name,role,branch,marketing,phone,delivery_address,delivery_pincode from person where active=true and id=?",
      id
    );
  }

  void audit(Object work, Object actor, String note) {
    db.update(
      "insert into journal(work_id,actor,action) values(?,?,?)",
      work,
      actor,
      note
    );
  }

  void seed() throws Exception {
    if (db.queryForObject("select count(*) from person", Integer.class) == 0) {
      String password = System.getenv("APSP_OWNER_PASSWORD");
      if (password == null || password.isBlank()) {
        password = UUID.randomUUID() + "!";
        Files.createDirectories(Path.of("data"));
        Files.writeString(
          Path.of("data/owner-first-login.txt"),
          "Owner: owner@apsp.local\nPassword: " + password + "\n",
          StandardOpenOption.CREATE_NEW
        );
      }
      if (password.length() < 12) throw new IllegalStateException(
        "Owner password needs 12 characters"
      );
      db.update(
        "insert into person(email,display_name,password_hash,role,branch) values(?,?,?,?,?)",
        "owner@apsp.local",
        "Studio Owner",
        encoder.encode(password),
        "SUPER_ADMIN",
        "Central"
      );
    }
    if (db.queryForObject("select count(*) from product", Integer.class) == 0) {
      String[][] list = {
        {
          "SF-101",
          "Moss three-seat sofa",
          "Sofas",
          "Forest velvet",
          "208 x 88 x 84 cm",
          "48900",
          "sofa",
        },
        {
          "CH-202",
          "Atelier accent chair",
          "Chairs",
          "Natural oak",
          "74 x 78 x 82 cm",
          "16900",
          "chair",
        },
        {
          "TB-303",
          "Gather dining table",
          "Dining",
          "Smoked walnut",
          "180 x 90 x 75 cm",
          "34500",
          "dining",
        },
        {
          "BD-404",
          "Sunday platform bed",
          "Beds",
          "Oiled teak",
          "205 x 165 x 95 cm",
          "53900",
          "bed",
        },
        {
          "CH-505",
          "Forma lounge chair",
          "Chairs",
          "Woven linen",
          "80 x 82 x 78 cm",
          "22800",
          "lounge",
        },
      };
      for (var p : list) {
        var amount = new BigDecimal(p[5]);
        long k = add(
          "insert into product(sku,name,category,finish,dimensions,price,cost,photo,warranty) values(?,?,?,?,?,?,?,?,?)",
          p[0],
          p[1],
          p[2],
          p[3],
          p[4],
          amount,
          amount.multiply(new BigDecimal("0.60")),
          "/images/" + p[6] + ".jpg",
          "12-month manufacturing warranty"
        );
        for (String b : branches)
          db.update(
            "insert into stock(product_id,branch,on_hand) values(?,?,?)",
            k,
            b,
            b.equals("Central") ? 8 : 3
          );
      }
      db.update(
        "insert into setting values('delivery_prefix',''),('delivery_fee','500'),('free_above','40000'),('coupon_code',''),('coupon_pct','0'),('assembly_fee','0'),('carry_fee','0'),('store_note','')"
      );
    }
  }
}

@Component
class Bootstrap
  implements org.springframework.beans.factory.SmartInitializingSingleton
{

  final Store s;

  Bootstrap(Store s) {
    this.s = s;
  }

  @Transactional
  public void afterSingletonsInstantiated() {
    try {
      s.seed();
      DemoCatalogue.install(s);
      AdminExamples.install(s);
    } catch (Exception e) {
      throw new IllegalStateException("Studio initialization failed", e);
    }
  }
}
