package in.apsp.suite;

import static in.apsp.suite.Store.*;

import jakarta.servlet.http.*;
import java.util.*;
import org.springframework.context.annotation.Configuration;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.*;
import org.springframework.web.servlet.config.annotation.*;

@Component
class Access implements HandlerInterceptor {

  final LoginTokens tokens;

  Access(LoginTokens tokens) {
    this.tokens = tokens;
  }

  static String token() {
    return UUID.randomUUID().toString();
  }

  static String csrf(HttpSession ss) {
    if (ss.getAttribute("csrf") == null) ss.setAttribute("csrf", token());
    return (String) ss.getAttribute("csrf");
  }

  public boolean preHandle(
    HttpServletRequest r,
    HttpServletResponse p,
    Object h
  ) {
    p.setHeader("Cache-Control", "no-store");
    p.setHeader("X-Content-Type-Options", "nosniff");
    p.setHeader("X-Frame-Options", "DENY");
    String path = r.getRequestURI();
    if (r.getMethod().equals("GET") && (path.equals("/api/catalog") || path.matches("/api/catalog/products/[0-9]+/(reviews|delivery-fit)"))) return true;
    String hash = tokens.presented(r);
    var auth = tokens.resolve(hash);
    if (auth != null) {
      r.setAttribute("loginHash", auth.remove("token_hash"));
      r.setAttribute("loginCsrf", auth.remove("csrf"));
      r.setAttribute("loginExpiry", auth.remove("expires_at"));
      r.setAttribute("viewer", auth);
    } else if (hash != null) tokens.clear(r, p);
    boolean open = Set.of(
      "/api/session",
      "/api/login",
      "/api/register",
      "/api/recover", "/api/recover/request", "/api/recover/confirm", "/api/login/resend", "/api/login/verify"
    ).contains(path);
    if (auth == null && !open) throw fail(401, "Please sign in again");
    if (!Set.of("GET", "HEAD").contains(r.getMethod())) {
      String expected =
        auth == null
          ? csrf(r.getSession())
          : (String) r.getAttribute("loginCsrf");
      if (!Objects.equals(expected, r.getHeader("X-CSRF-Token"))) throw fail(
        403,
        "Refresh the page and retry"
      );
    }
    return true;
  }


}

@Configuration
class Routing implements WebMvcConfigurer {

  final Access access;

  Routing(Access a) {
    access = a;
  }

  @Override
  public void addViewControllers(
    org.springframework.web.servlet.config.annotation.ViewControllerRegistry routes
  ) {
    routes.addViewController("/track-order").setViewName("forward:/index.html");
    routes.addViewController("/profile").setViewName("forward:/index.html");
    routes
      .addViewController("/razorpay-test")
      .setViewName("forward:/index.html");
  }

  public void addInterceptors(InterceptorRegistry r) {
    r.addInterceptor(access).addPathPatterns("/api/**");
  }
}
