package in.apsp.suite;

import static in.apsp.suite.Store.*;

import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.scheduling.annotation.*;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.ObjectMapper;

@Component
@EnableScheduling
class Notifications {

  final Store s;
  final ObjectMapper json;
  final String url = System.getenv("APSP_NOTIFICATION_URL"),
    key = System.getenv("APSP_NOTIFICATION_SECRET");
  final HttpClient client = HttpClient.newBuilder()
    .connectTimeout(Duration.ofSeconds(4))
    .build();

  final ShopEmail email;

  final MailDesign design;

  Notifications(
    Store s,
    ObjectMapper json,
    ShopEmail email,
    MailDesign design
  ) {
    this.design = design;
    this.email = email;
    this.s = s;
    this.json = json;
  }

  @Scheduled(fixedDelay = 30000, initialDelay = 30000)
  void relay() {
    if (
      !email.enabled() &&
      (url == null ||
        !url.startsWith("https://") ||
        key == null ||
        key.length() < 20)
    ) return;
    var pending = s.rows(
      "select i.*,p.email,p.role,p.display_name,coalesce(w.branch,p.branch) mail_branch,p.marketing,p.active,p.is_demo,coalesce(i.notice_kind,w.kind) kind from inbox i join person p on i.person_id=p.id left join work w on w.id=i.work_id where i.relay_state='PENDING' and i.next_try<=current_timestamp and (i.work_id is null or (w.enabled=true and w.archived=false)) order by i.id fetch first 20 rows only"
    );
    for (var msg : pending) {
      Object id = msg.get("id");
      if (
        Boolean.TRUE.equals(msg.get("is_demo")) || !Boolean.TRUE.equals(msg.get("active")) ||
        ("CAMPAIGN".equals(msg.get("kind")) &&
          !Boolean.TRUE.equals(msg.get("marketing")))
      ) {
        s.db.update("update inbox set relay_state='SKIPPED' where id=?", id);
        continue;
      }
      try {
        String eventId = "notification-" + id;
        String recipient = email.recipient(
          "SUPER_ADMIN".equals(msg.get("role")),
          (String) msg.get("email")
        );
        var vars = MailDesign.vars(msg, design.sEmail());
        var letter = design.compose(
          vars.get("category"),
          vars.get("branch"),
          vars
        );
        if (email.enabled()) {
          email.send(recipient, letter.subject(), letter.body(), eventId);
        } else {
          byte[] body = json.writeValueAsBytes(
            Map.of(
              "event_id",
              eventId,
              "recipient",
              recipient,
              "channel",
              "email",
              "message",
              letter.body(),
              "subject",
              letter.subject(),
              "category",
              Objects.toString(msg.get("kind"), "RESTOCK")
            )
          );
          Mac mac = Mac.getInstance("HmacSHA256");
          mac.init(
            new SecretKeySpec(
              key.getBytes(StandardCharsets.UTF_8),
              "HmacSHA256"
            )
          );
          String sig = HexFormat.of().formatHex(mac.doFinal(body));
          var req = HttpRequest.newBuilder(URI.create(url))
            .timeout(Duration.ofSeconds(7))
            .header("Content-Type", "application/json")
            .header("Idempotency-Key", eventId)
            .header("X-Studio-Signature", sig)
            .POST(HttpRequest.BodyPublishers.ofByteArray(body))
            .build();
          var res = client.send(req, HttpResponse.BodyHandlers.discarding());
          if (res.statusCode() / 100 != 2) throw new java.io.IOException(
            "Delivery failed"
          );
        }
        s.db.update(
          "update inbox set relay_state='SENT',attempts=attempts+1 where id=?",
          id
        );
      } catch (Exception e) {
        int n = ((Number) msg.get("attempts")).intValue() + 1;
        s.db.update(
          "update inbox set attempts=?,relay_state=?,next_try=dateadd(minute,?,current_timestamp) where id=?",
          n,
          n >= 5 ? "REVIEW" : "PENDING",
          1 << Math.min(5, n),
          id
        );
      }
    }
  }
}

@RestController
@RequestMapping("/api/relay")
class RelayAdmin {

  final Store s;

  RelayAdmin(Store s) {
    this.s = s;
  }

  @GetMapping
  List<Map<String, Object>> queue(
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    role(u, "SUPER_ADMIN");
    return s.rows(
      "select id,attempts,relay_state,created_at from inbox where relay_state='REVIEW' order by id"
    );
  }

  @PostMapping("/{id}")
  void retry(
    @PathVariable long id,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    role(u, "SUPER_ADMIN");
    s.db.update(
      "update inbox set attempts=0,relay_state='PENDING',next_try=current_timestamp where id=? and relay_state='REVIEW'",
      id
    );
    s.audit(null, u.get("id"), "Retried notification " + id);
  }
}
