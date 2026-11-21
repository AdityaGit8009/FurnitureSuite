package in.apsp.suite;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class Application {

  public static void main(String[] args) throws Exception {
    if (
      args.length > 0 &&
      (args[0].equals("--backup") || args[0].equals("--restore"))
    ) {
      Recovery.run(args);
      return;
    }
    SpringApplication.run(Application.class, args);
  }
}
