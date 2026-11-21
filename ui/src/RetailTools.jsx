import React, { useState, useEffect } from "react";
import { api, Form, rupee, label } from "./lib";
export function DeliveryWindows({ u, refresh, notify }) {
  const [slots, S] = useState([]),
    [error, E] = useState("");
  async function load() {
    S(await api("/shop-tools/windows"));
  }
  useEffect(() => {
    load().catch((e) => E(e.message));
  }, []);
  return (
    <div className="cms-split">
      <section className="panel editor">
        <h2>Offer a delivery window</h2>
        <Form
          fields={[
            [
              "branch",
              "Showroom",
              "select",
              u.role === "SUPER_ADMIN" ? ["Central", "North"] : [u.branch],
              u.branch,
            ],
            ["start", "Starts (showroom local time)", "datetime-local"],
            ["end", "Ends", "datetime-local"],
            ["capacity", "Maximum orders", "number"],
          ]}
          button="Open window"
          submit={async (b) => {
            await api("/shop-tools/windows", b);
            await load();
            await refresh();
            notify("Window available at checkout");
          }}
        />
      </section>
      <section className="panel editor">
        <h2>Delivery windows</h2>
        {error && <p className="error">{error}</p>}
        {!slots.length && <p>No scheduled windows yet.</p>}
        {slots.map((v) => (
          <div className="listlink" key={v.id}>
            <div>
              <b>{v.branch}</b>
              <small>
                {String(v.starts).replace("T", " ").slice(0, 16)} –{" "}
                {String(v.ends).slice(11, 16)}
              </small>
              <small>
                {v.booked} of {v.capacity} reserved
              </small>
            </div>
            {v.active ? (
              <button
                onClick={async () => {
                  try {
                    await api("/shop-tools/windows/" + v.id + "/close", {});
                    await load();
                    await refresh();
                  } catch (e) {
                    E(e.message);
                  }
                }}
              >
                Close bookings
              </button>
            ) : (
              <small>Closed</small>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
export function PriceWatches() {
  const [list, L] = useState([]),
    [error, E] = useState("");
  async function load() {
    L(await api("/shop-tools/watches"));
  }
  useEffect(() => {
    load().catch((e) => E(e.message));
  }, []);
  return list.length || error ? (
    <div className="panel">
      <h3>My price alerts</h3>
      {error && <p className="error">{error}</p>}
      {list.map((p) => (
        <div className="listlink" key={p.id}>
          {p.name} · {rupee(p.target)}
          <button
            onClick={async () => {
              try {
                await api("/shop-tools/watch/" + p.id + "/remove", {});
                await load();
              } catch (e) {
                E(e.message);
              }
            }}
          >
            Remove alert
          </button>
        </div>
      ))}
    </div>
  ) : null;
}
let checkoutScript;
function sdk() {
  if (window.Razorpay) return Promise.resolve();
  if (!checkoutScript)
    checkoutScript = new Promise((res, rej) => {
      const el = document.createElement("script");
      el.src = "https://checkout.razorpay.com/v1/checkout.js";
      el.onload = () => res();
      el.onerror = () => {
        checkoutScript = null;
        el.remove();
        rej(Error("Checkout could not load. Check the network and retry."));
      };
      document.head.append(el);
    });
  return checkoutScript;
}
function launch(options, onSuccess, onError, onDismiss) {
  if (document.body.dataset.paymentDialog)
    throw Error("A payment window is already open.");
  const release = () => {
    delete document.body.dataset.paymentDialog;
  };
  const checkout = new window.Razorpay({
    ...options,
    modal: {
      ondismiss: () => {
        release();
        onDismiss?.();
      },
    },
    handler: async (result) => {
      release();
      try {
        await onSuccess(result);
      } catch (e) {
        onError(e.message);
      }
    },
  });
  checkout.on("payment.failed", () =>
    onError("Payment attempt failed. You can retry from this order."),
  );
  document.body.dataset.paymentDialog = "open";
  try {
    checkout.open();
  } catch (e) {
    release();
    throw e;
  }
}

async function openTestCheckout(path, completed, failed, dismissed) {
  await sdk();
  const options = await api(path, {});
  if (options.status) {
    await completed(options.status);
    return;
  }
  launch(
    options,
    async (result) => {
      const receipt = await api(
        "/test-payments/orders/" + options.order_id + "/verify",
        result,
      );
      await completed(receipt.status);
    },
    failed,
    dismissed,
  );
}

export async function openPurchasePayment(id, mode, notice) {
  if (mode === "RAZORPAY_TEST") {
    await openTestCheckout(
      "/work/" + id + "/test-checkout",
      (status) =>
        notice(
          "Test payment " + label(status).toLowerCase() + " · Order #" + id,
        ),
      notice,
      () =>
        notice(
          "Checkout closed. You can resume payment from order #" + id + ".",
        ),
    );
    return;
  }
  if (mode !== "RAZORPAY_LIVE") throw Error("Online payment is unavailable.");
  await sdk();
  const options = await api("/work/" + id + "/checkout", {});
  launch(
    options,
    () =>
      notice("Payment submitted. Refresh the order for gateway confirmation."),
    notice,
    () => notice("Checkout closed. You can reopen order #" + id + "."),
  );
}

export function orderPaymentLabel(w) {
  if (
    w.amount - w.return_credit - w.collected <= 0 &&
    (w.collected > 0 || w.return_credit > 0)
  )
    return "Paid";
  if (w.collected > 0) return "Partly paid";
  if (w.test_status) return "Test · " + label(w.test_status);
  if (w.payment_method === "RAZORPAY_LIVE") return "Online · Awaiting payment";
  if (w.payment_method === "RAZORPAY_TEST") return "Test · Awaiting payment";
  return "Pay on delivery";
}

export function OrderPayment({ data, user, load, notify }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const w = data.record,
    receipts = data.testReceipts || [],
    mode = data.checkoutMode;
  const mine = user.role === "CUSTOMER" && w.person_id === user.id;
  const test = mode === "RAZORPAY_TEST";
  const accepted = receipts.some(
    (p) =>
      Number(p.amount_paise) === Math.round(Number(data.due) * 100) &&
      ["AUTHORIZED", "PENDING", "CAPTURED"].includes(p.status),
  );
  const canPay =
    w.stage !== "CANCELLED" &&
    data.due > 0 &&
    (test ? mine && !accepted : data.onlinePay);
  if (!canPay && !receipts.length) return null;
  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const update = async (message) => {
    notify(message);
    await load().catch((e) => setError(e.message));
  };
  return (
    <section className="order-payment">
      <h3>Payment</h3>
      {canPay && (
        <button
          className="primary"
          disabled={busy}
          onClick={() => run(() => openPurchasePayment(w.id, mode, update))}
        >
          {test ? "Pay with Razorpay · Test" : "Pay online"} · {rupee(data.due)}
        </button>
      )}
      {test && canPay && <small>Test mode simulates this order amount.</small>}
      {receipts.map((p) => (
        <div key={p.provider_order} className="listlink">
          <div>
            <b>Test receipt · {label(p.status)}</b>
            <small>
              {rupee(p.amount_paise / 100)} · {p.provider_order}
            </small>
            {p.payment_id && <small>{p.payment_id}</small>}
          </div>
          {mine && !["FAILED", "CAPTURED"].includes(p.status) && (
            <button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const receipt = await api(
                    "/test-payments/orders/" + p.provider_order + "/refresh",
                    {},
                  );
                  notify("Test payment status: " + label(receipt.status));
                })
              }
            >
              Check payment status
            </button>
          )}
        </div>
      ))}
      {receipts.length > 0 && (
        <small>
          Simulated receipts are recorded separately from money collected.
        </small>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export function RazorpayTest({ notify }) {
  const [state, S] = useState(null),
    [error, E] = useState(""),
    [busy, B] = useState(false);
  async function load() {
    S(await api("/test-payments"));
  }
  useEffect(() => {
    load().catch((e) => E(e.message));
  }, []);
  async function run(fn) {
    E("");
    B(true);
    try {
      await fn();
      await load();
    } catch (e) {
      E(e.message);
    } finally {
      B(false);
    }
  }
  function start(path) {
    return run(() =>
      openTestCheckout(
        path,
        async (status) => {
          notify("Test payment: " + status);
          await load();
        },
        E,
      ),
    );
  }
  return (
    <div className="cms-split">
      <section className="panel editor">
        <h2>Razorpay test checkout</h2>
        <p>
          Try a simulated ₹100 payment. Test receipts appear here and do not
          change sales, stock or the cash ledger.
        </p>
        <p className="account-notice">
          <strong>Testing without an SMS?</strong> Choose Netbanking, select a
          bank and press Success on the mock bank page. A Captured receipt
          confirms the test payment.
        </p>
        <p>
          <a
            href="https://dashboard.razorpay.com/"
            target="_blank"
            rel="noreferrer"
          >
            Open Razorpay Dashboard
          </a>{" "}
          → Test Mode → Account &amp; Settings → API Keys → Generate Key.
        </p>
        {!state ? (
          <p>
            {error
              ? "Could not load test payment settings."
              : "Loading test payment settings…"}
          </p>
        ) : state.connected ? (
          <>
            <p>
              <b>Test credentials configured</b>
            </p>
            <div className="row wrap">
              <button
                className="primary"
                disabled={busy}
                onClick={() => start("/test-payments/orders")}
              >
                Run ₹100 test payment
              </button>
              <button
                disabled={busy}
                onClick={() => run(() => api("/test-payments/disconnect", {}))}
              >
                Disconnect
              </button>
            </div>
          </>
        ) : (
          <Form
            fields={[
              ["password", "Current Studio password", "password"],
              ["keyId", "Test Key ID (rzp_test_…)"],
              ["secret", "Test Key Secret", "password"],
            ]}
            button="Connect test keys"
            submit={async (b) => {
              await api("/test-payments/connect", b);
              await load();
              notify("Test credentials verified");
            }}
          />
        )}
        <small>Keys entered here stay in server memory until restart.</small>
        {error && <p className="error">{error}</p>}
      </section>
      <section className="panel editor">
        <h2>Test receipts</h2>
        {!state?.orders?.length && <p>No test orders yet.</p>}
        {state?.orders.map((o) => (
          <div className="listlink" key={o.provider_order}>
            <div>
              <b>
                {rupee(o.amount_paise / 100)} · {label(o.status)}
              </b>
              <small>{o.provider_order}</small>
            </div>
            {state.connected && o.status === "CREATED" && (
              <button
                disabled={busy}
                onClick={() =>
                  start("/test-payments/orders/" + o.provider_order + "/resume")
                }
              >
                Resume test checkout
              </button>
            )}
            {o.payment_id && !["CAPTURED", "FAILED"].includes(o.status) && (
              <button
                onClick={() =>
                  run(() =>
                    api(
                      "/test-payments/orders/" + o.provider_order + "/refresh",
                      {},
                    ),
                  )
                }
              >
                Refresh status
              </button>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
