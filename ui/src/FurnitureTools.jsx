import React, { useEffect, useMemo, useState } from "react";
import { api, Form, Modal, rupee } from "./lib";

const verdicts = {
  REFERENCE_ONLY: "Carton measurements needed",
  MEASURE_ON_SITE: "Showroom measurement recommended",
  CLEAR_ON_INPUTS: "Clear on the measured straight route",
  RECHECK_PACKING: "Carton sizes changed. Recheck before dispatch",
};
export const fitLabel = (value) => verdicts[value] || value;
const defaults = {
  doorWidth: "",
  doorHeight: "",
  useLift: false,
  liftWidth: "",
  liftDepth: "",
  liftHeight: "",
  allowance: "4",
  turns: false,
};
export function DeliveryFit({ product, user, refresh, signIn, initial }) {
  const [values, V] = useState({ ...defaults, ...initial }),
    [result, R] = useState(null),
    [saved, S] = useState(null),
    [busy, B] = useState(false),
    [err, E] = useState("");
  useEffect(() => {
    let current = true;
    if (user?.role === "CUSTOMER")
      api(
        "/delivery-fit/" +
          product.id +
          "/saved?branch=" +
          encodeURIComponent(product.branch),
      )
        .then((a) => {
          if (current) S(a[0] || null);
        })
        .catch((e) => {
          if (current) E(e.message);
        });
    else S(null);
    return () => {
      current = false;
    };
  }, [user?.id, product.id, product.branch]);
  function set(key, value) {
    V((v) => ({ ...v, [key]: value }));
    R(null);
    E("");
  }
  async function compute(e) {
    e.preventDefault();
    E("");
    B(true);
    try {
      const q = new URLSearchParams({ ...values, branch: product.branch });
      R(await api("/catalog/products/" + product.id + "/delivery-fit?" + q));
    } catch (e) {
      E(e.message);
    } finally {
      B(false);
    }
  }
  async function save(visit) {
    E("");
    B(true);
    try {
      const response = await api("/delivery-fit/" + product.id + "/save", {
        ...values,
        branch: product.branch,
        requestVisit: visit,
      });
      R(response.result);
      S({
        verdict: response.result.verdict,
        summary: response.result.summary,
        lead_id: response.lead,
      });
      await refresh();
    } catch (e) {
      E(e.message);
    } finally {
      B(false);
    }
  }
  function field(key, title) {
    return (
      <label className="field" key={key}>
        {title}
        <input
          type="number"
          min={key === "allowance" ? 0 : 0.01}
          max={key === "allowance" ? 50 : 1500}
          step=".01"
          required
          disabled={busy}
          value={values[key]}
          onChange={(e) => set(key, e.target.value)}
        />
      </label>
    );
  }
  return (
    <details className="delivery-fit" open={initial ? true : undefined}>
      <summary>Will it fit through my door?</summary>
      <p>
        Measure the narrowest clear opening on the route, including the lift
        door. Use centimetres.
      </p>
      <form onSubmit={compute}>
        <div className="fit-fields">
          {field("doorWidth", "Opening width (cm)")}
          {field("doorHeight", "Opening height (cm)")}
          {field("allowance", "Extra clearance per dimension (cm)")}
        </div>
        <label className="fit-consent">
          <input
            type="checkbox"
            disabled={busy}
            checked={values.useLift}
            onChange={(e) => set("useLift", e.target.checked)}
          />{" "}
          The delivery uses a lift
        </label>
        {values.useLift && (
          <div className="fit-fields">
            {field("liftWidth", "Lift interior width (cm)")}
            {field("liftDepth", "Lift interior depth (cm)")}
            {field("liftHeight", "Lift interior height (cm)")}
          </div>
        )}
        <label className="fit-consent">
          <input
            type="checkbox"
            disabled={busy}
            checked={values.turns}
            onChange={(e) => set("turns", e.target.checked)}
          />{" "}
          There are stairs, sharp turns or fixed obstacles
        </label>
        <button className="primary" disabled={busy}>
          Check delivery fit
        </button>
      </form>
      {err && (
        <p role="alert" className="error">
          {err}
        </p>
      )}
      {result && (
        <section className="fit-result" aria-live="polite">
          <h3>{fitLabel(result.verdict)}</h3>
          <p>
            {result.source} · {product.sku}
          </p>
          <small>
            {result.verdict === "REFERENCE_ONLY"
              ? "The showroom can confirm the packed size before delivery."
              : result.verdict === "MEASURE_ON_SITE"
                ? "A showroom visit can check corners, tilting and alternative entry routes."
                : "This estimate uses rectangular cartons and the route measurements you entered."}
          </small>
          {result.cartons.map((c, i) => (
            <p key={i}>
              {result.revision ? "Carton " + (i + 1) : "Catalogue piece"} ·{" "}
              {c.orientation} cm in the checked orientation ·{" "}
              {c.margin < 0
                ? Math.abs(c.margin) + " cm short"
                : c.margin + " cm spare"}{" "}
              after allowance
            </p>
          ))}
          {!user ? (
            <button onClick={() => signIn(values)}>
              Sign in to save this check
            </button>
          ) : (
            user.role === "CUSTOMER" && (
              <div className="row wrap">
                <button disabled={busy} onClick={() => save(false)}>
                  Save measurements
                </button>
                <button disabled={busy} onClick={() => save(true)}>
                  Request a showroom measurement
                </button>
              </div>
            )
          )}
        </section>
      )}
      {saved && (
        <div className="fit-saved">
          <b>Saved delivery check · {fitLabel(saved.verdict)}</b>
          <small>{saved.summary}</small>
          {saved.lead_id && (
            <small>
              Showroom enquiry #{saved.lead_id} · follow it in My activity
            </small>
          )}
        </div>
      )}
    </details>
  );
}
export function PackingEditor({ row, branch, onSaved }) {
  const [data, D] = useState(null),
    [err, E] = useState("");
  useEffect(() => {
    let current = true;
    api(
      "/catalog-admin/" +
        row.id +
        "/packing?branch=" +
        encodeURIComponent(branch),
    )
      .then((r) => {
        if (current) D(r[0] || { cartons: "", upright: false, revision: 0 });
      })
      .catch((e) => {
        if (current) E(e.message);
      });
    return () => {
      current = false;
    };
  }, [row.id, branch]);
  if (err) return <p className="error">{err}</p>;
  if (!data) return <p>Loading carton measurements…</p>;
  return (
    <>
      <p>
        {row.name} · Enter each measured shipping carton on its own line as
        width x depth x height in cm.
      </p>
      <Form
        fields={[
          [
            "cartons",
            "Measured shipping cartons (cm)",
            "textarea",
            null,
            data.cartons,
          ],
          [
            "orientation",
            "Handling instruction",
            "select",
            [
              ["free", "Can be turned on any side"],
              ["upright", "Keep upright"],
            ],
            data.upright ? "upright" : "free",
          ],
        ]}
        button="Save carton measurements"
        submit={async (b) => {
          await api("/catalog-admin/" + row.id + "/packing", {
            branch,
            revision: data.revision,
            cartons: b.cartons,
            upright: b.orientation === "upright",
          });
          await onSaved();
        }}
      />
    </>
  );
}

