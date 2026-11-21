import React, { useEffect, useState } from "react";
import { Pencil, Trash2, RotateCcw, Database, Layers } from "lucide-react";
import { api, Form, Modal, rupee, typeNames } from "./lib";
import { DataTable } from "./DataTable";

const columns = {
  ORDER: ["Order", "Customer / fulfilment", "Order value", true],
  REVIEW: ["Review", "Furniture / rating", "Stars"],
  LEAD: ["Enquiry", "Customer / source", "Budget", true],
  VISIT: ["Appointment", "Customer / visit", "Guests"],
  CAMPAIGN: ["Campaign", "Audience", "Recipients"],
  TICKET: ["Service request", "Customer / furniture", "Items"],
  JOB: ["Workshop job", "Team / finish", "Labour hours"],
  PURCHASE: ["Purchase order", "Supplier", "PO value", true],
  TRANSFER: ["Transfer", "Movement", "Units"],
  RETURN: ["Return", "Reason", "Value", true],
  Inventory: ["Furniture / SKU", "Stock type", "Units"],
  Operations: ["Route / booking", "Crew / work", "Stops"],
  Planning: ["Plan", "Forecast basis", "Units"],
  "Customer history": ["Customer", "Activity", "Interactions"],
  "Product catalogue": ["Furniture", "SKU / finish", "Price", true],
  "Site studio": ["Page or form", "Destination", "Sections"],
  Administration: ["Team member", "Responsibilities", "Permissions"],
  Ledger: ["Journal entry", "Debit / credit", "Amount", true],
};
export function DeleteRecord({ name, detail, close, submit }) {
  const [busy, B] = useState(false),
    [error, E] = useState("");
  return (
    <Modal title="Delete record?" close={close}>
      <p>
        <strong>{name}</strong>
      </p>
      <p>{detail}</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="row wrap">
        <button onClick={close} disabled={busy}>
          Cancel
        </button>
        <button
          className="danger-action"
          disabled={busy}
          onClick={async () => {
            B(true);
            try {
              await submit();
              close();
            } catch (e) {
              E(e.message);
            } finally {
              B(false);
            }
          }}
        >
          Delete record
        </button>
      </div>
    </Modal>
  );
}
export function ExampleWorkspace({ tab, user }) {
  const [rows, R] = useState(null),
    [error, E] = useState(""),
    [edit, A] = useState(null),
    [remove, X] = useState(null),
    [branch, B] = useState("All"),
    [state, S] = useState("Current"),
    [busy, G] = useState(null);
  async function read() {
    const result = await api("/admin/examples");
    R(result);
  }
  useEffect(() => {
    let active = true;
    api("/admin/examples")
      .then((r) => {
        if (active) R(r);
      })
      .catch((e) => {
        if (active) E(e.message);
      });
    return () => {
      active = false;
    };
  }, [user.id, user.role]);
  useEffect(() => {
    A(null);
    X(null);
    S("Current");
    E("");
  }, [tab]);
  async function mutate(row, action, body = {}) {
    try {
      await api("/admin/examples/" + row.id, {
        ...body,
        action,
        revision: row.revision,
      });
    } finally {
      await read();
    }
  }
  async function toggle(row) {
    G(row.id);
    E("");
    try {
      await mutate(row, row.enabled ? "disable" : "enable");
    } catch (e) {
      E(e.message);
    } finally {
      G(null);
    }
  }
  const matches = (rows || []).filter(
    (r) =>
      (tab === "Overview" || r.module === tab) &&
      (branch === "All" || r.branch === branch),
  );
  const shown = matches.filter((r) =>
    state === "Deleted"
      ? r.deleted
      : !r.deleted &&
        (state === "Current" || r.enabled === (state === "Enabled")),
  );
  const names = columns[tab] || ["Record", "Details", "Value"];
  return (
    <section className="example-section">
      <div className="demo-caption">
        <Database size={18} />
        <p>
          <strong>Demo records</strong>
          <small>
            Practice changes here. Sample orders, stock and amounts are stored
            in the demo workspace.
          </small>
        </p>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!rows ? (
        <p>Loading demo records…</p>
      ) : (
        <>
          {tab === "Overview" && (
            <div className="sample-metrics">
              {[
                [
                  "Sample orders",
                  matches.filter((r) => r.module === "ORDER" && !r.deleted)
                    .length,
                ],
                [
                  "Open enquiries",
                  matches.filter((r) => r.module === "LEAD" && !r.deleted)
                    .length,
                ],
                [
                  "Demo order value",
                  rupee(
                    matches
                      .filter(
                        (r) => r.module === "ORDER" && !r.deleted && r.enabled,
                      )
                      .reduce((n, r) => n + Number(r.metric), 0),
                  ),
                ],
              ].map(([name, v]) => (
                <div key={name}>
                  <small>{name}</small>
                  <strong>{v}</strong>
                </div>
              ))}
            </div>
          )}
          <div className="panel">
            <div className="grid-heading">
              <h2>
                {tab === "Overview"
                  ? "All demo activity"
                  : typeNames[tab] || tab}
              </h2>
              <div className="row wrap">
                {user.role === "SUPER_ADMIN" && (
                  <label>
                    Showroom{" "}
                    <select
                      value={branch}
                      onChange={(e) => B(e.target.value)}
                      aria-label="Demo showroom"
                    >
                      {["All", "Central", "North"].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  Show{" "}
                  <select
                    aria-label="Demo record status"
                    value={state}
                    onChange={(e) => S(e.target.value)}
                  >
                    {["Current", "Enabled", "Disabled", "Deleted"].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <div className="responsive-records">
              <DataTable
                label="Demo records"
                context={[tab, branch, state].join("|")}
              >
                <thead>
                  <tr>
                    <th>{names[0]}</th>
                    <th>Stage</th>
                    <th>Showroom</th>
                    <th className="numeric">{names[2]}</th>
                    <th>Access</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => (
                    <tr key={row.id}>
                      <td className="row-title">
                        <b>{row.title}</b>
                        <small>
                          {tab === "Overview"
                            ? (typeNames[row.module] || row.module) + " · "
                            : ""}
                          {row.detail}
                        </small>
                      </td>
                      <td data-label="Stage">{row.stage}</td>
                      <td data-label="Showroom">{row.branch}</td>
                      <td className="numeric" data-label={names[2]}>
                        {columns[row.module]?.[3]
                          ? rupee(row.metric)
                          : Number(row.metric)}
                      </td>
                      <td data-label="Access">
                        {row.deleted
                          ? "Deleted"
                          : row.enabled
                            ? "Enabled"
                            : "Disabled"}
                      </td>
                      <td className="row-actions">
                        <div className="table-actions">
                          {row.deleted ? (
                            <button
                              onClick={async () => {
                                try {
                                  await mutate(row, "restore");
                                } catch (e) {
                                  E(e.message);
                                }
                              }}
                            >
                              <RotateCcw size={14} />
                              Restore
                            </button>
                          ) : (
                            <>
                              <button onClick={() => A(row)}>
                                <Pencil size={14} />
                                Edit
                              </button>
                              <button
                                disabled={busy === row.id}
                                onClick={() => toggle(row)}
                              >
                                {row.enabled ? "Disable" : "Enable"}
                              </button>
                              <button
                                className="delete-link"
                                onClick={() => X(row)}
                              >
                                <Trash2 size={14} />
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
            {!shown.length && (
              <p className="hint">No demo records in this view.</p>
            )}
          </div>
        </>
      )}
      {edit && (
        <Modal title="Edit demo record" close={() => A(null)}>
          <Form
            fields={[
              ["title", columns[edit.module][0], "text", null, edit.title],
              [
                "detail",
                columns[edit.module][1],
                "textarea",
                null,
                edit.detail,
              ],
              ["stage", "Stage", "text", null, edit.stage],
              ["metric", columns[edit.module][2], "number", null, edit.metric],
            ]}
            button="Save changes"
            submit={async (b) => {
              await mutate(edit, "edit", b);
              A(null);
            }}
          />
        </Modal>
      )}
      {remove && (
        <DeleteRecord
          name={remove.title}
          detail="You can restore this sample from the Deleted view."
          close={() => X(null)}
          submit={() => mutate(remove, "delete")}
        />
      )}
    </section>
  );
}
export function WorkspaceSource({ value, change }) {
  return (
    <div className="source-switch" role="group" aria-label="Workspace data">
      <button aria-pressed={!value} onClick={() => change(false)}>
        <Layers size={15} />
        Live data
      </button>
      <button aria-pressed={value} onClick={() => change(true)}>
        <Database size={15} />
        Demo data
      </button>
    </div>
  );
}
