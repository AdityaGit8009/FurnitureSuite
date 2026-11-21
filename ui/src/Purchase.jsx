import React, { useState } from "react";
import {
  CreditCard,
  Banknote,
  MapPin,
  Mail,
  Package,
  Heart,
  Truck,
  ChevronRight,
  Pencil,
  ShieldCheck,
  ArrowRight,
  ArrowUpRight,
  ShoppingBag,
} from "lucide-react";
import { Form, Modal, api, rupee, allow, label } from "./lib";

export function Checkout({
  user,
  hasFit,
  branch,
  slots,
  summary,
  mode,
  total,
  close,
  place,
}) {
  const canPayOnline =
    user.role === "CUSTOMER" &&
    ["RAZORPAY_TEST", "RAZORPAY_LIVE"].includes(mode);
  const [method, setMethod] = useState(canPayOnline ? mode : "OFFLINE");
  const [includeFit, setIncludeFit] = useState(false);
  const windows = (slots || []).filter(
    (v) => v.branch === branch && v.remaining > 0,
  );
  const recipient =
    user.role === "CUSTOMER"
      ? [user.display_name, user.phone, user.delivery_address]
          .filter(Boolean)
          .join("\n")
      : "";
  return (
    <Modal title="Place order" close={close}>
      <div className="checkout-summary">
        <span>
          <MapPin size={17} />
          {branch} showroom
        </span>
        <strong>{rupee(total)}</strong>
      </div>
      <p className="hint">{summary}</p>
      <fieldset className="payment-methods">
        <legend>Payment method</legend>
        {canPayOnline && (
          <label className={method === mode ? "selected" : ""}>
            <input
              type="radio"
              name="payment-method"
              checked={method === mode}
              onChange={() => setMethod(mode)}
            />
            <CreditCard size={21} />
            <span>
              <b>Razorpay{mode === "RAZORPAY_TEST" ? " · Test mode" : ""}</b>
              <small>
                {mode === "RAZORPAY_TEST"
                  ? "Simulate payment for this order. For a test without SMS, choose Netbanking and select Success on the mock bank page."
                  : "Pay securely online after confirming your order."}
              </small>
            </span>
          </label>
        )}
        <label className={method === "OFFLINE" ? "selected" : ""}>
          <input
            name="payment-method"
            type="radio"
            checked={method === "OFFLINE"}
            onChange={() => setMethod("OFFLINE")}
          />
          <Banknote size={21} />
          <span>
            <b>Pay on delivery</b>
            <small>Pay on delivery or at the showroom.</small>
          </span>
        </label>
      </fieldset>
      <Form
        fields={[
          [
            "detail",
            "Recipient, phone and delivery address",
            "textarea",
            null,
            recipient,
          ],
          [
            "pincode",
            "Delivery pincode",
            "text",
            null,
            user.delivery_pincode || "",
          ],
          ...(windows.length
            ? [
                [
                  "deliverySlot",
                  "Delivery window (optional)",
                  "select",
                  windows.map((v) => [
                    v.id,
                    String(v.starts).replace("T", " ").slice(0, 16) +
                      " – " +
                      String(v.ends).slice(11, 16) +
                      " · " +
                      v.remaining +
                      " available",
                  ]),
                  null,
                  true,
                ],
              ]
            : []),
          ...(allow(user, "CASHIER", "SALES", "ADMIN")
            ? [
                [
                  "customerEmail",
                  "Registered customer email (optional)",
                  "email",
                  null,
                  "",
                  true,
                ],
              ]
            : []),
        ]}
        button={method === "OFFLINE" ? "Confirm order" : "Place order and pay"}
        submit={(b) =>
          place({
            ...b,
            paymentMethod: method,
            includeFit: !!hasFit && includeFit,
          })
        }
      >
        {hasFit && (
          <label className="fit-consent">
            <input
              type="checkbox"
              checked={includeFit}
              onChange={(e) => setIncludeFit(e.target.checked)}
            />{" "}
            Share my saved access measurements with dispatch for this delivery
            address
          </label>
        )}
      </Form>
    </Modal>
  );
}

