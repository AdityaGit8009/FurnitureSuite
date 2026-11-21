import React, { useEffect, useState } from "react";
import {
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Eye,
  BookOpen,
  Layers3,
  Mail,
  MessageCircle,
  ToggleRight,
} from "lucide-react";
import { api, Modal, Form, label } from "./lib";
import { PageBody } from "./Experience";
const blank = (type = "text") => ({
  type,
  heading: "",
  text: "",
  option: { hero: "room", action: "shop" }[type] || "",
});
const starters = {
  "Blank page": [blank()],
  "Room lookbook": [
    { type: "hero", heading: "Living room lookbook", text: "", option: "room" },
    { type: "collection", heading: "Explore the pieces", text: "", option: "" },
  ],
  "Customer guide": [
    {
      type: "text",
      heading: "Delivery and installation",
      text: "",
      option: "",
    },
    {
      type: "faq",
      heading: "How do I arrange installation?",
      text: "",
      option: "",
    },
    {
      type: "contact",
      heading: "Speak with the showroom",
      text: "",
      option: "",
    },
  ],
  "Design consultation": [
    {
      type: "hero",
      heading: "Custom furniture consultation",
      text: "",
      option: "chair",
    },
    {
      type: "action",
      heading: "Tell us about your space",
      text: "",
      option: "quote",
    },
  ],
};
const fld = (name, value, onChange, props = {}) => (
  <label className="field">
    {name}
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...props}
    />
  </label>
);
function Pages({ d, u, items, cat, reload, notify }) {
  const fresh = () => ({
    id: null,
    title: "",
    slug: "",
    branch: u.role === "SUPER_ADMIN" ? "All" : u.branch,
    blocks: [blank()],
    version: 0,
  });
  const [draft, D] = useState(fresh),
    [preview, V] = useState(false),
    [history, H] = useState([]),
    [error, E] = useState(""),
    [busy, B] = useState(false),
    [dirty, Y] = useState(false);
  const set = (v) => {
    D(v);
    Y(true);
  };
  const patch = (k, v) => set({ ...draft, [k]: v });
  const section = (i, v) =>
    patch(
      "blocks",
      draft.blocks.map((b, n) => (n === i ? { ...b, ...v } : b)),
    );
  function choose(row) {
    if (dirty && !window.confirm("Discard unsaved changes to this draft?"))
      return;
    apply(row);
  }
  function apply(row) {
    D(row ? { ...row, blocks: JSON.parse(row.blocks) } : fresh());
    H([]);
    E("");
    Y(false);
  }
  async function doIt(fn) {
    B(true);
    E("");
    try {
      await fn();
    } catch (e) {
      E(e.message);
    } finally {
      B(false);
    }
  }
  async function save(live) {
    let row = await api("/studio/pages", draft);
    apply(row);
    if (live)
      row = await api("/studio/pages/" + row.id + "/publish", {
        version: row.version,
      });
    apply(row);
    await reload();
    notify(live ? "Page published" : "Draft saved");
  }
  function move(i, step) {
    let next = [...draft.blocks];
    [next[i], next[i + step]] = [next[i + step], next[i]];
    patch("blocks", next);
  }
  return (
    <div className="cms-grid">
      <section className="cms-index">
        <button onClick={() => choose(null)}>
          <Plus size={15} />
          New page
        </button>
        {d.pages.map((p) => (
          <button
            className={draft.id === p.id ? "picked" : ""}
            key={p.id}
            onClick={() => choose(p)}
          >
            <b>{p.title}</b>
            <small>
              {p.branch} · {p.live_version ? "Published" : "Draft"}
            </small>
          </button>
        ))}
      </section>
      <section className="panel editor">
        <div className="between">
          <h2>{draft.id ? "Edit page" : "New page"}</h2>
          <button onClick={() => V(true)}>
            <Eye size={15} />
            Preview
          </button>
        </div>
        <div className="fields">
          {!draft.id && (
            <label className="field">
              Starting layout
              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value)
                    patch("blocks", structuredClone(starters[e.target.value]));
                }}
              >
                <option value="">Choose a layout</option>
                {Object.keys(starters).map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
          )}
          {fld(
            "Page title",
            draft.title,
            (t) =>
              set({
                ...draft,
                title: t,
                ...(!draft.id &&
                (!draft.slug ||
                  draft.slug ===
                    draft.title
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-|-$/g, ""))
                  ? {
                      slug: t
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/^-|-$/g, ""),
                    }
                  : {}),
              }),
            { maxLength: 120 },
          )}
          {fld("URL slug", draft.slug, (t) => patch("slug", t), {
            disabled: !!draft.id,
          })}
          <label className="field">
            Showroom
            <select
              disabled={!!draft.id || u.role !== "SUPER_ADMIN"}
              value={draft.branch}
              onChange={(e) => patch("branch", e.target.value)}
            >
              {(u.role === "SUPER_ADMIN"
                ? ["All", "Central", "North"]
                : [u.branch]
              ).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        </div>
        {draft.blocks.map((b, i) => (
          <fieldset className="block-edit" key={i}>
            <legend>Section {i + 1}</legend>
            <div className="between">
              <select
                aria-label={"Section " + (i + 1) + " type"}
                value={b.type}
                onChange={(e) =>
                  section(i, {
                    ...blank(e.target.value),
                    heading: b.heading,
                    text: b.text,
                    align: b.align || "left",
                  })
                }
              >
                {["text", "hero", "faq", "collection", "contact", "action"].map(
                  (v) => (
                    <option key={v}>{v}</option>
                  ),
                )}
              </select>
              <div className="row">
                {[
                  [-1, ArrowUp],
                  [1, ArrowDown],
                ].map(([step, Icon]) => (
                  <button
                    key={step}
                    disabled={i + step < 0 || i + step >= draft.blocks.length}
                    onClick={() => move(i, step)}
                    aria-label={
                      step < 0 ? "Move section up" : "Move section down"
                    }
                  >
                    <Icon size={14} />
                  </button>
                ))}
                <button
                  aria-label="Remove section"
                  disabled={draft.blocks.length === 1}
                  onClick={() =>
                    patch(
                      "blocks",
                      draft.blocks.filter((_, n) => n !== i),
                    )
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <label className="field">
              Text alignment
              <select
                aria-label={"Section " + (i + 1) + " text alignment"}
                value={b.align || "left"}
                onChange={(e) => section(i, { align: e.target.value })}
              >
                <option value="left">Left</option>
                <option value="center">Centre</option>
                <option value="right">Right</option>
              </select>
            </label>
            {fld("Heading", b.heading, (v) => section(i, { heading: v }), {
              maxLength: 130,
            })}
            <label className="field">
              Text
              <textarea
                value={b.text}
                maxLength={1800}
                onChange={(e) => section(i, { text: e.target.value })}
              />
            </label>
            {["hero", "collection", "action"].includes(b.type) && (
              <label className="field">
                {
                  {
                    hero: "Image",
                    collection: "Product category",
                    action: "Action",
                  }[b.type]
                }
                <select
                  value={b.option}
                  onChange={(e) => section(i, { option: e.target.value })}
                >
                  {(b.type === "hero"
                    ? ["room", "sofa", "chair", "dining", "lounge", "bed"]
                    : b.type === "action"
                      ? ["shop", "quote", "planner", "contact"]
                      : ["", ...new Set(items.map((x) => x.category))]
                  ).map((o) => (
                    <option value={o} key={o}>
                      {o || "All pieces"}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </fieldset>
        ))}
        <button
          disabled={draft.blocks.length >= 20}
          onClick={() => patch("blocks", [...draft.blocks, blank()])}
        >
          <Plus size={14} />
          Add section
        </button>
        <div className="editor-actions">
          <button disabled={busy} onClick={() => doIt(() => save(false))}>
            Save draft
          </button>
          <button
            className="primary"
            disabled={busy}
            onClick={() => doIt(() => save(true))}
          >
            Publish page
          </button>
          {draft.live_version && (
            <>
              <a href={"/?page=" + draft.slug} target="_blank" rel="noreferrer">
                View live page
              </a>
              <button
                disabled={busy || dirty}
                onClick={() =>
                  doIt(async () => {
                    apply(
                      await api("/studio/pages/" + draft.id + "/unpublish", {
                        version: draft.version,
                      }),
                    );
                    await reload();
                    notify("Page unpublished");
                  })
                }
              >
                Unpublish
              </button>
            </>
          )}
          {draft.id && (
            <button
              onClick={() =>
                doIt(async () => {
                  let h = await api("/studio/pages/" + draft.id + "/history");
                  H(h);
                  if (!h.length) notify("No published versions yet");
                })
              }
            >
              Version history
            </button>
          )}
        </div>
        {history.map((v) => (
          <div className="listlink" key={v.revision}>
            {v.title} · v{v.revision}
            <button
              disabled={dirty || busy}
              onClick={() =>
                doIt(async () => {
                  apply(
                    await api("/studio/pages/" + draft.id + "/restore", {
                      version: draft.version,
                      revision: v.revision,
                    }),
                  );
                  await reload();
                  notify("Restored as a draft");
                })
              }
            >
              Restore to draft
            </button>
          </div>
        ))}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {preview && (
          <Modal title="Draft preview" close={() => V(false)} wide>
            <PageBody
              title={draft.title}
              blocks={draft.blocks}
              contact={cat.contact}
              items={items}
              open={() => notify("Product link in published page")}
              action={() => notify("Action available on published page")}
            />
          </Modal>
        )}
      </section>
    </div>
  );
}
function MailEditor({ u, notify }) {
  const [defs, S] = useState(null),
    [branch, B] = useState(u.branch),
    [kind, K] = useState("ORDER"),
    [subject, T] = useState(""),
    [body, C] = useState(""),
    [preview, P] = useState(null),
    [error, E] = useState(""),
    [busy, G] = useState(false);
  async function load() {
    S(await api("/studio/mail"));
  }
  useEffect(() => {
    load().catch((e) => E(e.message));
  }, []);
  const current = defs?.rows.find(
    (x) => x.kind === kind && x.branch === branch,
  );
  useEffect(() => {
    if (!defs) return;
    let fallback =
      current || defs.rows.find((x) => x.kind === kind && x.branch === "All");
    T(fallback?.subject || defs.subject);
    C(fallback?.body || defs.body);
    P(null);
  }, [defs, branch, kind]);
  async function act(save) {
    G(true);
    E("");
    try {
      let b = { subject, body, branch, kind, version: current?.version || 0 };
      if (save) {
        await api("/studio/mail", b);
        await load();
        notify("Email template saved");
      } else P(await api("/studio/mail/preview", b));
    } catch (e) {
      E(e.message);
    } finally {
      G(false);
    }
  }
  return (
    <section className="panel editor">
      <h2>Notification email templates</h2>
      <div className="dual">
        <label className="field">
          Template scope
          <select value={branch} onChange={(e) => B(e.target.value)}>
            {(u.role === "SUPER_ADMIN"
              ? ["All", "Central", "North"]
              : [u.branch]
            ).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Email event
          <select value={kind} onChange={(e) => K(e.target.value)}>
            {(defs?.kinds || ["ORDER"]).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
      </div>
      {fld("Subject", subject, T, { maxLength: 180 })}
      <label className="field">
        Message body
        <textarea
          rows={7}
          value={body}
          onChange={(e) => C(e.target.value)}
          maxLength={4000}
        />
      </label>
      <p className="hint">
        Keep {"{{message}}"} in the body for the actual update. Available
        fields:{" "}
        {"{{name}}, {{category}}, {{branch}}, {{reference}}, {{shopEmail}}"}.
      </p>
      <div className="row wrap">
        <button disabled={!defs || busy} onClick={() => act(false)}>
          Preview email
        </button>
        <button
          className="primary"
          disabled={!defs || busy}
          onClick={() => act(true)}
        >
          Save email template
        </button>
      </div>
      {preview && (
        <div className="mail-preview">
          <small>Sample email</small>
          <h3>{preview.subject}</h3>
          <p>{preview.body}</p>
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
const flagNames = {
  DISCOVERY: "Showroom trends & viewing history",
  SHARE: "Shareable product links",
  QUESTIONS: "Moderated product questions",
};
function Extensions({ d, items, run, notify }) {
  let [kind, K] = useState("SHELF");
  return (
    <>
      <div className="panel editor">
        <h2>Feature switches</h2>
        {d.flags.map((f) => (
          <div className="listlink" key={f.code}>
            {flagNames[f.code]}
            <button
              role="switch"
              aria-checked={f.enabled}
              onClick={() =>
                run(() =>
                  api("/studio/flags/" + f.code, { enabled: !f.enabled }),
                )
              }
            >
              {f.enabled ? "On" : "Off"}
            </button>
          </div>
        ))}
      </div>
      <div className="cms-split">
        <section className="panel editor">
          <h2>Add a feature</h2>
          <label className="field">
            Feature type
            <select value={kind} onChange={(e) => K(e.target.value)}>
              <option value="SHELF">Curated product shelf</option>
              <option value="REQUEST">Service request form</option>
              <option value="POLL">Community poll</option>
            </select>
          </label>
          <Form
            key={kind}
            fields={[
              ["title", "Feature name"],
              ["description", "Description", "textarea", null, "", true],
              [
                "options",
                kind === "SHELF"
                  ? "Product SKUs, one per line"
                  : kind === "POLL"
                    ? "Poll choices, one per line"
                    : "Required field labels, one per line",
                "textarea",
              ],
            ]}
            button="Create feature"
            submit={async (b) => {
              await run(
                () =>
                  api("/studio/modules", {
                    ...b,
                    kind,
                    options: b.options
                      .split(/\r?\n/)
                      .map((x) => x.trim())
                      .filter(Boolean),
                    enabled: false,
                  }),
                true,
              );
              notify("Feature created. Enable it when ready.");
            }}
          />
          {kind === "SHELF" && (
            <small>Available SKUs: {items.map((x) => x.sku).join(", ")}</small>
          )}
        </section>
        <section className="panel editor">
          <h2>Feature library</h2>
          {!d.modules.length && (
            <p>Create a shelf, form or poll to add it here.</p>
          )}
          {d.modules.map((m) => (
            <div className="listlink" key={m.id}>
              <div>
                <b>{m.title}</b>
                <small>{label(m.kind)}</small>
              </div>
              <button
                onClick={() =>
                  run(() =>
                    api("/studio/modules/" + m.id + "/toggle", {
                      enabled: !m.enabled,
                      version: m.version,
                    }),
                  )
                }
              >
                {m.enabled ? "Disable" : "Enable"}
              </button>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
import { DeliveryWindows } from "./RetailTools";
export function StudioAdmin({ u, cat, items, refresh, notify }) {
  const [tab, T] = useState("Pages"),
    [d, D] = useState(null),
    [err, E] = useState("");
  async function load() {
    D(await api("/studio/manage"));
  }
  async function reload() {
    await Promise.all([load(), refresh()]);
  }
  useEffect(() => {
    load().catch((e) => E(e.message));
  }, []);
  async function run(fn, rethrow = false) {
    E("");
    try {
      await fn();
      await reload();
    } catch (e) {
      E(e.message);
      if (rethrow) throw e;
    }
  }
  return (
    <>
      <div className="studio-tabs">
        {[
          ["Pages", BookOpen],
          ["Email templates", Mail],
          ["Delivery windows", BookOpen],
          ["Customer inbox", MessageCircle],
          ...(u.role === "SUPER_ADMIN"
            ? [
                ["Feature lab", Layers3],
                ["Razorpay test", Layers3],
              ]
            : []),
        ].map(([name, I]) => (
          <button
            key={name}
            className={name === tab ? "selected" : ""}
            onClick={() =>
              name === "Razorpay test"
                ? location.assign("/razorpay-test")
                : T(name)
            }
          >
            <I size={15} />
            {name}
          </button>
        ))}
      </div>
      {err && (
        <p role="alert" className="error">
          {err}
        </p>
      )}
      {!d ? (
        <p>Loading studio tools…</p>
      ) : tab === "Pages" ? (
        <Pages {...{ u, cat, items, d, reload, notify }} />
      ) : tab === "Email templates" ? (
        <MailEditor {...{ u, notify }} />
      ) : tab === "Delivery windows" ? (
        <DeliveryWindows {...{ u, refresh, notify }} />
      ) : tab === "Feature lab" ? (
        <Extensions {...{ d, items, run, notify }} />
      ) : (
        <>
          <section className="panel editor">
            <h2>Product questions</h2>
            {!d.questions.length && <p>No product questions yet.</p>}
            {d.questions.map((q) => (
              <details key={q.id}>
                <summary>
                  {q.product} · {q.question}
                </summary>
                <Form
                  fields={[
                    [
                      "answer",
                      "Public showroom reply",
                      "textarea",
                      null,
                      q.answer || "",
                    ],
                  ]}
                  button="Publish answer"
                  submit={async (b) => {
                    await run(() => api("/studio/answers/" + q.id, b), true);
                    notify("Answer published");
                  }}
                />
              </details>
            ))}
          </section>
          <section className="panel editor">
            <h2>Service requests</h2>
            {!d.entries.length && <p>Submitted custom forms appear here.</p>}
            {d.entries.map((q) => (
              <div className="request-entry" key={q.id}>
                <b>
                  {q.title} · #{q.id}
                </b>
                <small>
                  {q.customer} · {q.branch} · {label(q.stage)}
                </small>
                {Object.entries(JSON.parse(q.answers)).map(([k, v]) => (
                  <p key={k}>
                    {k} — {v}
                  </p>
                ))}
                {q.stage !== "DONE" && (
                  <button
                    onClick={() =>
                      run(() =>
                        api("/studio/entries/" + q.id, {
                          stage: q.stage === "NEW" ? "IN_REVIEW" : "DONE",
                        }),
                      )
                    }
                  >
                    {q.stage === "NEW" ? "Start review" : "Mark complete"}
                  </button>
                )}
              </div>
            ))}
          </section>
        </>
      )}
    </>
  );
}
