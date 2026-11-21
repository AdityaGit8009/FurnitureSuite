package in.apsp.suite;

import static in.apsp.suite.Store.*;

import jakarta.servlet.http.*;
import java.util.*;
import org.springframework.dao.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
class Accounts {

  final Store s;
  final LoginTokens tokens;

  final EmailCodes codes;

  Accounts(Store s, LoginTokens tokens, EmailCodes codes) {
    this.codes = codes;
    this.s = s;
    this.tokens = tokens;
  }

  @GetMapping("/session")
  Map<String, Object> session(HttpServletRequest req) {
    Map<String, Object> result = new HashMap<>();
    Object user = req.getAttribute("viewer");
    result.put("user", user);
    result.put(
      "csrf",
      user == null
        ? Access.csrf(req.getSession())
        : req.getAttribute("loginCsrf")
    );
    if (user != null) result.put("expiresAt", req.getAttribute("loginExpiry"));
    return result;
  }

  String email(Map<String, Object> b) {
    String e = req(b, "email", 200).toLowerCase(Locale.ROOT);
    if (!e.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+")) throw fail(
      400,
      "Enter a valid email"
    );
    return e;
  }

  long create(Map<String, Object> b, String role, String branch) {
    String pw = req(b, "password", 72);
    if (
      pw.length() < 12 ||
      pw.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 72
    ) throw fail(
      400,
      "Use a password of at least 12 characters and at most 72 bytes"
    );
    return s.add(
      "insert into person(email,display_name,password_hash,role,branch) values(?,?,?,?,?)",
      email(b),
      req(b, "name", 100),
      s.encoder.encode(pw),
      role,
      branch
    );
  }

  private record Pending(long person, long version) implements java.io.Serializable {}

  private String binding(HttpServletRequest request) {
    return LoginTokens.digest(request.getSession().getId());
  }

  private Pending pending(HttpServletRequest request, String name) {
    Object value = request.getSession().getAttribute(name);
    if (!(value instanceof Pending challenge)) throw fail(400, "Start again to request an email code");
    return challenge;
  }

  private long verify(Pending challenge, EmailCodes.Purpose purpose, String binding, Map<String,Object> body) {
    long version = codes.consume(challenge.person(), purpose, binding, str(body,"otp",12));
    if (version < 0 || version != challenge.version()) throw fail(400, "Invalid or expired email code. Check the latest email or request a new code.");
    return version;
  }

  @PostMapping("/register")
  @ResponseStatus(HttpStatus.CREATED)
  Map<String,Object> register(@RequestBody Map<String,Object> body, HttpServletRequest request) {
    if (request.getAttribute("viewer") != null) throw fail(409,"Sign out before creating an account");
    try { create(body, "CUSTOMER", branch(body)); }
    catch (DuplicateKeyException ex) { throw fail(409,"An account already uses this email. Sign in or recover your account."); }
    return Map.of("registered", true);
  }

  @PostMapping("/login")
  Map<String, Object> login(@RequestBody Map<String, Object> b, HttpServletRequest r, HttpServletResponse response) {
    r.getSession().removeAttribute("loginOtp");
    var account = checkPassword(b);
    long person = id(account.get("id")), version = id(account.get("auth_version"));
    if (Boolean.TRUE.equals(account.get("email_mfa"))) {
      var result = new HashMap<>(codes.send(person,version,EmailCodes.Purpose.LOGIN,binding(r),false));
      r.getSession().setAttribute("loginOtp",new Pending(person,version));
      result.put("otpRequired",true);
      return result;
    }
    return tokens.issue(person,version,r,response);
  }

  private synchronized Map<String,Object> checkPassword(Map<String,Object> b) {
    String e = email(b);
    var tries = s.rows("select * from attempt where email=?", e);
    long now = System.currentTimeMillis();
    boolean recent = !tries.isEmpty() && now - id(tries.get(0).get("since_at")) < 600000;
    if (recent && id(tries.get(0).get("failures")) >= 8)
      throw fail(429,"Too many attempts. Try again after ten minutes.");
    var found = s.rows("select id,auth_version,password_hash,email_mfa from person where email=? and active=true",e);
    if (found.isEmpty() || !s.encoder.matches(req(b,"password",100),(String)found.get(0).get("password_hash"))) {
      s.db.update("merge into attempt key(email) values(?,?,?)",e,recent ? id(tries.get(0).get("failures"))+1 : 1,recent ? tries.get(0).get("since_at") : now);
      throw fail(401,"Email or password is incorrect");
    }
    s.db.update("delete from attempt where email=?",e);
    return found.get(0);
  }

  @PostMapping("/login/resend")
  Map<String,Object> resendLogin(HttpServletRequest request) {
    var p = pending(request,"loginOtp");
    return codes.send(p.person(),p.version(),EmailCodes.Purpose.LOGIN,binding(request),true);
  }

  @PostMapping("/login/verify")
  Map<String,Object> verifyLogin(HttpServletRequest request,HttpServletResponse response,@RequestBody Map<String,Object> body) {
    var p = pending(request,"loginOtp");
    long version = verify(p,EmailCodes.Purpose.LOGIN,binding(request),body);
    return tokens.issue(p.person(),version,request,response);
  }