export function CustomerProfile({
  user,
  desk,
  refresh,
  expires,
  notify,
  open,
  security,
  onShowroom,
  showSaved,
  collection,
}) {
  const [edit, setEdit] = useState(false);
  const orders = desk.work
    .filter((w) => w.kind === "ORDER")
    .sort((a, b) => Number(b.id) - Number(a.id));
  const saved = desk.wishlist?.length || 0;
  const initials = user.display_name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => Array.from(n)[0])
    .join("")
    .toLocaleUpperCase();
  async function save(body) {
    await api("/profile", body);
    await refresh();
    onShowroom(body.branch);
    setEdit(false);
    notify("Profile updated");
  }
  return (
    <main className="customer-profile account-page">
      <nav className="account-crumb" aria-label="Breadcrumb">
        <a href="/#collection">Collection</a>
        <ChevronRight size={14} />
        <span>My account</span>
      </nav>
      <header className="account-hero">
        <div className="account-identity">
          <span className="account-avatar" aria-hidden="true">
            {initials}
          </span>
          <div>
            <small>Customer profile</small>
            <h1>{user.display_name}</h1>
            <p>
              <Mail size={16} />
              {user.email}
            </p>
          </div>
        </div>
        <div className="account-hero-photo" aria-hidden="true">
          <img src="/images/room.jpg" alt="" />
        </div>
      </header>
      <div className="account-shortcuts">
        <a href="#my-orders">
          <span className="account-round">
            <Package size={19} />
          </span>
          <span>
            <strong>{orders.length}</strong>
            <small>My orders</small>
          </span>
          <ChevronRight size={16} />
        </a>
        <button onClick={showSaved}>
          <span className="account-round">
            <Heart size={19} />
          </span>
          <span>
            <strong>{saved}</strong>
            <small>Saved pieces</small>
          </span>
          <ChevronRight size={16} />
        </button>
        <a href="/track-order">
          <span className="account-round">
            <Truck size={19} />
          </span>
          <span>
            <strong>Track an order</strong>
            <small>Delivery updates</small>
          </span>
          <ChevronRight size={16} />
        </a>
      </div>
      <div className="account-grid">
        <section className="account-card">
          <header>
            <div>
              <small>Contact &amp; delivery</small>
              <h2>Delivery profile</h2>
            </div>
            <button onClick={() => setEdit(true)}>
              <Pencil size={15} />
              Edit profile
            </button>
          </header>
          <dl className="account-facts">
            <div>
              <dt>Contact number</dt>
              <dd>{user.phone || "Add a phone number"}</dd>
            </div>
            <div>
              <dt>Preferred showroom</dt>
              <dd>{user.branch}</dd>
            </div>
            <div className="full">
              <dt>Default delivery address</dt>
              <dd>
                {[user.delivery_address, user.delivery_pincode]
                  .filter(Boolean)
                  .join(" ") || "Add a delivery address for checkout."}
              </dd>
            </div>
          </dl>
        </section>
        <section className="account-card security-card">
          <header>
            <div>
              <small>Sign-in &amp; preferences</small>
              <h2>Account security</h2>
            </div>
            <ShieldCheck size={23} />
          </header>
          <div className="security-line">
            <span>Email verification</span>
            <strong>{desk.mfa ? "Enabled" : "Off"}</strong>
          </div>
          <div className="security-line">
            <span>Marketing emails</span>
            <strong>{user.marketing ? "Subscribed" : "Off"}</strong>
          </div>
          {expires && (
            <p className="session-until">
              Signed in until{" "}
              {new Date(expires).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
              .
            </p>
          )}
          <button onClick={security}>
            Account settings <ArrowRight size={15} />
          </button>
        </section>
      </div>
      <section className="account-card account-orders" id="my-orders">
        <header>
          <div>
            <small>Order history</small>
            <h2>My orders</h2>
          </div>
          {orders.length > 0 && (
            <a href="/track-order">
              Track an order <ArrowUpRight size={15} />
            </a>
          )}
        </header>
        {orders.length === 0 ? (
          <div className="account-empty">
            <span className="account-round">
              <ShoppingBag size={23} />
            </span>
            <div>
              <strong>No orders yet</strong>
              <p>
                Furniture orders and receipts will appear here after checkout.
              </p>
            </div>
            <button onClick={collection}>
              Browse furniture <ArrowRight size={15} />
            </button>
          </div>
        ) : (
          orders.map((w) => (
            <button
              key={w.id}
              className="profile-order"
              onClick={() => open(w.id)}
            >
              <Package size={20} />
              <span>
                <b>Order #{w.id}</b>
                <small>
                  {label(w.stage)} · {w.branch}
                </small>
              </span>
              <strong>{rupee(w.amount)}</strong>
              <ChevronRight size={16} />
            </button>
          ))
        )}
      </section>
      {edit && (
        <Modal title="Edit profile" close={() => setEdit(false)}>
          <Form
            fields={[
              ["name", "Full name", "text", null, user.display_name],
              ["phone", "Contact number", "tel", null, user.phone, true],
              [
                "address",
                "Default delivery address",
                "textarea",
                null,
                user.delivery_address,
                true,
              ],
              [
                "pincode",
                "Default pincode",
                "text",
                null,
                user.delivery_pincode,
                true,
              ],
              [
                "branch",
                "Preferred showroom",
                "select",
                desk.branches,
                user.branch,
              ],
            ]}
            button="Save profile"
            submit={save}
          />
          <button className="textbtn" onClick={() => setEdit(false)}>
            Cancel
          </button>
        </Modal>
      )}
    </main>
  );
}
