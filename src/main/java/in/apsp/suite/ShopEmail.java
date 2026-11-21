package in.apsp.suite;

import jakarta.mail.internet.InternetAddress;
import java.nio.charset.StandardCharsets;
import java.util.Properties;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;

@Component
class ShopEmail {

  private final ShopContact shop;
  private final JavaMailSenderImpl sender = new JavaMailSenderImpl();

  ShopEmail(
    ShopContact shop,
    @Value("${apsp.mail.host}") String host,
    @Value("${apsp.mail.port}") int port,
    @Value("${apsp.mail.password}") String password
  ) {
    this.shop = shop;
    sender.setHost(host);
    sender.setPort(port);
    sender.setUsername(shop.email);
    sender.setPassword(password);
    Properties options = sender.getJavaMailProperties();
    options.setProperty("mail.smtp.auth", "true");
    options.setProperty("mail.smtp.starttls.enable", "true");
    options.setProperty("mail.smtp.starttls.required", "true");
    options.setProperty("mail.smtp.ssl.checkserveridentity", "true");
    for (String timeout : new String[] {
      "connectiontimeout",
      "timeout",
      "writetimeout",
    }) {
      options.setProperty("mail.smtp." + timeout, "7000");
    }
  }

  synchronized void connect(String password) {
    String previous = sender.getPassword();
    sender.setPassword(password);
    try {
      sender.testConnection();
    } catch (jakarta.mail.MessagingException e) {
      sender.setPassword(previous);
      throw Store.fail(
        400,
        "Gmail connection failed. Check the App Password and the server network connection."
      );
    }
  }

  synchronized void verify() {
    if (!enabled()) throw Store.fail(
      409,
      "Configure the showroom Gmail App Password first"
    );
    try {
      sender.testConnection();
    } catch (jakarta.mail.MessagingException e) {
      throw Store.fail(502, "Gmail SMTP authentication or connection failed");
    }
  }

  synchronized boolean enabled() {
    return !sender.getPassword().isBlank();
  }

  String recipient(boolean shopAlert, String accountEmail) {
    return shopAlert ? shop.email : accountEmail;
  }

  synchronized void send(
    String recipient,
    String subject,
    String text,
    String eventId
  ) throws Exception {
    InternetAddress destination = new InternetAddress(recipient, true);
    destination.validate();
    var message = sender.createMimeMessage();
    var mail = new MimeMessageHelper(message, StandardCharsets.UTF_8.name());
    mail.setFrom(shop.email, "APSP Furniture Studio");
    mail.setReplyTo(shop.email);
    mail.setTo(destination);
    mail.setSubject(subject);
    mail.setText(text, false);
    message.setHeader("X-Studio-Event", eventId);
    sender.send(message);
  }
}
