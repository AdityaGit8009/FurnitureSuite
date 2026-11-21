import React, { useState, useEffect, useRef } from "react";
import { api, Form, label, rupee } from "./lib";

export const searchText = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const dateTime = (value) =>
  new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export function Reviews({ product, user, refresh, signIn }) {
  const [page, P] = useState(1),
    [result, R] = useState(null),
    [mine, A] = useState(null),
    [editing, E] = useState(false),
    [error, J] = useState(""),
    [tick, T] = useState(0);
  useEffect(() => {
    let current = true;
    J("");
    Promise.all([
      api("/catalog/products/" + product.id + "/reviews?page=" + page),
      user?.role === "CUSTOMER"
        ? api("/products/" + product.id + "/my-review")
        : Promise.resolve([]),
    ])
      .then(([publicReviews, own]) => {
        if (current) {
          R(publicReviews);
          A(own[0] || null);
        }
      })
      .catch((e) => {
        if (current) J(e.message);
      });
    return () => {
      current = false;
    };
  }, [product.id, page, user?.id, tick]);
  return (
    <section className="product-reviews">
      <div className="section-action">
        <h3>Product reviews</h3>
        {result && (
          <small>
            {result.total
              ? Number(result.average).toFixed(1) +
                " / 5 · " +
                result.total +
                " reviews"
              : "No published reviews yet"}
          </small>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {result?.reviews.map((r, i) => (
        <article key={i} className="review-card">
          <strong>
            {r.stars}/5 · {r.title}
          </strong>
          <p>{r.detail}</p>
          <small>
            {r.verified ? "Verified purchase" : "Customer review"}
            {r.edited_by_staff ? " · Edited by showroom" : ""}
          </small>
        </article>
      ))}
      {result?.total > 10 && (
        <div className="row">
          <button disabled={page <= 1} onClick={() => P(page - 1)}>
            Previous reviews
          </button>
          <button
            disabled={page * 10 >= result.total}
            onClick={() => P(page + 1)}
          >
            More reviews
          </button>
        </div>
      )}
      {mine && (
        <p>
          Your review · <b>{label(mine.stage)}</b> · {mine.stars}/5
        </p>
      )}
      {(!user || user.role === "CUSTOMER") && result && !editing && (
        <button onClick={() => (user ? E(true) : signIn())}>
          {mine ? "Edit my review" : "Write a product review"}
        </button>
      )}
      {editing && (
        <>
          <Form
            key={mine?.revision || 0}
            fields={[
              [
                "stars",
                "Rating",
                "select",
                [5, 4, 3, 2, 1].map((n) => [n, n + " / 5"]),
                mine?.stars || 5,
              ],
              ["title", "Review title", "text", null, mine?.title],
              ["detail", "Your review", "textarea", null, mine?.detail],
            ]}
            button="Submit for moderation"
            submit={async (b) => {
              await api("/products/" + product.id + "/review", {
                ...b,
                branch: product.branch,
                revision: mine?.revision || 0,
              });
              E(false);
              P(1);
              T((v) => v + 1);
              await refresh();
            }}
          />
          <button onClick={() => E(false)}>Cancel edit</button>
        </>
      )}
    </section>
  );
}

export function RolePicker({ user, choices, onChange }) {
  const [err, J] = useState(""),
    [busy, B] = useState(false);
  if (!choices || choices.length < 2) return null;
  return (
    <div>
      <label className="field">
        Active staff role
        <select
          value={user.role}
          disabled={busy}
          onChange={async (e) => {
            const role = e.target.value;
            B(true);
            try {
              await api("/account/active-role", { role });
              await onChange();
            } catch (e) {
              J(e.message);
            } finally {
              B(false);
            }
          }}
        >
          {choices.map((r) => (
            <option key={r} value={r}>
              {label(r)}
            </option>
          ))}
        </select>
      </label>
      {err && <p className="error">{err}</p>}
    </div>
  );
}

export function OrderTracker({ user, work, signIn }) {
  const orders = (work || []).filter((w) => w.kind === "ORDER");
  const [selected, S] = useState(
      () => new URLSearchParams(location.search).get("order") || "",
    ),
    [snapshot, D] = useState(null),
    [error, E] = useState("");
  const refresh = useRef(null);
  const order = selected || String(orders[0]?.id || "");
  const scope = [user?.id, user?.role, order].join("|");
  const data = snapshot?.scope === scope ? snapshot.value : null;
  useEffect(() => {
    let current = true,
      loading = false;
    D(null);
    E("");
    if (!user || !order) return;
    if (!/^[1-9]\d*$/.test(order)) {
      E("Enter a valid order number.");
      return;
    }
    async function read() {
      if (loading || document.hidden) return;
      loading = true;
      try {
        const value = await api("/orders/" + order + "/tracking");
        if (current) {
          D({ value, scope, checkedAt: new Date().toISOString() });
          E("");
        }
      } catch (e) {
        if (current) {
          E(e.message);
          if (e.status >= 400 && e.status < 500) D(null);
        }
      } finally {
        loading = false;
      }
    }
    refresh.current = read;
    read();
    const timer = setInterval(read, 15000);
    document.addEventListener("visibilitychange", read);
    window.addEventListener("online", read);
    return () => {
      current = false;
      refresh.current = null;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", read);
      window.removeEventListener("online", read);
    };
  }, [order, user?.id, user?.role, scope]);
  const workshop = data?.workshop?.[0],
    begin = workshop ? ["IN_PRODUCTION", "CONFIRMED"] : ["CONFIRMED"];
  const stages =
    data?.stage === "CANCELLED"
      ? [...begin, "CANCELLED"]
      : [
          ...begin,
          "PACKED",
          "DISPATCHED",
          "DELIVERED",
          ...(data?.stage === "INSTALLED" ? ["INSTALLED"] : []),
        ];
  return (
    <main className="activity-page">
      <h1>Track an order</h1>
      {!user ? (
        <section className="panel">
          <p>Sign in to see your order and delivery updates.</p>
          <button className="primary" onClick={signIn}>
            Sign in to track
          </button>
        </section>
      ) : (
        <>
          <section className="panel tracker-select">
            <label className="field">
              Order
              <select
                value={order}
                onChange={(e) => {
                  S(e.target.value);
                  history.replaceState(
                    null,
                    "",
                    "/track-order?order=" + e.target.value,
                  );
                }}
              >
                {(!orders.length ||
                  (order && !orders.some((o) => String(o.id) === order))) && (
                  <option value={order}>
                    {order ? "Order #" + order : "No orders yet"}
                  </option>
                )}
                {orders.map((w) => (
                  <option key={w.id} value={w.id}>
                    #{w.id} · {w.title} · {label(w.stage)}
                  </option>
                ))}
              </select>
            </label>
            {order && (
              <button onClick={() => refresh.current?.()}>Refresh tracking</button>
            )}
          </section>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {order && !error && !data && <p>Loading tracking…</p>}
          {data && (
            <section className="panel tracking-card">
              <div className="section-action">
                <h2>Order #{data.id}</h2>
                <strong>{label(data.stage)}</strong>
              </div>
              <small>{data.branch} showroom</small>
              <p className="hint">Last checked <time dateTime={snapshot.checkedAt}>{dateTime(snapshot.checkedAt)}</time></p>
              {workshop && (
                <p className="workshop-progress">
                  Workshop progress · <strong>{label(workshop.stage)}</strong>
                </p>
              )}
              <ol className="track-steps">
                {stages.map((stage, i) => (
                  <li
                    key={stage}
                    className={i <= stages.indexOf(data.stage) ? "reached" : ""}
                  >
                    <b>{label(stage)}</b>
                    <small>
                      {data.milestones[stage]
                        ? dateTime(data.milestones[stage])
                        : i <= stages.indexOf(data.stage)
                          ? "Completed"
                          : "Upcoming"}
                    </small>
                  </li>
                ))}
              </ol>
              {data.stage !== "CANCELLED" &&
                data.route.map((r, i) => (
                  <p key={i}>
                    Scheduled delivery · {String(r.slot).slice(0, 10)}
                  </p>
                ))}
              {data.windows.map((r, i) => (
                <p key={i}>
                  Delivery window · {dateTime(r.starts)} – {dateTime(r.ends)}
                </p>
              ))}
              <h3>Items</h3>
              {data.items.map((v, i) => (
                <div key={i} className="listlink">
                  <b>{v.name}</b>
                  <small>
                    {v.shipped} of {v.qty} dispatched
                  </small>
                </div>
              ))}
              {data.shipments.length > 0 && (
                <>
                  <h3>Shipments</h3>
                  {data.shipments.map((v, i) => (
                    <div key={i} className="listlink">
                      <span>
                        {v.name} × {v.qty}
                        <small>Dispatch reference · {v.reference_no}</small>
                      </span>
                      <small>{dateTime(v.created_at)}</small>
                    </div>
                  ))}
                </>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}

export function CustomerHistory({ open, revision }) {
  const [q, Q] = useState(""),
    [page, P] = useState(1),
    [rows, R] = useState([]),
    [person, S] = useState(null),
    [history, H] = useState(null),
    [error, E] = useState("");
  useEffect(() => {
    let current = true;
    const t = setTimeout(() => {
      api("/crm/customers?q=" + encodeURIComponent(q) + "&page=" + page)
        .then((r) => {
          if (current) R(r);
        })
        .catch((e) => {
          if (current) E(e.message);
        });
    }, 130);
    return () => {
      current = false;
      clearTimeout(t);
    };
  }, [q, page]);
  useEffect(() => {
    let current = true;
    H(null);
    E("");
    if (person)
      api("/crm/customers/" + person)
        .then((r) => {
          if (current) H(r);
        })
        .catch((e) => {
          if (current) E(e.message);
        });
    return () => {
      current = false;
    };
  }, [person, revision]);
  return (
    <div className="crm-history">
      <section className="panel editor">
        <h3>Find a customer</h3>
        <label className="field">
          Name, email or phone
          <input
            value={q}
            onChange={(e) => {
              Q(e.target.value);
              P(1);
              S(null);
            }}
          />
        </label>
        {rows.map((r) => (
          <button className="profile-order" key={r.id} onClick={() => S(r.id)}>
            <span>
              <b>{r.display_name}</b>
              <small>
                {r.email} · {r.branch}
              </small>
            </span>
          </button>
        ))}
        {!rows.length && <p>No matching customers.</p>}
        {(page > 1 || rows.length === 30) && (
          <div className="row">
            <button disabled={page === 1} onClick={() => P(page - 1)}>
              Previous
            </button>
            <button disabled={rows.length < 30} onClick={() => P(page + 1)}>
              Next
            </button>
          </div>
        )}
      </section>
      {error && <p className="error">{error}</p>}
      {history && (
        <section className="panel editor">
          <h2>{history.customer.display_name}</h2>
          <p>
            {history.customer.email} ·{" "}
            {history.customer.phone || history.customer.branch}
          </p>
          <h3>Customer history</h3>
          {history.activity.map((w) => (
            <button
              key={w.id}
              className="profile-order"
              onClick={() => open(w)}
            >
              <span>
                <b>{w.title}</b>
                <small>
                  #{w.id} · {label(w.kind)} · {label(w.stage)} · {w.branch}
                </small>
              </span>
              {w.amount > 0 && <strong>{rupee(w.amount)}</strong>}
            </button>
          ))}
          {!history.activity.length && (
            <p>No activity recorded in your showroom.</p>
          )}
        </section>
      )}
    </div>
  );
}
