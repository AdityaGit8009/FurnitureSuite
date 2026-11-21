package in.apsp.suite;

import static in.apsp.suite.Store.*;

import jakarta.servlet.http.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.Duration;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class LoginTokens {

  private static final String COOKIE = "APSP_AUTH";
  static final Duration LIFETIME = Duration.ofHours(24);
  private static final SecureRandom RANDOM = new SecureRandom();
  private final Store s;
  private final boolean secure;

  LoginTokens(
    Store s,
    @Value("${server.servlet.session.cookie.secure:false}") boolean secure
  ) {
    this.s = s;
    this.secure = secure;
  }

  private static String freshToken() {
    byte[] bytes = new byte[32];
    RANDOM.nextBytes(bytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  static String digest(String token) {
    try {
      return HexFormat.of().formatHex(
        MessageDigest.getInstance("SHA-256").digest(
          token.getBytes(StandardCharsets.US_ASCII)
        )
      );
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }

  private void cookie(
    HttpServletRequest req,
    HttpServletResponse res,
    String value,
    Duration age
  ) {
    res.addHeader(
      "Set-Cookie",
      ResponseCookie.from(COOKIE, value)
        .httpOnly(true)
        .secure(secure || req.isSecure())
        .sameSite("Lax")
        .path("/")
        .maxAge(age)
        .build()
        .toString()
    );
  }

  String presented(HttpServletRequest req) {
    if (req.getCookies() == null) return null;
    for (Cookie c : req.getCookies())
      if (
        COOKIE.equals(c.getName()) && c.getValue().matches("[A-Za-z0-9_-]{43}")
      ) return digest(c.getValue());
    return null;
  }

  Map<String, Object> resolve(String hash) {
    if (hash == null) return null;
    return s
      .rows(
        "select t.token_hash,t.csrf,t.expires_at,p.id,coalesce(t.active_role,p.role) role,p.email,p.branch,p.display_name,p.marketing,p.phone,p.delivery_address,p.delivery_pincode from login_token t join person p on p.id=t.person_id and p.auth_version=t.auth_version where t.token_hash=? and t.expires_at>? and p.active=true",
        hash,
        System.currentTimeMillis()
      )
      .stream()
      .findFirst()
      .orElse(null);
  }

  @Transactional
  Map<String, Object> issue(
    long id,
    Object version,
    HttpServletRequest req,
    HttpServletResponse res
  ) {
    String raw = freshToken(),
      hash = digest(raw),
      csrf = freshToken();
    long expires = System.currentTimeMillis() + LIFETIME.toMillis();
    s.db.update(
      "delete from login_token where expires_at<=? or token_hash=?",
      System.currentTimeMillis(),
      presented(req)
    );
    if (
      s.db.update(
        "insert into login_token(token_hash,person_id,auth_version,csrf,expires_at) select ?,id,auth_version,?,? from person where id=? and active=true and auth_version=?",
        hash,
        csrf,
        expires,
        id,
        version
      ) != 1
    ) throw fail(401, "Please sign in again");
    HttpSession old = req.getSession(false);
    if (old != null) old.invalidate();
    cookie(req, res, raw, LIFETIME);
    return Map.of("user", s.user(id), "csrf", csrf, "expiresAt", expires);
  }

  void end(HttpServletRequest req, HttpServletResponse res) {
    s.db.update("delete from login_token where token_hash=?", presented(req));
    HttpSession old = req.getSession(false);
    if (old != null) old.invalidate();
    clear(req, res);
  }

  void clear(HttpServletRequest req, HttpServletResponse res) {
    cookie(req, res, "", Duration.ZERO);
  }
}
