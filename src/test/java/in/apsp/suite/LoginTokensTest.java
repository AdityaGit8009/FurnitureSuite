package in.apsp.suite;

import static org.junit.jupiter.api.Assertions.*;

import jakarta.servlet.http.Cookie;
import java.time.Duration;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class LoginTokensTest {

  @Test
  void cookiesSurviveRestartButNeverOutliveTheirDeadlineOrRevocation() {
    var db = new JdbcDataSource();
    db.setURL("jdbc:h2:mem:tokens;DB_CLOSE_DELAY=-1");
    new ResourceDatabasePopulator(new ClassPathResource("schema.sql")).execute(
      db
    );
    var store = new Store(new JdbcTemplate(db));
    long id = store.add(
      "insert into person(email,display_name,password_hash,role,branch) values('one@example.test','One','unused','CUSTOMER','Central')"
    );
    var tokens = new LoginTokens(store, true);
    var req = new MockHttpServletRequest();
    var res = new MockHttpServletResponse();
    long before = System.currentTimeMillis();
    var login = tokens.issue(id, 1, req, res);
    long expiry = (Long) login.get("expiresAt");
    assertTrue(
      expiry >= before + Duration.ofHours(24).toMillis() &&
        expiry <= System.currentTimeMillis() + Duration.ofHours(24).toMillis()
    );
    String header = res.getHeader("Set-Cookie");
    for (String flag : new String[] {
      "Secure",
      "HttpOnly",
      "SameSite=Lax",
      "Max-Age=86400",
    })
      assertTrue(header.contains(flag));
    String raw = header.split(";")[0].split("=")[1];
    req.setCookies(new Cookie("APSP_AUTH", raw));
    String hash = tokens.presented(req);
    assertNotEquals(raw, hash);
    assertEquals(
      hash,
      store.one("select token_hash from login_token").get("token_hash")
    );
    var restarted = new LoginTokens(store, true);
    assertEquals(id, restarted.resolve(hash).get("id"));
    assertEquals(expiry, restarted.resolve(hash).get("expires_at"));
    store.db.update(
      "update login_token set expires_at=? where token_hash=?",
      System.currentTimeMillis() - 1,
      hash
    );
    assertNull(restarted.resolve(hash));
    res = new MockHttpServletResponse();
    tokens.issue(id, 1, req, res);
    raw = res.getHeader("Set-Cookie").split(";")[0].split("=")[1];
    req.setCookies(new Cookie("APSP_AUTH", raw));
    hash = tokens.presented(req);
    store.db.update("update person set auth_version=2 where id=?", id);
    assertNull(tokens.resolve(hash));
    res = new MockHttpServletResponse();
    tokens.issue(id, 2, req, res);
    raw = res.getHeader("Set-Cookie").split(";")[0].split("=")[1];
    req.setCookies(new Cookie("APSP_AUTH", raw));
    hash = tokens.presented(req);
    tokens.end(req, new MockHttpServletResponse());
    assertNull(tokens.resolve(hash));
  }
}