const plans = {
  Living: {
    title: "Living room",
    main: /sofa|sectional/i,
    accent: /accent chair|lounge chair|armchair/i,
    qty: 1,
  },
  Dining: {
    title: "Dining for four",
    main: /dining table/i,
    accent: /dining chair/i,
    qty: 4,
  },
  Bedroom: {
    title: "Bedroom reading corner",
    main: /\bbed\b|storage beds/i,
    accent: /lounge chair|armchair|accent chair/i,
    qty: 1,
  },
};
const collection = (p) => p.variant_family?.split(" ")[0] || "";
const moneyUnits = (n) => Math.round(Number(n) * 100);
export function roomOptions(items, cart, room, budget, finish) {
  const plan = plans[room],
    cents = moneyUnits(budget);
  const mains = items.filter(
    (p) =>
      plan.main.test(p.name + " " + p.category) &&
      p.available - (cart[p.id] || 0) >= 1,
  );
  const partners = items.filter(
    (p) =>
      plan.accent.test(p.name + " " + p.category) &&
      p.available - (cart[p.id] || 0) >= plan.qty,
  );
  const winners = [];
  let cheapest = Infinity;
  for (const main of mains) {
    let best = null;
    for (const partner of partners) {
      if (main.id === partner.id) continue;
      if (finish && main.finish !== finish && partner.finish !== finish)
        continue;
      const total =
        moneyUnits(main.price) + moneyUnits(partner.price) * plan.qty;
      cheapest = Math.min(cheapest, total);
      if (!Number.isFinite(cents) || total > cents) continue;
      const sameCollection =
        !!collection(main) && collection(main) === collection(partner);
      const sameFinish = !!main.finish && main.finish === partner.finish;
      const candidate = {
        main,
        partner,
        qty: plan.qty,
        total,
        rank: (sameCollection ? 2 : 0) + (sameFinish ? 1 : 0),
        sameCollection,
        sameFinish,
      };
      if (
        !best ||
        candidate.rank > best.rank ||
        (candidate.rank === best.rank && total < best.total)
      )
        best = candidate;
    }
    if (best) winners.push(best);
  }
  winners.sort(
    (a, b) => b.rank - a.rank || a.total - b.total || a.main.id - b.main.id,
  );
  const distinct = [],
    seen = new Set();
  for (const x of winners) {
    const key = collection(x.main) || x.main.name;
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push(x);
    if (distinct.length === 3) break;
  }
  return { sets: distinct, cheapest };
}
export function RoomBundles({ items, cart, branch, close, addSet, viewBag }) {
  const [room, S] = useState("Living"),
    [budget, B] = useState("65000"),
    [finish, F] = useState(""),
    [busy, G] = useState(false),
    [error, E] = useState(""),
    [added, A] = useState("");
  const result = useMemo(
    () => roomOptions(items, cart, room, budget, finish),
    [items, cart, room, budget, finish],
  );
  async function add(set) {
    G(true);
    E("");
    try {
      await addSet([
        { product: set.main, qty: 1 },
        { product: set.partner, qty: set.qty },
      ]);
      A("Added " + (set.qty + 1) + " pieces to your bag");
    } catch (e) {
      E(e.message);
    } finally {
      G(false);
    }
  }
  return (
    <Modal wide title="Build a room within budget" close={close}>
      <div className="bundle-tools">
        <label className="field">
          Room set
          <select
            value={room}
            onChange={(e) => {
              S(e.target.value);
              A("");
            }}
          >
            {Object.entries(plans).map(([k, p]) => (
              <option key={k} value={k}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Furniture budget (₹)
          <input
            type="number"
            min="1"
            value={budget}
            onChange={(e) => {
              B(e.target.value);
              A("");
            }}
          />
        </label>
        <label className="field">
          Preferred finish
          <select
            value={finish}
            onChange={(e) => {
              F(e.target.value);
              A("");
            }}
          >
            <option value="">Any finish</option>
            {[...new Set(items.map((p) => p.finish))].sort().map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="hint">
        Available at {branch}. Totals cover furniture. Delivery and optional
        services are calculated at checkout.
      </p>
      {added && (
        <div className="section-action" role="status">
          <b>{added}</b>
          <button onClick={viewBag}>View shopping bag</button>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!result.sets.length && (
        <p>
          {Number.isFinite(result.cheapest)
            ? "Available combinations start at " +
              rupee(result.cheapest / 100) +
              "."
            : "No in-stock combination matches these choices."}
        </p>
      )}
      <div className="room-sets">
        {result.sets.map((x) => (
          <article className="room-set" key={x.main.id}>
            <div className="bundle-pictures">
              <img src={x.main.photo} alt={x.main.name} />
              <img src={x.partner.photo} alt={x.partner.name} />
            </div>
            <div className="bundle-title">
              <strong>{rupee(x.total / 100)}</strong>
              <small>
                {x.sameCollection
                  ? collection(x.main) + " collection"
                  : "Mixed collection"}
                {x.sameFinish ? " · Matching finish" : ""}
              </small>
            </div>
            <ul className="bundle-lines">
              {[
                [x.main, 1],
                [x.partner, x.qty],
              ].map(([piece, units]) => (
                <li key={piece.id}>
                  <span>{piece.name}</span>
                  <b aria-label={units + " units"}>× {units}</b>
                </li>
              ))}
            </ul>
            <div className="bundle-bottom">
              <small>
                {rupee((moneyUnits(budget) - x.total) / 100)} left in budget
              </small>
              <button
                className="primary"
                disabled={busy}
                onClick={() => add(x)}
              >
                Add this set to bag
              </button>
            </div>
          </article>
        ))}
      </div>
    </Modal>
  );
}
