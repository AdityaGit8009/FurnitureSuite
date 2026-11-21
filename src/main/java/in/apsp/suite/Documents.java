package in.apsp.suite;

import static in.apsp.suite.Store.*;

import java.math.BigDecimal;
import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.util.HtmlUtils;

@RestController
@RequestMapping("/api/work")
class Documents {

  final Store s;
  final Desk desk;

  Documents(Store s, Desk desk) {
    this.s = s;
    this.desk = desk;
  }

  static String esc(Object v) {
    return HtmlUtils.htmlEscape(Objects.toString(v, ""));
  }

  static String inr(Object v) {
    var f = java.text.NumberFormat.getCurrencyInstance(
      Locale.forLanguageTag("en-IN")
    );
    return esc(f.format(v));
  }

  @GetMapping(value = "/{id}/document", produces = "text/html;charset=UTF-8")
  ResponseEntity<String> document(
    @PathVariable long id,
    @RequestAttribute("viewer") Map<String, Object> u
  ) {
    var w = desk.get(id, u, false);
    boolean quote = w.get("kind").equals("LEAD");
    if (
      (quote && !Set.of("QUOTED", "ACCEPTED").contains(w.get("stage"))) ||
      (!quote && !w.get("kind").equals("ORDER"))
    ) throw fail(409, "This document is not ready");
    boolean delivered = Set.of("DELIVERED", "INSTALLED").contains(
      w.get("stage")
    );
    String type = quote
      ? "Quotation"
      : delivered
        ? "Sales invoice"
        : "Order confirmation";
    String ref =
      (quote ? "QT-" : delivered ? "INV-" : "SO-") +
      id +
      (quote ? "-R" + w.get("revision") : "");
    StringBuilder body = new StringBuilder(
      "<!doctype html><html lang=en><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>" +
        type +
        " " +
        ref +
        "</title><style>body{max-width:780px;margin:48px auto;padding:0 22px;color:#19372b;font:15px/1.55 system-ui}h1{font:42px Georgia}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:10px;border-bottom:1px solid #ccc}p{white-space:pre-wrap}small{color:#56665b}@media print{body{margin:0}}</style><header><b>APSP Furniture Studio</b><h1>" +
        type +
        "</h1><p>" +
        ref +
        " · " +
        esc(w.get("branch")) +
        "</p></header>"
    );
    if (w.get("person_id") != null) body
      .append("<p>Customer: ")
      .append(
        esc(
          s
            .one(
              "select display_name from person where id=?",
              w.get("person_id")
            )
            .get("display_name")
        )
      )
      .append("</p>");
    body
      .append("<p>")
      .append(esc(w.get("title")))
      .append("<br>")
      .append(esc(w.get("detail")))
      .append("</p>");
    BigDecimal subtotal = BigDecimal.ZERO;
    if (!quote) {
      body.append(
        "<table><tr><th>Piece</th><th>Qty</th><th>Unit</th><th>Total</th></tr>"
      );
      for (var l : desk.lines(id)) {
        BigDecimal total = ((BigDecimal) l.get("price")).multiply(
          BigDecimal.valueOf(id(l.get("qty")))
        );
        subtotal = subtotal.add(total);
        body
          .append("<tr><td>")
          .append(esc(l.get("name")))
          .append("</td><td>")
          .append(esc(l.get("qty")))
          .append("</td><td>")
          .append(inr(l.get("price")))
          .append("</td><td>")
          .append(inr(total))
          .append("</td></tr>");
      }
      body
        .append("</table><p>Delivery and selected services: ")
        .append(inr(((BigDecimal) w.get("amount")).subtract(subtotal)))
        .append("</p>");
    }
    body
      .append("<h2>Total: ")
      .append(inr(w.get("amount")))
      .append("</h2>");
    if (quote) body
      .append("<p>Valid through ")
      .append(esc(w.get("valid_until")))
      .append("</p>");
    else body
      .append("<p>Net collections: ")
      .append(inr(desk.balance(id)))
      .append("<br>Outstanding, after credits: ")
      .append(inr(desk.outstanding(id)))
      .append("</p>");
    body
      .append("<small>Record #")
      .append(id)
      .append(" · ")
      .append(esc(w.get("stage")))
      .append("</small></html>");
    return ResponseEntity.ok()
      .header(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"
      )
      .body(body.toString());
  }
}
