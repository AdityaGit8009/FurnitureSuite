package in.apsp.suite;

import static in.apsp.suite.Store.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
class StaffAccess {

  final Store s;

  StaffAccess(Store s) {
    this.s = s;
  }

  static boolean internal(String value) {
    return (
      roles.contains(value) &&
      !Set.of("CUSTOMER", "SUPER_ADMIN").contains(value)
    );
  }

  static List<String> granted(Store s, Object id) {
    return s.db.queryForList(
      "select role from person where id=? union select role from staff_role where person_id=? order by role",
      String.class,
      id,
      id
    );
  }

  static Map<String, Object> lockCurrent(Store s, long person, Map<String, Object> body) {
    var row = s.one("select role,active,archived,auth_version from person where id=? for update", person);
    if (!internal((String) row.get("role"))) throw fail(403, "Choose an internal staff account");
    if (id(body.get("version")) != id(row.get("auth_version"))) {
      throw fail(409, "Account changed. Reopen the staff account.");
    }
    return row;
  }

  @GetMapping("/staff/{id}/access")
  Map<String, Object> read(
    @PathVariable long id,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    role(u, "SUPER_ADMIN");
    var p = s.one(
      "select display_name,role,branch,auth_version from person where id=? and role not in ('CUSTOMER','SUPER_ADMIN')",
      id
    );
    p.put("granted", granted(s, id));
    return p;
  }

  @PostMapping("/staff/{id}/access")
  @Transactional
  void assign(
    @PathVariable long id,
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    role(u, "SUPER_ADMIN");
    var p = lockCurrent(s, id, b);
    if (Boolean.TRUE.equals(p.get("archived"))) throw fail(409, "Restore the account before changing its roles.");
    String primary = req(b, "primary", 30),
      branch = branch(b);
    if (
      !internal(primary) ||
      !(b.get("roles") instanceof List<?> values) ||
      values.size() > roles.size()
    ) throw fail(400, "Choose valid staff roles");
    Set<String> extra = new LinkedHashSet<>();
    for (Object role : values) {
      if (!(role instanceof String v) || !internal(v)) throw fail(
        400,
        "Choose valid staff roles"
      );
      if (!v.equals(primary)) extra.add(v);
    }
    s.db.update("delete from staff_role where person_id=?", id);
    for (String v : extra)
      s.db.update("insert into staff_role(person_id,role) values(?,?)", id, v);
    s.db.update(
      "update person set role=?,branch=?,auth_version=auth_version+1 where id=?",
      primary,
      branch,
      id
    );
    s.audit(
      null,
      u.get("id"),
      "Staff #" +
        id +
        " access · " +
        branch +
        " · primary " +
        primary +
        " · additional " +
        String.join(", ", extra)
    );
  }

  @PostMapping("/account/active-role")
  @Transactional
  void switchRole(
    @RequestBody Map<String, Object> b,
    @RequestAttribute("viewer") Map<String, Object> u,
    HttpServletRequest request
  ) {
    String next = req(b, "role", 30);
    Object person = u.get("id");
    if (
      !internal((String) u.get("role")) ||
      !internal(next) ||
      !granted(s, person).contains(next)
    ) throw fail(403, "This role is not assigned to your account");
    if (
      s.db.update(
        "update login_token set active_role=? where token_hash=? and person_id=? and auth_version=(select auth_version from person where id=?) and expires_at>?",
        next,
        request.getAttribute("loginHash"),
        person,
        person,
        System.currentTimeMillis()
      ) != 1
    ) throw fail(401, "Please sign in again");
    s.audit(null, person, "Switched active role to " + next);
  }
}
