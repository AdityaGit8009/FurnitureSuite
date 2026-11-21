import React, { useEffect, useRef, useState } from "react";
import { X, LoaderCircle } from "lucide-react";
let csrf = "";
export async function api(path, body) {
  let form = body instanceof FormData;
  let res = await fetch("/api" + path, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined
        ? {}
        : form
          ? { "X-CSRF-Token": csrf }
          : { "X-CSRF-Token": csrf, "Content-Type": "application/json" },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
  });
  let data;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    if (
      res.status === 401 &&
      !/^\/(login|register|recover|session)(\/|$)/.test(path)
    )
      window.dispatchEvent(new Event("studio-signin-expired"));
    throw Error(
      data?.message ||
        "Request failed (" + res.status + "). Refresh and try again.",
    );
  }
  if (data?.csrf) csrf = data.csrf;
  return data;
}
export const rupee = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(n || 0));
export const label = (s) =>
  String(s || "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (c) => c.toUpperCase());
export const allow = (u, ...roles) =>
  u && (u.role === "SUPER_ADMIN" || roles.includes(u.role));
export const typeNames = {
  ORDER: "Sales orders",
  LEAD: "Leads & quotations",
  JOB: "Workshop jobs",
  PURCHASE: "Purchase orders",
  TRANSFER: "Stock transfers",
  VISIT: "Appointments",
  TICKET: "Service tickets",
  RETURN: "Returns",
  CAMPAIGN: "Campaigns",
  REVIEW: "Product reviews",
};
export function Modal({ title, close, children, wide, className = "" }) {
  let ref = useRef(null);
  useEffect(() => {
    let before = document.activeElement;
    let body = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current.focus();
    function key(e) {
      if (document.body.dataset.paymentDialog) return;
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        let list = [
          ...ref.current.querySelectorAll(
            'button:not(:disabled),input:not(:disabled),select,textarea,a[href],[tabindex="0"]',
          ),
        ];
        if (!list.length) return;
        if (
          e.shiftKey &&
          (document.activeElement === list[0] ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          list.at(-1).focus();
        } else if (!e.shiftKey && document.activeElement === list.at(-1)) {
          e.preventDefault();
          list[0].focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = body;
      document.removeEventListener("keydown", key);
      before?.focus();
    };
  }, []);
  return (
    <div
      className="veil"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        className={"dialog " + (wide ? "wide " : "") + className}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        tabIndex="-1"
      >
        <header>
          <h2>{title}</h2>
          <button aria-label="Close dialog" className="icon" onClick={close}>
            <X />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function Field({ f }) {
  let [key, title, type = "text", options, def, optional] = f;
  return (
    <label className="field">
      {title}
      {type === "select" ? (
        <select name={key} defaultValue={def ?? ""} required={!optional}>
          {(def == null || def === "") && <option value="">Choose…</option>}
          {(options || []).map((o) => {
            let [v, t] = Array.isArray(o) ? o : [o, o];
            return (
              <option key={v} value={v}>
                {t}
              </option>
            );
          })}
        </select>
      ) : type === "textarea" ? (
        <textarea
          name={key}
          rows="3"
          defaultValue={def ?? ""}
          required={!optional}
        />
      ) : (
        <input
          name={key}
          type={type}
          autoComplete={
            key === "otp"
              ? "one-time-code"
              : type === "email"
                ? "email"
                : type === "password"
                  ? /new|12\+/.test(title.toLowerCase())
                    ? "new-password"
                    : "current-password"
                  : undefined
          }
          inputMode={key === "otp" ? "numeric" : undefined}
          pattern={key === "otp" ? "[0-9]{6}" : undefined}
          maxLength={key === "otp" ? 6 : undefined}
          defaultValue={def ?? ""}
          step={type === "number" ? "any" : undefined}
          required={!optional}
        />
      )}
    </label>
  );
}
export function Form({ fields, submit, button = "Save", children }) {
  let [busy, B] = useState(false),
    [error, E] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        let b = Object.fromEntries(new FormData(e.currentTarget));
        B(true);
        E("");
        try {
          await submit(b);
        } catch (x) {
          E(x.message);
        } finally {
          B(false);
        }
      }}
    >
      <div className="fields">
        {fields.map((f) => (
          <Field key={f[0]} f={f} />
        ))}
      </div>
      {children}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button className="primary" disabled={busy}>
        {busy ? <LoaderCircle size={17} /> : null}
        {button}
      </button>
    </form>
  );
}
export function Badge({ children }) {
  return <span className="badge">{label(children)}</span>;
}
