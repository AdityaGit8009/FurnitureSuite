import React, { useEffect, useState } from "react";
import { MailCheck } from "lucide-react";
import { api, Form, Modal } from "./lib";

function EmailCode({
  challenge,
  onResend,
  onVerify,
  button,
  reset = false,
  notice,
}) {
  const [until, setUntil] = useState(challenge.resendAt || 0);
  const [now, setNow] = useState(Date.now);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    if (now >= until) return;
    const t = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(t);
  }, [until, now]);
  async function resend() {
    setSending(true);
    try {
      const next = await onResend();
      setNow(Date.now());
      setUntil(next.resendAt);
      setFeedback(
        reset
          ? "If this account exists, check its inbox for the latest code."
          : "A new code was sent. Use the latest email.",
      );
    } catch (e) {
      setFeedback(e.message);
    } finally {
      setSending(false);
    }
  }
  return (
    <>
      <div className="code-delivery">
        <MailCheck aria-hidden="true" size={22} />
        <div>
          {notice || (
            <>
              Check the inbox for <strong>{challenge.destination}</strong>.
            </>
          )}
          <small>
            Enter the six digits from the latest email within 10 minutes. Check
            Spam if needed.
          </small>
        </div>
      </div>
      <Form
        fields={[
          ["otp", "Email verification code"],
          ...(reset
            ? [["password", "New password (12+ characters)", "password"]]
            : []),
        ]}
        button={button}
        submit={onVerify}
      />
      <button
        type="button"
        className="textbtn"
        disabled={sending || now < until}
        onClick={resend}
      >
        {now < until
          ? "Resend code in " + Math.ceil((until - now) / 1000) + "s"
          : "Resend email code"}
      </button>
      {feedback && (
        <p role="status" className="hint">
          {feedback}
        </p>
      )}
    </>
  );
}

export function EmailEnrollment({ close, refresh, notify }) {
  const [challenge, setChallenge] = useState(null);
  return (
    <Modal
      title={challenge ? "Verify your email" : "Set up email verification"}
      close={close}
    >
      {challenge ? (
        <EmailCode
          challenge={challenge}
          onResend={() => api("/mfa/resend", {})}
          button="Enable email verification"
          onVerify={async (b) => {
            await api("/mfa/confirm", b);
            await refresh();
            close();
            notify("Two-step sign-in by email is enabled.");
          }}
        />
      ) : (
        <>
          <p className="hint">
            Confirm your password to send a code to your account email.
          </p>
          <Form
            fields={[["password", "Current password", "password"]]}
            button="Send email code"
            submit={async (b) => setChallenge(await api("/mfa/start", b))}
          />
        </>
      )}
    </Modal>
  );
}

export function Login({ after, close, refresh, notify }) {
  const [step, setStep] = useState("login"),
    [email, setEmail] = useState(""),
    [message, setMessage] = useState(""),
    [challenge, setChallenge] = useState(null);
  const titles = {
    login: "Sign in to APSP Studio",
    register: "Create customer account",
    code: "Check your email",
    reset: "Recover your account",
    resetCode: "Reset your password",
    backup: "Use a saved recovery key",
  };
  function move(next) {
    setMessage("");
    setStep(next);
  }
  async function signedIn() {
    await refresh();
    close();
    after?.();
    notify("Signed in");
  }
  async function requestReset(address) {
    return api("/recover/request", { email: address });
  }
  function resetDone() {
    setStep("login");
    setMessage("Password updated. Sign in with your new password.");
  }
  const registering = step === "register";
  return (
    <Modal title={titles[step]} close={close}>
      {message && (
        <p className="account-notice" role="status">
          {message}
        </p>
      )}
      {["login", "register"].includes(step) && (
        <>
          <p className="hint">
            {registering
              ? "Create an account to save furniture and track orders."
              : "Use your customer or staff account."}
          </p>
          <Form
            key={step}
            fields={[
              ...(registering
                ? [
                    ["name", "Full name"],
                    [
                      "branch",
                      "Preferred showroom",
                      "select",
                      ["Central", "North"],
                      "Central",
                    ],
                  ]
                : []),
              ["email", "Email", "email", null, email],
              [
                "password",
                registering ? "Password (12+ characters)" : "Password",
                "password",
              ],
            ]}
            button={registering ? "Create account" : "Sign in"}
            submit={async (b) => {
              if (registering) {
                await api("/register", b);
                setEmail(b.email);
                setStep("login");
                setMessage("Account created. Enter your password to sign in.");
                return;
              }
              const result = await api("/login", b);
              setEmail(b.email);
              if (result.otpRequired) {
                setChallenge(result);
                move("code");
              } else await signedIn();
            }}
          />
          {!registering && (
            <button className="textbtn" onClick={() => move("reset")}>
              Recover account
            </button>
          )}
          <button
            className="textbtn"
            onClick={() => move(registering ? "login" : "register")}
          >
            {registering
              ? "Already registered? Sign in"
              : "New customer? Create an account"}
          </button>
        </>
      )}
      {step === "code" && (
        <EmailCode
          challenge={challenge}
          button="Verify and sign in"
          onResend={() => api("/login/resend", {})}
          onVerify={async (b) => {
            await api("/login/verify", b);
            await signedIn();
          }}
        />
      )}
      {step === "reset" && (
        <>
          <p className="hint">
            Enter your account email to request a password reset code.
          </p>
          <Form
            key="reset"
            fields={[["email", "Account email", "email", null, email]]}
            button="Send reset code"
            submit={async (b) => {
              const c = await requestReset(b.email);
              setEmail(b.email);
              setChallenge(c);
              move("resetCode");
            }}
          />
          <button className="textbtn" onClick={() => move("backup")}>
            Use a saved recovery key
          </button>
        </>
      )}
      {step === "resetCode" && (
        <EmailCode
          reset
          challenge={challenge}
          notice="If an account matches, a code was sent to its email."
          button="Reset password"
          onResend={() => requestReset(email)}
          onVerify={async (b) => {
            await api("/recover/confirm", b);
            resetDone();
          }}
        />
      )}
      {step === "backup" && (
        <Form
          key="backup"
          fields={[
            ["email", "Account email", "email", null, email],
            ["key", "Saved recovery key", "password"],
            ["password", "New password (12+ characters)", "password"],
          ]}
          button="Reset password"
          submit={async (b) => {
            await api("/recover", b);
            setEmail(b.email);
            resetDone();
          }}
        />
      )}
      {!["login", "register"].includes(step) && (
        <button className="textbtn" onClick={() => move("login")}>
          Back to sign in
        </button>
      )}
    </Modal>
  );
}
