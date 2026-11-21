import React, { useState, useEffect } from "react";
import { DataTable } from "./DataTable";
import { api, Form, Badge, label, rupee } from "./lib";
import { DeleteRecord } from "./AdminExamples";
import { PackingEditor } from "./FurnitureTools";
import { searchText } from "./Customers";

const descriptions = [
  ["name", "Product name"],
  ["category", "Category"],
  ["finish", "Finish"],
  ["dimensions", "Dimensions"],
  ["warranty", "Warranty"],
];
const productFields = (row) =>
  descriptions.map(([key, title]) => [key, title, "text", null, row?.[key]]);
export function CatalogueManager({ u, desk, refresh, notify }) {
  const [branch, B] = useState(u.branch || desk.branches[0]),
    [rows, R] = useState([]),
    [requests, Q] = useState([]),
    [loading, L] = useState(true),
    [error, E] = useState(""),
    [search, S] = useState(""),
    [edit, A] = useState(null),
    [tick, T] = useState(0),
    [deciding, D] = useState(false),
    [deleted, showDeleted] = useState(false),
    [remove, X] = useState(null);
  const adminAll = u.role === "SUPER_ADMIN";
  useEffect(() => {
    let current = true;
    L(true);
    E("");
    Promise.all([
      api("/catalog-admin?branch=" + encodeURIComponent(branch)),
      api("/catalog-admin/prices?branch=" + encodeURIComponent(branch)),
    ])
      .then(([list, queue]) => {
        if (current) {
          R(list);
          Q(queue);
        }
      })
      .catch((e) => {
        if (current) E(e.message);
      })
      .finally(() => {
        if (current) L(false);
      });
    return () => {
      current = false;
    };
  }, [branch, tick]);
  async function saved(message) {
    A(null);
    T((v) => v + 1);
    await refresh();
    notify(message);
  }
  const words = searchText(search).split(" ").filter(Boolean);
  async function visibility(row, action) {
    await api("/admin/manage/listing/" + row.id, {
      branch,
      revision: row.listing_revision,
      action,
    });
    await saved(
      action === "restore" ? "Listing restored as hidden" : "Listing updated",
    );
  }
  const filtered = rows.filter(
    (r) =>
      !!r.archived === deleted &&
      words.every((w) =>
        searchText([r.sku, r.name, r.category, r.finish].join(" ")).includes(w),
      ),
  );
  async function decide(id, stage) {
    D(true);
    E("");
    try {
      await api("/catalog-admin/prices/" + id, { stage });
      await saved("Price request " + stage.toLowerCase());
    } catch (e) {
      E(e.message);
    } finally {
      D(false);
    }
  }
  return (
    <div className="catalog-admin">
      <div className="panel">
        <div className="catalog-tools">
          <label className="field">
            Showroom
            <select
              value={branch}
              onChange={(e) => {
                B(e.target.value);
                A(null);
              }}
            >
              {(adminAll ? desk.branches : [u.branch]).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Find a listing
            <input
              value={search}
              placeholder="Name, SKU, category or finish"
              onChange={(e) => {
                S(e.target.value);
              }}
            />
          </label>
          <label className="field">
            Listing view
            <select
              aria-label="Listing view"
              value={deleted ? "deleted" : "current"}
              onChange={(e) => {
                showDeleted(e.target.value === "deleted");
                A(null);
              }}
            >
              <option value="current">Current listings</option>
              <option value="deleted">Deleted listings</option>
            </select>
          </label>
          <button className="primary" onClick={() => A({ kind: "new" })}>
            Add product
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {edit && (
          <section className="listing-editor">
            <div className="section-action">
              <h3>
                {edit.kind === "new"
                  ? "New product"
                  : edit.kind === "price"
                    ? "Request a selling price"
                    : edit.kind === "packing"
                      ? "Shipping cartons"
                      : "Edit listing"}
              </h3>
              <button onClick={() => A(null)}>Close editor</button>
            </div>
            {edit.kind === "new" ? (
              <Form
                key="new"
                fields={[
                  ["sku", "Unique SKU"],
                  ...productFields(null),
                  ["price", "Selling price (₹)", "number"],
                  ["cost", "Unit cost (₹)", "number"],
                  ["onHand", "Opening stock", "number", null, 0],
                  [
                    "photo",
                    "Product photograph",
                    "select",
                    ["sofa", "chair", "bed", "dining", "lounge"],
                    "chair",
                  ],
                ]}
                button="Create product"
                submit={async (b) => {
                  await api("/catalog-admin", { ...b, branch });
                  await saved("Product is available in " + branch);
                }}
              />
            ) : edit.kind === "packing" ? (
              <PackingEditor
                row={edit.row}
                branch={branch}
                onSaved={() => saved("Carton measurements saved")}
              />
            ) : edit.kind === "price" ? (
              <>
                <p>
                  {edit.row.name} · Current price {rupee(edit.row.price)}.
                  Approved prices apply across showrooms.
                </p>
                <Form
                  key={"price" + edit.row.id}
                  fields={[
                    ["price", "Proposed price (₹)", "number"],
                    ["reason", "Reason for the price change", "textarea"],
                  ]}
                  button="Submit price request"
                  submit={async (b) => {
                    await api(
                      "/catalog-admin/" + edit.row.id + "/price-request",
                      { ...b, branch },
                    );
                    await saved("Price request submitted");
                  }}
                />
              </>
            ) : (
              <Form
                key={"edit" + edit.row.id}
                fields={[
                  ...productFields(edit.row),
                  [
                    "visibility",
                    "Storefront visibility",
                    "select",
                    [
                      ["yes", "Published"],
                      ["no", "Hidden"],
                    ],
                    edit.row.published ? "yes" : "no",
                  ],
                ]}
                button="Save listing"
                submit={async (b) => {
                  await api("/catalog-admin/" + edit.row.id, {
                    ...b,
                    branch,
                    published: b.visibility === "yes",
                    revision: edit.row.listing_revision,
                  });
                  await saved("Listing updated");
                }}
              />
            )}
          </section>
        )}
        {loading ? (
          <p>Loading listings…</p>
        ) : (
          <>
            <div className="catalog-results">
              <span>{filtered.length} listings</span>
              <small>Available stock comes from inventory</small>
            </div>
            <div className="tablewrap responsive-records listing-table">
              <DataTable
                label="Product listings"
                searchable={false}
                context={branch + "|" + search}
                initialSize={20}
                pagingName="listings"
              >
                <thead>
                  <tr>
                    <th>Product</th>
                    <th scope="col" className="numeric">
                      Price
                    </th>
                    <th scope="col" className="numeric">
                      Available
                    </th>
                    <th>Visibility</th>
                    <th scope="col" className="table-actions-heading">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id}>
                      <td className="row-title">
                        <b>{r.name}</b>
                        <small>
                          {r.sku} · {r.category}
                        </small>
                      </td>
                      <td className="numeric" data-label="Price">
                        {rupee(r.price)}
                      </td>
                      <td className="numeric" data-label="Available">
                        {r.available}
                      </td>
                      <td data-label="Visibility">
                        {r.archived
                          ? "Deleted"
                          : r.published
                            ? "Published"
                            : "Hidden"}
                      </td>
                      <td className="row-actions">
                        <div className="row wrap table-actions">
                          {r.archived ? (
                            <button
                              onClick={() =>
                                visibility(r, "restore").catch((e) =>
                                  E(e.message),
                                )
                              }
                            >
                              Restore
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => A({ kind: "edit", row: r })}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => A({ kind: "packing", row: r })}
                              >
                                Shipping cartons
                              </button>
                              <button
                                onClick={() => A({ kind: "price", row: r })}
                              >
                                Price request
                              </button>
                              <button
                                onClick={() =>
                                  visibility(
                                    r,
                                    r.published ? "disable" : "enable",
                                  ).catch((e) => E(e.message))
                                }
                              >
                                {r.published ? "Disable" : "Enable"}
                              </button>
                              <button
                                className="delete-link"
                                onClick={() => X(r)}
                              >
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
          </>
        )}
      </div>
      {remove && (
        <DeleteRecord
          name={remove.name}
          detail={
            "Remove this listing from the " +
            branch +
            " catalogue. You can restore it from Deleted listings."
          }
          close={() => X(null)}
          submit={() => visibility(remove, "delete")}
        />
      )}
      <section className="panel">
        <h3>Price approvals</h3>
        {!requests.length && <p>No price requests for this showroom.</p>}
        {requests.map((r) => (
          <div className="listlink" key={r.id}>
            <span>
              <b>
                {r.sku} · {rupee(r.current_price)} → {rupee(r.proposed)}
              </b>
              <small>{r.reason}</small>
            </span>
            <Badge>{r.stage}</Badge>
            {adminAll && r.stage === "PENDING" && (
              <div className="row">
                <button
                  disabled={deciding}
                  onClick={() => decide(r.id, "APPROVED")}
                >
                  Approve
                </button>
                <button
                  disabled={deciding}
                  onClick={() => decide(r.id, "DECLINED")}
                >
                  Decline
                </button>
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}

export function StaffGrants({ id, roles, branches, onDone }) {
  const [data, D] = useState(null),
    [primary, P] = useState(""),
    [branch, B] = useState(""),
    [selected, S] = useState([]),
    [error, E] = useState(""),
    [busy, G] = useState(false);
  useEffect(() => {
    let current = true;
    api("/staff/" + id + "/access")
      .then((r) => {
        if (current) {
          D(r);
          P(r.role);
          B(r.branch);
          S(r.granted);
        }
      })
      .catch((e) => {
        if (current) E(e.message);
      });
    return () => {
      current = false;
    };
  }, [id]);
  const available = roles
    .filter((r) => !["CUSTOMER", "SUPER_ADMIN"].includes(r))
    .slice()
    .sort();
  return (
    <>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {data ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            G(true);
            E("");
            try {
              await api("/staff/" + id + "/access", {
                primary,
                branch,
                roles: [...new Set([...selected, primary])],
                version: data.auth_version,
              });
              await onDone();
            } catch (e) {
              E(e.message);
            } finally {
              G(false);
            }
          }}
        >
          <p>
            Choose the showroom and roles for {data.display_name}. This staff
            member signs in again after you save.
          </p>
          <div className="fields">
            <label className="field">
              Primary role
              <select value={primary} onChange={(e) => P(e.target.value)}>
                {available.map((r) => (
                  <option key={r} value={r}>
                    {label(r)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Showroom
              <select value={branch} onChange={(e) => B(e.target.value)}>
                {branches.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
          </div>
          <fieldset className="grant-grid">
            <legend>Assigned roles</legend>
            {available.map((r) => (
              <label key={r}>
                <input
                  type="checkbox"
                  checked={r === primary || selected.includes(r)}
                  disabled={r === primary}
                  onChange={(e) =>
                    S((prev) =>
                      e.target.checked
                        ? [...prev, r]
                        : prev.filter((v) => v !== r),
                    )
                  }
                />
                {label(r)}
              </label>
            ))}
          </fieldset>
          <button disabled={busy} className="primary">
            Save staff access
          </button>
        </form>
      ) : (
        !error && <p>Loading assigned roles…</p>
      )}
    </>
  );
}
export function ReviewModeration({ data, reload, refresh, notify }) {
  const [editing, E] = useState(false),
    w = data.record,
    original = data.feedback?.[0];
  return (
    <section className="panel product-reviews">
      <div className="section-action">
        <h3>Review moderation</h3>
        <button onClick={() => E(!editing)}>
          {editing ? "Cancel edit" : "Edit and moderate"}
        </button>
      </div>
      {original && (
        <p>
          <b>
            {original.name} · {original.stars}/5
          </b>
          <small>
            {original.verified ? "Verified purchase" : "Customer review"}
          </small>
        </p>
      )}
      {editing && (
        <>
          {original && (
            <blockquote>
              <b>Original customer review</b>
              <p>{original.author_title}</p>
              <p>{original.author_body}</p>
            </blockquote>
          )}
          <Form
            key={w.revision}
            fields={[
              ["title", "Published title", "text", null, w.title],
              ["detail", "Published review", "textarea", null, w.detail],
              [
                "stage",
                "Moderation status",
                "select",
                ["PENDING", "PUBLISHED", "DECLINED"],
                w.stage,
              ],
              ["reason", "Reason for audit history", "textarea"],
            ]}
            button="Save moderation"
            submit={async (b) => {
              await api("/reviews/" + w.id + "/moderate", {
                ...b,
                revision: w.revision,
              });
              await reload();
              await refresh();
              E(false);
              notify("Review moderation saved");
            }}
          />
        </>
      )}
    </section>
  );
}