  @PostMapping("/logout")
  void logout(HttpServletRequest r, HttpServletResponse response) {
    tokens.end(r, response);
  }

  @PostMapping("/mfa/start")
  Map<String,Object> start(HttpServletRequest r,@RequestBody Map<String,Object> b,@RequestAttribute("viewer") Map<String,Object> u) {
    long person = id(u.get("id"));
    var account = s.one("select password_hash,auth_version from person where id=?",person);
    if (!s.encoder.matches(req(b,"password",100),(String)account.get("password_hash"))) throw fail(403,"Verify your current password");
    return codes.send(person,id(account.get("auth_version")),EmailCodes.Purpose.ENROLL,(String)r.getAttribute("loginHash"),false);
  }

  @PostMapping("/mfa/resend")
  Map<String,Object> resendEnrollment(HttpServletRequest r,@RequestAttribute("viewer") Map<String,Object> u) {
    String binding = (String)r.getAttribute("loginHash");
    long person = id(u.get("id"));
    var rows = s.rows("select auth_version from account_email_code where person_id=? and purpose='ENROLL' and binding_hash=? and code_hash is not null",person,binding);
    if (rows.isEmpty()) throw fail(400,"Confirm your password to start setup");
    return codes.send(person,id(rows.get(0).get("auth_version")),EmailCodes.Purpose.ENROLL,binding,true);
  }

  @PostMapping("/mfa/confirm")
  @org.springframework.transaction.annotation.Transactional
  void confirm(HttpServletRequest r, @RequestBody Map<String,Object> b, @RequestAttribute("viewer") Map<String,Object> u) {
    long person = id(u.get("id"));
    long version = codes.consume(person,EmailCodes.Purpose.ENROLL,(String)r.getAttribute("loginHash"),str(b,"otp",12));
    if (version < 0) throw fail(400,"Invalid or expired email code. Check the latest email or request a new code.");
    if(s.db.update("update person set email_mfa=true,auth_version=auth_version+1 where id=? and auth_version=? and email_mfa=false",person,version)!=1)
      throw fail(409,"Your account settings changed. Sign in again.");
    s.db.update("update login_token set auth_version=? where token_hash=?",version+1,r.getAttribute("loginHash"));
    s.db.update("delete from login_token where person_id=? and token_hash<>?",person,r.getAttribute("loginHash"));
    s.audit(null,person,"Enabled two-step sign-in by email");
  }

  @PostMapping("/recover/request")
  Map<String,Object> requestReset(HttpServletRequest request,@RequestBody Map<String,Object> body) {
    var session = request.getSession();
    session.removeAttribute("resetOtp");
    var accounts = s.rows("select id,auth_version from person where email=? and active=true",email(body));
    if (!accounts.isEmpty()) {
      var p = new Pending(id(accounts.get(0).get("id")),id(accounts.get(0).get("auth_version")));
      try {
        codes.send(p.person(),p.version(),EmailCodes.Purpose.RESET,binding(request),false);
        session.setAttribute("resetOtp",p);
      } catch (ResponseStatusException ex) {
        // The public response is the same for missing, unavailable and rate-limited mailboxes.
        if (ex.getStatusCode().value() != 429 && ex.getStatusCode().value() != 503) throw ex;
      }
    }
    return Map.of("requested",true,"resendAt",System.currentTimeMillis()+EmailCodes.COOLDOWN);
  }

  @PostMapping("/recover/confirm")
  @org.springframework.transaction.annotation.Transactional
  void resetByEmail(HttpServletRequest request,@RequestBody Map<String,Object> body) {
    String next = req(body,"password",72);
    if (next.length()<12 || next.getBytes(java.nio.charset.StandardCharsets.UTF_8).length>72)
      throw fail(400,"Use 12 or more characters, maximum 72 bytes");
    var p = pending(request,"resetOtp");
    long version = verify(p,EmailCodes.Purpose.RESET,binding(request),body);
    if (s.db.update("update person set password_hash=?,recovery_hash=null,auth_version=auth_version+1 where id=? and active=true and auth_version=?",s.encoder.encode(next),p.person(),version)!=1)
      throw fail(409,"Start password recovery again");
    request.getSession().removeAttribute("resetOtp");
    s.db.update("delete from attempt where email=(select email from person where id=?)",p.person());
    s.audit(null,p.person(),"Reset password with an email code");
  }

  @PostMapping("/recovery-key")
  @org.springframework.transaction.annotation.Transactional
  Map<String, String> recoveryKey(
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    var row = s.one("select password_hash from person where id=?", u.get("id"));
    if (
      !s.encoder.matches(
        req(b, "password", 100),
        (String) row.get("password_hash")
      )
    ) throw fail(403, "Verify your current password");
    String key = UUID.randomUUID().toString();
    s.db.update(
      "update person set recovery_hash=? where id=?",
      s.encoder.encode(key),
      u.get("id")
    );
    s.audit(null, u.get("id"), "Rotated one-time recovery key");
    return Map.of("key", key);
  }

