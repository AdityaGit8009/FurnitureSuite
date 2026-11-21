"""Local STARTTLS mail routing test. Run after packaging; no internet mail is sent."""
import http.cookiejar
import json
import os
from pathlib import Path
import queue
import re
import urllib.error
import secrets
import shutil
import socketserver
import ssl
import subprocess
import tempfile
import threading
import time
import urllib.request
from email import policy
from email.parser import BytesParser

jar = Path(os.getenv("APSP_TEST_JAR", "../target/furniture-suite-1.0.0.jar")).resolve()
java = Path(os.environ["APSP_JAVA"])
keytool = java.with_name("keytool.exe" if os.name == "nt" else "keytool")
openssl = shutil.which("openssl") or r"C:\Program Files\Git\usr\bin\openssl.exe"
messages = queue.Queue()

class Sink(socketserver.StreamRequestHandler):
    def reply(self, text):
        self.wfile.write(text.encode() + b"\r\n")
    def handle(self):
        secured = False
        authenticated = False
        self.reply("220 localhost test mail")
        while raw := self.rfile.readline():
            line = raw.decode(errors="replace").strip()
            command = line.split(" ", 1)[0].upper()
            if command == "EHLO":
                self.reply("250-localhost")
                self.reply("250 AUTH PLAIN" if secured else "250 STARTTLS")
            elif command == "STARTTLS" and not secured:
                self.reply("220 Ready")
                self.connection = self.server.context.wrap_socket(self.connection, server_side=True)
                self.rfile = self.connection.makefile("rb")
                self.wfile = self.connection.makefile("wb", buffering=0)
                secured = True
            elif command == "AUTH" and secured:
                import base64
                token = line.split()[2] if len(line.split()) > 2 else None
                if not token:
                    self.reply("334 ")
                    token = self.rfile.readline().strip()
                username, password = base64.b64decode(token).split(b"\0")[-2:]
                authenticated = username == b"shop@example.test" and password == self.server.test_password.encode()
                self.reply("235 Authenticated" if authenticated else "535 Rejected")
            elif command == "DATA" and authenticated:
                self.reply("354 End with dot")
                data = bytearray()
                while part := self.rfile.readline():
                    if part == b".\r\n":
                        break
                    data.extend(part)
                messages.put(BytesParser(policy=policy.default).parsebytes(bytes(data)))
                self.reply("250 Queued")
            elif command == "QUIT":
                self.reply("221 Bye")
                break
            else:
                self.reply("250 OK" if authenticated else "530 Authenticate first")

