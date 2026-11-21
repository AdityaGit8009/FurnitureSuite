package in.apsp.suite;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.sql.*;
import java.util.*;
import javax.crypto.*;
import javax.crypto.spec.*;
import org.h2.tools.RunScript;

/** Offline recovery utility. Restore only into a new database. */
final class Recovery {

  static void run(String[] a) throws Exception {
    if (
      a.length < 2 || (!a[0].equals("--backup") && !a[0].equals("--restore"))
    ) throw new IllegalArgumentException(
      "Use --backup archive or --restore archive new-database-path"
    );
    boolean backup = a[0].equals("--backup");
    Path archive = Path.of(a[1]);
    String phrase = System.getenv("APSP_BACKUP_PASSWORD");
    char[] pwd =
      phrase == null && System.console() != null
        ? System.console().readPassword("Backup passphrase: ")
        : Objects.toString(phrase, "").toCharArray();
    if (pwd.length < 16) throw new IllegalArgumentException(
      "Use a backup passphrase of at least 16 characters"
    );
    byte[] salt = new byte[16],
      iv = new byte[12];
    byte[] magic = "APSP01".getBytes(StandardCharsets.US_ASCII);
    if (backup) {
      SecureRandom rng = new SecureRandom();
      rng.nextBytes(salt);
      rng.nextBytes(iv);
      try (
        Connection db = DriverManager.getConnection(
          "jdbc:h2:file:./data/furniture;IFEXISTS=TRUE",
          "sa",
          ""
        );
        var stmt = db.createStatement();
        var rows = stmt.executeQuery("SCRIPT");
        var raw = Files.newOutputStream(archive, StandardOpenOption.CREATE_NEW)
      ) {
        raw.write(magic);
        raw.write(salt);
        raw.write(iv);
        try (
          var encrypted = new CipherOutputStream(
            raw,
            cipher(Cipher.ENCRYPT_MODE, pwd, salt, iv)
          );
          var text = new BufferedWriter(
            new OutputStreamWriter(encrypted, StandardCharsets.UTF_8)
          )
        ) {
          while (rows.next()) {
            text.write(rows.getString(1));
            text.newLine();
          }
        }
      }
    } else {
      if (a.length != 3) throw new IllegalArgumentException(
        "Specify a fresh database path"
      );
      Path target = Path.of(a[2]).toAbsolutePath().normalize();
      if (
        Files.exists(Path.of(target + ".mv.db")) ||
        target.toString().contains(";")
      ) throw new IllegalArgumentException("Choose a fresh database path");
      try (var stream = new DataInputStream(Files.newInputStream(archive))) {
        if (!Arrays.equals(magic, stream.readNBytes(6))) throw new IOException(
          "Invalid archive"
        );
        stream.readFully(salt);
        stream.readFully(iv);
        byte[] plain = cipher(Cipher.DECRYPT_MODE, pwd, salt, iv).doFinal(
          stream.readAllBytes()
        );
        try (
          Connection db = DriverManager.getConnection(
            "jdbc:h2:file:" + target,
            "sa",
            ""
          );
          Reader reader = new InputStreamReader(
            new ByteArrayInputStream(plain),
            StandardCharsets.UTF_8
          )
        ) {
          RunScript.execute(db, reader);
          try (
            var stmt = db.createStatement();
            var result = stmt.executeQuery("select count(*) from person")
          ) {
            result.next();
            System.out.println("Restored accounts: " + result.getInt(1));
          }
        } finally {
          Arrays.fill(plain, (byte) 0);
        }
      }
    }
    Arrays.fill(pwd, '\0');
    System.out.println(
      backup ? "Encrypted backup created" : "Restore completed"
    );
  }

  static Cipher cipher(
    int mode,
    char[] pwd,
    byte[] salt,
    byte[] iv
  ) throws Exception {
    var spec = new PBEKeySpec(pwd, salt, 250000, 256);
    try {
      var key = SecretKeyFactory.getInstance(
        "PBKDF2WithHmacSHA256"
      ).generateSecret(spec);
      Cipher aes = Cipher.getInstance("AES/GCM/NoPadding");
      aes.init(
        mode,
        new SecretKeySpec(key.getEncoded(), "AES"),
        new GCMParameterSpec(128, iv)
      );
      return aes;
    } finally {
      spec.clearPassword();
    }
  }
}
