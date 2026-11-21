package in.apsp.suite;

import static in.apsp.suite.Store.*;

import java.security.SecureRandom;
import java.time.Duration;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
class EmailCodes {
  enum Purpose {
    LOGIN("sign in"), ENROLL("turn on two-step sign-in"), RESET("reset your password");
    final String instruction;
    Purpose(String instruction) { this.instruction = instruction; }
  }

  static final long COOLDOWN = Duration.ofMinutes(1).toMillis();
  static final long VALIDITY = Duration.ofMinutes(10).toMillis();
  private static final long WINDOW = Duration.ofHours(1).toMillis();
  private static final int MAX_SENDS = 6, MAX_GUESSES = 5;
  private final SecureRandom random = new SecureRandom();
  private final Store store;
  private final ShopEmail mail;
  private final ShopContact shop;

  EmailCodes(Store store, ShopEmail mail, ShopContact shop) {
    this.store = store;
    this.mail = mail;
    this.shop = shop;
  }

  @Transactional
  Map<String,Object> send(long person, long version, Purpose purpose, String binding, boolean resend) {
    var account = store.one("select email,role,active,auth_version,email_mfa from person where id=? for update", person);
    if (!Boolean.TRUE.equals(account.get("active")) || id(account.get("auth_version")) != version)
      throw fail(403, "Start again to verify your account");
    boolean enrolled = Boolean.TRUE.equals(account.get("email_mfa"));
    if ((purpose == Purpose.LOGIN && !enrolled) || (purpose == Purpose.ENROLL && enrolled))
      throw fail(409, "Your sign-in settings changed. Open account settings again.");
    String address = (String)account.get("email");
    if ("SUPER_ADMIN".equals(account.get("role")) && address.equalsIgnoreCase("owner@apsp.local"))
      address = shop.email;
    if (!mail.enabled()) throw fail(503, "Email delivery is unavailable. Contact the showroom or try again later.");
    long now = System.currentTimeMillis();
    var previous = store.rows("select * from account_email_code where person_id=? and purpose=?", person, purpose.name());
    long windowStart = now;
    int sentCount = 0;
    if (!previous.isEmpty()) {
      var old = previous.get(0);
      long next = id(old.get("sent_at")) + COOLDOWN;
      if (now < next) {
        if (!resend && binding.equals(old.get("binding_hash")) && id(old.get("auth_version")) == version
            && old.get("code_hash") != null && id(old.get("failures")) < MAX_GUESSES)
          return Map.of("destination", address, "resendAt", next);
        throw fail(429, "Wait one minute before requesting another email code.");
      }
      if (now - id(old.get("window_start")) < WINDOW) {
        windowStart = id(old.get("window_start"));
        sentCount = ((Number)old.get("sent_count")).intValue();
        if (sentCount >= MAX_SENDS) throw fail(429, "Email code limit reached. Try again in an hour.");
      }
    }
    String code = String.format(Locale.ROOT,"%06d",random.nextInt(1_000_000));
    store.db.update("merge into account_email_code(person_id,purpose,binding_hash,auth_version,code_hash,sent_at,window_start,sent_count,failures) key(person_id,purpose) values(?,?,?,?,?,?,?,?,0)",
        person, purpose.name(), binding, version, store.encoder.encode(code), now, windowStart, sentCount + 1);
    try {
      mail.send(address, "Your APSP Furniture Studio verification code",
          "Enter " + code + " in Furniture Studio to " + purpose.instruction + ".\n\nThis code expires in 10 minutes. If you did not request it, you can ignore this email.",
          "account-" + purpose.name().toLowerCase(Locale.ROOT));
    } catch (Exception ex) {
      throw fail(503, "The verification email could not be sent. Try again later.");
    }
    return Map.of("destination", address, "resendAt", now + COOLDOWN);
  }

  // Commit failed guesses and successful single-use consumption even if the caller rejects the request.
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  long consume(long person, Purpose purpose, String binding, String code) {
    var accounts = store.rows("select active,auth_version from person where id=? for update", person);
    if (accounts.isEmpty() || !Boolean.TRUE.equals(accounts.get(0).get("active"))) return -1;
    long version = id(accounts.get(0).get("auth_version"));
    var rows = store.rows("select * from account_email_code where person_id=? and purpose=?", person, purpose.name());
    if (rows.isEmpty()) return -1;
    var challenge = rows.get(0);
    if (!binding.equals(challenge.get("binding_hash")) || version != id(challenge.get("auth_version"))
        || challenge.get("code_hash") == null || id(challenge.get("failures")) >= MAX_GUESSES
        || System.currentTimeMillis() >= id(challenge.get("sent_at")) + VALIDITY) return -1;
    if (!code.matches("[0-9]{6}") || !store.encoder.matches(code, (String)challenge.get("code_hash"))) {
      store.db.update("update account_email_code set failures=failures+1 where person_id=? and purpose=?", person, purpose.name());
      return -1;
    }
    store.db.update("update account_email_code set code_hash=null where person_id=? and purpose=?", person, purpose.name());
    return version;
  }
}