with tempfile.TemporaryDirectory(prefix="apsp-email-") as folder:
    tmp = Path(folder)
    def run(args):
        subprocess.run(args, cwd=tmp, check=True, capture_output=True)
    run([openssl,"req","-x509","-newkey","rsa:2048","-nodes","-subj","/CN=localhost","-addext","subjectAltName=DNS:localhost,IP:127.0.0.1","-days","1","-keyout","test.key","-out","test.crt"])
    run([keytool,"-importcert","-noprompt","-alias","test","-file","test.crt","-keystore","trust.p12","-storepass","testtrust"])
    with socketserver.ThreadingTCPServer(("127.0.0.1",0),Sink) as server:
        server.context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        server.context.load_cert_chain(tmp/"test.crt",tmp/"test.key")
        server.test_password = secrets.token_hex(16)
        threading.Thread(target=server.serve_forever,daemon=True).start()
        with socketserver.TCPServer(("127.0.0.1",0),socketserver.BaseRequestHandler) as free:
            port = free.server_address[1]
        base = f"http://127.0.0.1:{port}/api"
        env = dict(os.environ, APSP_GMAIL_APP_PASSWORD="", APSP_SMTP_HOST="127.0.0.1",APSP_SMTP_PORT=str(server.server_address[1]),APSP_PORT=str(port),APSP_OWNER_PASSWORD=secrets.token_hex(16),APSP_NOTIFICATION_URL="",APSP_NOTIFICATION_SECRET="")
        with (tmp/"app.log").open("wb") as log:
            app = subprocess.Popen([java,f"-Djavax.net.ssl.trustStore={tmp/'trust.p12'}","-Djavax.net.ssl.trustStorePassword=testtrust","-jar",jar,"--apsp.shop.email=shop@example.test"],cwd=tmp,env=env,stdout=log,stderr=log)
            try:
                http=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
                csrf=""
                def request(path, body=None):
                    req=urllib.request.Request(base+path, data=None if body is None else json.dumps(body).encode(),headers={"Content-Type":"application/json","X-CSRF-Token":csrf})
                    with http.open(req,timeout=18) as res:
                        raw = res.read()
                        return json.loads(raw) if raw else None
                for _ in range(240):
                    try:
                        csrf=request("/session")["csrf"]
                        break
                    except OSError:
                        time.sleep(.5)
                assert csrf, "Server unavailable"
                assert request("/catalog")["contact"]["whatsappUrl"]=="https://wa.me/917390916220"
                csrf=request("/login",{"email":"owner@apsp.local","password":env["APSP_OWNER_PASSWORD"]})["csrf"]
                request("/admin/email",{"current":env["APSP_OWNER_PASSWORD"],"appPassword":server.test_password})
                request("/studio/mail",{"branch":"Central","kind":"LEAD","version":0,"subject":"Consultation for {{name}}","body":"Showroom update: {{message}}. Branch: {{branch}}"})
                request("/logout",{})
                csrf=request("/session")["csrf"]
                buyer_pw=secrets.token_hex(16)
                assert request("/register",{"name":"Buyer","email":"buyer@example.test","password":buyer_pw})=={"registered":True}
                assert request("/session")["user"] is None
                csrf=request("/login",{"email":"buyer@example.test","password":buyer_pw})["csrf"]
                lead=request("/work",{"kind":"LEAD","title":"Local fixture"})["id"]
                mail=[messages.get(timeout=55),messages.get(timeout=12)]
                assert {m["To"].addresses[0].addr_spec for m in mail}=={"shop@example.test","buyer@example.test"}
                assert all(str(m["Subject"]).startswith("Consultation for ") and "Branch: Central" in m.get_content() for m in mail)
                assert all(m["From"].addresses[0].addr_spec=="shop@example.test" and m["Reply-To"].addresses[0].addr_spec=="shop@example.test" and str(lead) in m.get_content() for m in mail)
                print("PASS: verified STARTTLS, SMTP auth, shop and customer routing, From, Reply-To, and WhatsApp contact URL.")
                def rejected(path, body, expected):
                    try:
                        request(path, body)
                    except urllib.error.HTTPError as err:
                        assert err.code == expected, (path, err.code)
                    else:
                        raise AssertionError(path + " should have failed")
                def verified_mail(reason):
                    message = messages.get(timeout=12)
                    assert message["To"].addresses[0].addr_spec == "buyer@example.test"
                    assert message["From"].addresses[0].addr_spec == "shop@example.test"
                    assert reason in message.get_content()
                    return re.search(r"Enter ([0-9]{6}) ", message.get_content()).group(1)
                recovery = request("/mfa/start", {"password":buyer_pw})
                assert recovery["destination"]=="buyer@example.test" and "secret" not in recovery
                enroll_code = verified_mail("turn on two-step sign-in")
                rejected("/mfa/resend", {}, 429)
                rejected("/mfa/confirm", {"otp":"x"}, 400)
                request("/mfa/confirm", {"otp":enroll_code})
                assert request("/desk")["mfa"] is True
                request("/logout", {})
                csrf=request("/session")["csrf"]
                challenge=request("/login", {"email":"buyer@example.test","password":buyer_pw})
                assert challenge["otpRequired"] and "user" not in challenge and request("/session")["user"] is None
                login_code=verified_mail("sign in")
                rejected("/login/resend", {}, 429)
                for _ in range(5):
                    rejected("/login/verify", {"otp":"x"}, 400)
                rejected("/login/verify", {"otp":login_code}, 400)
                time.sleep(max(0,(challenge["resendAt"]-time.time()*1000)/1000)+.15)
                request("/login/resend", {})
                code=verified_mail("sign in")
                other=urllib.request.build_opener(urllib.request.HTTPCookieProcessor())
                other_csrf=json.loads(other.open(base+"/session").read())["csrf"]
                outsider=urllib.request.Request(base+"/login/verify",data=json.dumps({"otp":code}).encode(),headers={"Content-Type":"application/json","X-CSRF-Token":other_csrf})
                try: other.open(outsider)
                except urllib.error.HTTPError as err: assert err.code==400
                else: raise AssertionError("OTP belonged to another browser")
                csrf=request("/login/verify",{"otp":code})["csrf"]
                assert request("/session")["user"]["email"]=="buyer@example.test"
                rejected("/login/verify",{"otp":code},400)
                request("/logout",{})
                csrf=request("/session")["csrf"]
                assert request("/recover/request",{"email":"absent@example.test"})["requested"]
                assert request("/recover/request",{"email":"buyer@example.test"})["requested"]
                reset_code=verified_mail("reset your password")
                new_pw=secrets.token_hex(16)
                request("/recover/confirm",{"otp":reset_code,"password":new_pw})
                rejected("/recover/confirm",{"otp":reset_code,"password":new_pw},400)
                rejected("/login",{"email":"buyer@example.test","password":buyer_pw},401)
                assert request("/session")["user"] is None
                print("PASS: registration stays signed out, SMTP email enrolment, login OTP, wrong-code limit, cooldown, cross-browser rejection, single use and email recovery.")
            finally:
                app.terminate()
                app.wait(timeout=15)
                server.shutdown()
