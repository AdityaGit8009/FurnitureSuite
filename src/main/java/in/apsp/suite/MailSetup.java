package in.apsp.suite;

import static in.apsp.suite.Store.*;

import jakarta.servlet.http.HttpServletRequest;
import java.net.InetAddress;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/email")
class MailSetup {

  final ShopEmail mail;
  final Store s;

  MailSetup(ShopEmail mail, Store s) {
    this.mail = mail;
    this.s = s;
  }

  @PostMapping("/verify")
  Map<String, Boolean> verify(
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    role(u, "SUPER_ADMIN");
    mail.verify();
    return Map.of("verified", true);
  }

  @PostMapping
  void connect(
    @RequestAttribute("viewer") Map<String, Object> user,
    @RequestBody Map<String, Object> body,
    HttpServletRequest request
  ) throws java.net.UnknownHostException {
    role(user, "SUPER_ADMIN");
    if (
      !request.isSecure() &&
      !InetAddress.getByName(request.getRemoteAddr()).isLoopbackAddress()
    ) throw fail(403, "Connect email over HTTPS or from the local computer");
    var account = s.one(
      "select password_hash from person where id=?",
      user.get("id")
    );
    if (
      !s.encoder.matches(
        req(body, "current", 100),
        (String) account.get("password_hash")
      )
    ) throw fail(403, "Verify your current studio password");
    mail.connect(req(body, "appPassword", 100).replace(" ", ""));
    s.audit(null, user.get("id"), "Connected showroom email via SMTP");
  }
}
