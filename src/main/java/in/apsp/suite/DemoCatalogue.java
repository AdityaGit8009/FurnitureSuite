package in.apsp.suite;

import java.math.BigDecimal;
import java.nio.file.*;
import java.util.*;

/** One-time additions to an existing showroom. Restarts keep user edits and stock counts. */
final class DemoCatalogue {

  private record Family(
    String code,
    String name,
    String category,
    String photo,
    int width,
    int depth,
    int height,
    int price,
    boolean upholstered
  ) {}

  private static final Family[] FAMILIES = {
    new Family(
      "S2",
      "two-seat sofa",
      "Sofas",
      "sofa",
      162,
      86,
      82,
      28900,
      true
    ),
    new Family(
      "S3",
      "three-seat sofa",
      "Sofas",
      "sofa",
      208,
      90,
      84,
      37900,
      true
    ),
    new Family(
      "SC",
      "chaise sectional",
      "Sectionals",
      "sofa",
      237,
      148,
      82,
      51900,
      true
    ),
    new Family(
      "AC",
      "accent chair",
      "Chairs",
      "chair",
      72,
      74,
      82,
      11900,
      true
    ),
    new Family(
      "LC",
      "lounge chair",
      "Lounge chairs",
      "lounge",
      78,
      81,
      78,
      14900,
      true
    ),
    new Family(
      "AR",
      "reading armchair",
      "Armchairs",
      "chair",
      76,
      83,
      87,
      13400,
      true
    ),
    new Family(
      "DC",
      "dining chair",
      "Chairs",
      "chair",
      48,
      55,
      82,
      5900,
      false
    ),
    new Family(
      "T4",
      "four-seat dining table",
      "Dining",
      "dining",
      124,
      78,
      75,
      16400,
      false
    ),
    new Family(
      "T6",
      "six-seat dining table",
      "Dining",
      "dining",
      184,
      96,
      76,
      24900,
      false
    ),
    new Family(
      "BQ",
      "queen platform bed",
      "Beds",
      "bed",
      164,
      208,
      94,
      28400,
      false
    ),
    new Family(
      "BK",
      "king storage bed",
      "Storage beds",
      "bed",
      193,
      212,
      101,
      36800,
      false
    ),
  };
  private static final String[] SERIES = {
    "Aranya",
    "Banyan",
    "Coast",
    "Everett",
    "Juno",
    "Kora",
    "Monsoon",
    "Nila",
    "Sora",
  };
  private static final String[] FABRICS = {
    "Sage linen",
    "Indigo cotton",
    "Sand weave",
    "Charcoal velvet",
    "Rust chenille",
  };
  private static final String[] WOODS = {
    "Natural oak",
    "Walnut stain",
    "Honey teak",
    "Ash veneer",
    "Espresso oak",
  };

  static void install(Store s) throws Exception {
    if (
      !s
        .rows("select name from seed_version where name='showroom-500-v1'")
        .isEmpty()
    ) return;
    Set<String> skus = new HashSet<>(
      s.db.queryForList("select sku from product", String.class)
    );
    for (int series = 0; series < SERIES.length; series++) {
      for (Family f : FAMILIES) {
        String group = SERIES[series] + " " + f.name;
        for (int finish = 0; finish < 5 && skus.size() < 500; finish++) {
          String sku = "FS-" + f.code + "-" + (series + 1) + (finish + 1);
          if (!skus.add(sku)) continue;
          String surface = (f.upholstered ? FABRICS : WOODS)[finish];
          int price = f.price + series * 550 + finish * 450;
          long p = s.add(
            "insert into product(sku,name,category,finish,dimensions,price,cost,photo,warranty,variant_family) values(?,?,?,?,?,?,?,?,?,?)",
            sku,
            group + " · " + surface,
            f.category,
            surface,
            f.width +
              (series % 3) * 2 +
              " x " +
              f.depth +
              " x " +
              f.height +
              " cm",
            price,
            BigDecimal.valueOf(price).multiply(new BigDecimal("0.60")),
            "/images/" + f.photo + ".jpg",
            "24-month manufacturing warranty",
            group
          );
          for (int i = 0; i < Store.branches.size(); i++) s.db.update(
            "insert into stock(product_id,branch,on_hand) values(?,?,?)",
            p,
            Store.branches.get(i),
            2 + ((series * 3 + finish + i) % 14)
          );
        }
      }
    }
    s.db.update(
      "update item set shipped=qty where product_id is null and shipped<qty and work_id in (select id from work where kind='ORDER' and stage in ('DISPATCHED','DELIVERED','INSTALLED'))"
    );
    String email = "ananya.demo@example.test";
    if (s.rows("select id from person where email=?", email).isEmpty()) {
      Path credentials = Path.of("data", "demo-customer-login.txt");
      Files.createDirectories(credentials.getParent());
      if (!Files.exists(credentials)) Files.writeString(
        credentials,
        "Customer: " + email + "\nPassword: " + UUID.randomUUID() + "!\n",
        StandardOpenOption.CREATE_NEW
      );
      var lines = Files.readAllLines(credentials);
      if (
        lines.size() < 2 ||
        !lines.get(0).equals("Customer: " + email) ||
        !lines.get(1).startsWith("Password: ") ||
        lines.get(1).length() < 22
      ) throw new IllegalStateException(
        "Check data/demo-customer-login.txt before setup"
      );
      long demo = s.add(
        "insert into person(email,display_name,password_hash,role,branch,phone,delivery_address,delivery_pincode,is_demo) values(?,?,?,'CUSTOMER','Central',?,?,?,true)",
        email,
        "Ananya Sharma",
        s.encoder.encode(lines.get(1).substring(10)),
        "+12025550147",
        "Flat 2B, Demo Apartments, Sample Road, New Delhi",
        "110001"
      );
      s.db.update(
        "insert into wishlist(person_id,product_id) select ?,id from product where sku in ('SF-101','CH-202')",
        demo
      );
    }
    s.db.update("insert into seed_version(name) values('showroom-500-v1')");
  }
}
