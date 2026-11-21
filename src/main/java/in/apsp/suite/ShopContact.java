package in.apsp.suite;

import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
class ShopContact {

  final String email;
  final String whatsapp;

  ShopContact(
    @Value("${apsp.shop.email}") String email,
    @Value("${apsp.shop.whatsapp}") String whatsapp
  ) {
    this.email = email;
    this.whatsapp = whatsapp;
    if (
      !whatsapp.matches("[1-9][0-9]{7,14}")
    ) throw new IllegalArgumentException(
      "Use an international WhatsApp number with digits only"
    );
  }

  Map<String, String> publicDetails() {
    return Map.of(
      "email",
      email,
      "whatsapp",
      "+" + whatsapp,
      "whatsappUrl",
      "https://wa.me/" + whatsapp
    );
  }
}