  @PostMapping("/recover")
  @org.springframework.transaction.annotation.Transactional
  void recover(@RequestBody Map<String, Object> b) {
    var users = s.rows(
      "select * from person where email=? and active=true for update",
      email(b)
    );
    if (
      users.isEmpty() ||
      users.get(0).get("recovery_hash") == null ||
      !s.encoder.matches(
        req(b, "key", 100),
        (String) users.get(0).get("recovery_hash")
      )
    ) throw fail(403, "Invalid recovery details");
    String pw = req(b, "password", 72);
    if (
      pw.length() < 12 ||
      pw.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 72
    ) throw fail(400, "Use 12+ characters, maximum 72 bytes");
    Object account = users.get(0).get("id");
    s.db.update(
      "update person set password_hash=?,recovery_hash=null,auth_version=auth_version+1 where id=?",
      s.encoder.encode(pw),
      account
    );
    s.audit(null, account, "Recovered password with one-time key");
  }

  @PostMapping("/password")
  @org.springframework.transaction.annotation.Transactional
  void password(
    @RequestBody Map<String, Object> b,
    HttpServletRequest r,
    HttpServletResponse response,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    String current = req(b, "current", 100),
      next = req(b, "password", 72);
    if (
      next.length() < 12 ||
      next.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 72
    ) throw fail(400, "Use 12 or more characters, maximum 72 bytes");
    var old = s.one("select password_hash from person where id=?", u.get("id"));
    if (
      !s.encoder.matches(current, (String) old.get("password_hash"))
    ) throw fail(403, "Current password is incorrect");
    s.db.update(
      "update person set password_hash=?,auth_version=auth_version+1 where id=?",
      s.encoder.encode(next),
      u.get("id")
    );
    s.audit(null, u.get("id"), "Changed password and revoked sessions");
    tokens.end(r, response);
  }

  @PostMapping("/profile")
  @org.springframework.transaction.annotation.Transactional
  Map<String, Object> profile(
    @RequestAttribute("viewer") Map<String, Object> u,
    @RequestBody Map<String, Object> b
  ) {
    if (!"CUSTOMER".equals(u.get("role"))) throw fail(
      403,
      "Customer account required"
    );
    String phone = str(b, "phone", 24),
      address = str(b, "address", 600),
      pin = str(b, "pincode", 6);
    String phoneDigits = phone.replaceAll("[ ()-]", "");
    if (!phone.isEmpty() && !phoneDigits.matches("[+]?[0-9]{7,15}")) throw fail(
      400,
      "Enter a valid contact phone number"
    );
    if (!pin.isEmpty() && !pin.matches("[1-9][0-9]{5}")) throw fail(
      400,
      "Enter a six-digit Indian pincode"
    );
    if (address.isEmpty() != pin.isEmpty()) throw fail(
      400,
      "Save the delivery address and pincode together"
    );
    s.db.update(
      "update person set display_name=?,phone=?,delivery_address=?,delivery_pincode=?,branch=? where id=?",
      req(b, "name", 100),
      phone,
      address,
      pin,
      branch(b),
      u.get("id")
    );
    return s.user(id(u.get("id")));
  }

  @PostMapping("/consent")
  void consent(
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    boolean value = Boolean.TRUE.equals(b.get("enabled"));
    s.db.update("update person set marketing=? where id=?", value, u.get("id"));
    s.audit(null, u.get("id"), "Marketing consent " + value);
  }

  @PostMapping("/staff")
  void staff(
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    role(u, "SUPER_ADMIN");
    String role = req(b, "role", 30);
    if (!StaffAccess.internal(role)) throw fail(
      400,
      "Invalid role"
    );
    long k = create(b, role, branch(b));
    s.audit(
      null,
      u.get("id"),
      "Created staff account " + k + " (" + role + ")"
    );
  }

  @PostMapping("/staff/{id}/active")
  @org.springframework.transaction.annotation.Transactional
  void active(
    @PathVariable long id,
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    role(u, "SUPER_ADMIN");
    var row = StaffAccess.lockCurrent(s, id, b);
    if (Boolean.TRUE.equals(row.get("archived"))) throw fail(409, "Restore the account before changing access.");
    if (!(b.get("active") instanceof Boolean active)) throw fail(400, "Choose a staff access status");
    if (active.equals(row.get("active"))) return;
    s.db.update("update person set active=?,auth_version=auth_version+1 where id=?", active, id);
    s.audit(null, u.get("id"), "Changed access for account " + id);
  }
}

@RestControllerAdvice
class Errors {

  @ExceptionHandler(ResponseStatusException.class)
  ResponseEntity<?> status(ResponseStatusException e) {
    return ResponseEntity.status(e.getStatusCode()).body(
      Map.of("message", Objects.toString(e.getReason(), "Request failed"))
    );
  }

  @ExceptionHandler(DataIntegrityViolationException.class)
  ResponseEntity<?> invalid() {
    return ResponseEntity.badRequest().body(
      Map.of("message", "Duplicate reference or invalid record value")
    );
  }
}
