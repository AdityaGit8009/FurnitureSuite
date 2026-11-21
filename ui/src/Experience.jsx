import React, { useState, useEffect } from "react";
import {
  Settings2,
  Check,
  ArrowUpRight,
  Share2,
  Truck,
  History,
  SlidersHorizontal,
  MoveRight,
  ChevronRight,
  MessageCircle,
  LayoutGrid,
} from "lucide-react";
import { api, Modal, Form, rupee } from "./lib";

const themes = [
  ["atelier", "Atelier", "#333f3a", "#f6f2ea"],
  ["ocean", "Ocean", "#165879", "#eaf4f7"],
  ["clay", "Terracotta", "#924b39", "#f9eee9"],
  ["orchid", "Orchid", "#64417c", "#f6effa"],
  ["midnight", "Midnight", "#8fcef1", "#17222f"],
  ["noir", "Graphite", "#dfc594", "#222320"],
];
const memory = (k, d) => {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? d;
  } catch {
    return d;
  }
};
export function Appearance() {
  const [open, O] = useState(false),
    [theme, T] = useState(() => memory("studio-theme", "atelier")),
    [density, D] = useState(() => memory("studio-density", "comfortable")),
    [textSize, setTextSize] = useState(() => {
      const value = memory("studio-text-size", "standard");
      return ["standard", "large", "largest"].includes(value)
        ? value
        : "standard";
    });
  useEffect(() => {
    document.documentElement.dataset.theme = themes.some((t) => t[0] === theme)
      ? theme
      : "atelier";
    document.documentElement.dataset.density = density;
    document.documentElement.dataset.textSize = textSize;
    try {
      localStorage.setItem("studio-theme", JSON.stringify(theme));
      localStorage.setItem("studio-density", JSON.stringify(density));
      localStorage.setItem("studio-text-size", JSON.stringify(textSize));
    } catch {}
  }, [theme, density, textSize]);
  return (
    <>
      <button
        className="theme-tab noprint"
        title="Appearance settings"
        aria-label="Appearance settings"
        onClick={() => O(true)}
      >
        <Settings2 size={20} />
      </button>
      {open && (
        <Modal title="Appearance" close={() => O(false)}>
          <p className="hint">Appearance is saved on this device.</p>
          <div className="palettes">
            {themes.map(([key, name, a, b]) => (
              <button
                className={theme === key ? "chosen" : ""}
                aria-pressed={theme === key}
                key={key}
                onClick={() => T(key)}
              >
                <i
                  style={{
                    background:
                      "linear-gradient(115deg," + a + " 48%," + b + " 49%)",
                  }}
                />
                {name}
                {theme === key && <Check size={15} />}
              </button>
            ))}
          </div>
          <fieldset className="type-choices">
            <legend>Text size</legend>
            <div>
              {[
                ["standard", "Standard"],
                ["large", "Large"],
                ["largest", "Extra large"],
              ].map(([id, name]) => (
                <label key={id}>
                  <input
                    type="radio"
                    name="studio-text-size"
                    value={id}
                    checked={textSize === id}
                    onChange={() => setTextSize(id)}
                  />
                  <span>{name}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="field">
            Catalogue density
            <select value={density} onChange={(e) => D(e.target.value)}>
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </label>
        </Modal>
      )}
    </>
  );
}
export const isOn = (exp, code) =>
  exp?.flags?.some((f) => f.code === code && f.enabled);
export function ProductStrip({ title, items, open }) {
  if (!items.length) return null;
  return (
    <section className="studio-strip">
      <h3>{title}</h3>
      <div className="strip-grid">
        {items.map((p) => (
          <button key={p.id} onClick={() => open(p)}>
            <img src={p.photo} alt="" />
            <span>
              {p.name}
              <small>{rupee(p.price)}</small>
            </span>
            <ChevronRight size={15} />
          </button>
        ))}
      </div>
    </section>
  );
}
export function PageBody({ title, blocks, items, open, action, contact }) {
  return (
    <article className="published">
      <h1>{title || "Untitled page"}</h1>
      {blocks.map((b, i) => {
        const align = ["left", "center", "right"].includes(b.align)
          ? b.align
          : "left";
        switch (b.type) {
          case "hero":
            return (
              <section className="page-cover" data-align={align} key={i}>
                <img src={"/images/" + b.option + ".jpg"} alt="" />
                <div>
                  <h2>{b.heading}</h2>
                  <p>{b.text}</p>
                </div>
              </section>
            );
          case "faq":
            return (
              <details className="panel" data-align={align} key={i}>
                <summary>{b.heading}</summary>
                <p>{b.text}</p>
              </details>
            );
          case "collection":
            return (
              <div data-align={align} key={i}>
                <p>{b.text}</p>
                <ProductStrip
                  title={b.heading}
                  items={items.filter(
                    (x) => !b.option || x.category === b.option,
                  )}
                  open={open}
                />
              </div>
            );
          case "contact":
            return (
              <section className="panel" data-align={align} key={i}>
                <h2>{b.heading}</h2>
                <p>{b.text}</p>
                <a href={"mailto:" + contact?.email}>{contact?.email}</a> ·{" "}
                <a href={contact?.whatsappUrl} target="_blank" rel="noreferrer">
                  WhatsApp showroom
                </a>
              </section>
            );
          case "action":
            return (
              <section className="panel" data-align={align} key={i}>
                <h2>{b.heading}</h2>
                <p>{b.text}</p>
                <button className="primary" onClick={() => action(b.option)}>
                  {
                    {
                      shop: "Browse collection",
                      quote: "Request a quote",
                      planner: "Open room planner",
                      contact: "Contact showroom",
                    }[b.option]
                  }{" "}
                  <ArrowUpRight size={14} />
                </button>
              </section>
            );
          default:
            return (
              <section className="page-prose" data-align={align} key={i}>
                <h2>{b.heading}</h2>
                <p>{b.text}</p>
              </section>
            );
        }
      })}
    </article>
  );
}
export function Modules({
  experience,
  items,
  open,
  u,
  branch,
  refresh,
  auth,
  notify,
  M,
}) {
  const [error, E] = useState("");
  return (
    <>
      {experience?.modules?.map((m) => {
        let options = JSON.parse(m.config);
        if (m.kind === "SHELF")
          return (
            <ProductStrip
              key={m.id}
              title={m.title}
              items={options
                .map((s) => items.find((x) => x.sku === s))
                .filter(Boolean)}
              open={open}
            />
          );
        return (
          <section className="panel module-card" key={m.id}>
            <div>
              <h3>{m.title}</h3>
              <p>{m.description}</p>
            </div>
            {m.kind === "POLL" ? (
              <div className="chips">
                {options.map((o) => (
                  <button
                    key={o}
                    onClick={() =>
                      auth(async () => {
                        try {
                          await api("/studio/modules/" + m.id + "/submit", {
                            choice: o,
                            branch,
                          });
                          await refresh();
                          notify("Vote saved");
                        } catch (e) {
                          E(e.message);
                        }
                      })
                    }
                  >
                    {o} · {m.results?.find((x) => x.choice === o)?.votes || 0}
                  </button>
                ))}
              </div>
            ) : (
              <button
                onClick={() =>
                  auth(() =>
                    M({
                      kind: "form",
                      title: m.title,
                      fields: options.map((k, i) => ["field" + i, k]),
                      button: "Submit request",
                      submit: async (b) => {
                        await api("/studio/modules/" + m.id + "/submit", {
                          branch,
                          answers: Object.fromEntries(
                            options.map((k, i) => [k, b["field" + i]]),
                          ),
                        });
                        M(null);
                        notify("Request submitted. Track it in My activity.");
                      },
                    }),
                  )
                }
              >
                Open request <MoveRight size={16} />
              </button>
            )}
          </section>
        );
      })}
      {error && <p className="error">{error}</p>}
    </>
  );
}
export function Mine() {
  const [records, R] = useState([]),
    [error, E] = useState("");
  useEffect(() => {
    api("/studio/mine")
      .then(R)
      .catch((e) => E(e.message));
  }, []);
  if (error) return <p>{error}</p>;
  return records.length ? (
    <div className="panel">
      <h3>My service requests</h3>
      {records.map((v) => (
        <p key={v.id}>
          #{v.id} · {v.title} · {v.stage.replaceAll("_", " ")}
        </p>
      ))}
    </div>
  ) : null;
}
export function ProductExtras({
  p,
  exp,
  branch,
  settings,
  auth,
  refresh,
  notify,
  M,
}) {
  const [pin, P] = useState(""),
    [result, R] = useState(""),
    [question, Q] = useState(""),
    [error, E] = useState("");
  const cfg = Object.fromEntries(settings.map((v) => [v.name, v.val]));
  return (
    <section className="product-extras">
      <form
        className="delivery-check"
        onSubmit={(e) => {
          e.preventDefault();
          R(
            !/^[1-9][0-9]{5}$/.test(pin)
              ? "Enter a six-digit Indian pincode."
              : !pin.startsWith(cfg.delivery_prefix || "")
                ? "Outside our delivery area."
                : p.available <= 0
                  ? "Serviceable area; this piece is awaiting stock."
                  : "Serviceable from " +
                    branch +
                    ". Base delivery: " +
                    (p.price >= Number(cfg.free_above)
                      ? "free"
                      : rupee(cfg.delivery_fee)) +
                    ". Final charges appear in your bag.",
          );
        }}
      >
        <label className="field">
          Delivery availability
          <input
            inputMode="numeric"
            value={pin}
            maxLength={6}
            placeholder="Enter pincode"
            onChange={(e) => P(e.target.value)}
          />
        </label>
        <button>Check delivery</button>
      </form>
      {result && <p role="status">{result}</p>}
      <button
        onClick={() =>
          auth(() =>
            M({
              kind: "form",
              title: "Set target price",
              hint:
                "Current price: " +
                rupee(p.price) +
                ". Receive an alert when the catalogue price reaches your target.",
              fields: [["price", "Notify me at or below (INR)", "number"]],
              submit: async (b) => {
                await api("/shop-tools/watch/" + p.id, b);
                M(null);
                notify("Price alert saved");
              },
            }),
          )
        }
      >
        Watch price
      </button>
      {exp?.prices?.filter((v) => v.product_id === p.id).length > 0 && (
        <details>
          <summary>Price history</summary>
          {exp.prices
            .filter((v) => v.product_id === p.id)
            .slice(0, 6)
            .map((v, i) => (
              <p key={i}>
                {String(v.changed).slice(0, 10)} · {rupee(v.previous_price)} →{" "}
                {rupee(v.new_price)}
              </p>
            ))}
        </details>
      )}
      {isOn(exp, "SHARE") && (
        <button
          onClick={async () => {
            let url = new URL(location.pathname, location.origin);
            url.searchParams.set("sku", p.sku);
            url.searchParams.set("branch", branch);
            try {
              await navigator.clipboard.writeText(url.href);
              notify("Product link copied");
            } catch {
              M({ kind: "share", url: url.href });
            }
          }}
        >
          <Share2 size={15} />
          Share product
        </button>
      )}
      {isOn(exp, "QUESTIONS") && (
        <details>
          <summary>Questions about this piece</summary>
          {exp.questions
            .filter((q) => q.product_id === p.id)
            .map((q) => (
              <div key={q.id} className="event">
                <b>{q.question}</b>
                <p>{q.answer}</p>
              </div>
            ))}
          <label className="field">
            Ask the showroom
            <input
              maxLength={450}
              value={question}
              onChange={(e) => Q(e.target.value)}
            />
          </label>
          <button
            disabled={!question.trim()}
            onClick={() =>
              auth(async () => {
                try {
                  await api("/studio/questions/" + p.id, { question, branch });
                  Q("");
                  notify("Question submitted for a showroom reply");
                } catch (e) {
                  E(e.message);
                }
              })
            }
          >
            Submit question
          </button>
          {error && <p className="error">{error}</p>}
        </details>
      )}
    </section>
  );
}
export function Discover({ exp, items, branch, open, recent }) {
  if (!isOn(exp, "DISCOVERY")) return null;
  const trending = (exp.trending || [])
    .filter((x) => x.branch === branch)
    .map((t) => items.find((p) => p.id === t.product_id))
    .filter(Boolean)
    .slice(0, 4);
  return (
    <>
      <ProductStrip
        title="Popular at this showroom"
        items={trending}
        open={open}
      />
      <ProductStrip
        title="Recently viewed on this device"
        items={recent
          .map((id) => items.find((p) => p.id === id))
          .filter(Boolean)
          .slice(0, 4)}
        open={open}
      />
    </>
  );
}
export function readRecent() {
  return memory("studio-recent", []);
}
export function remember(id) {
  let history = [id, ...readRecent().filter((n) => n !== id)].slice(0, 12);
  try {
    localStorage.setItem("studio-recent", JSON.stringify(history));
  } catch {}
  return history;
}
