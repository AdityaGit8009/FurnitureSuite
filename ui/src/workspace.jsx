import React, { useState, useEffect } from "react";
import { DataTable } from "./DataTable";
import {
  ExampleWorkspace,
  WorkspaceSource,
  DeleteRecord,
} from "./AdminExamples";
import {
  Activity,
  ArrowRight,
  Box,
  BriefcaseBusiness,
  CalendarClock,
  ChartNoAxesColumn,
  ChevronRight,
  ClipboardList,
  Factory,
  LayoutGrid,
  Package,
  Plus,
  Search,
  Settings,
  Shield,
  ShoppingBag,
  Truck,
  Users,
  Wallet,
  Download,
  Printer,
} from "lucide-react";
import { api, rupee, label, allow, typeNames, Modal, Form, Badge } from "./lib";
import { fitLabel } from "./FurnitureTools";
import { CustomerHistory } from "./Customers";
import { CatalogueManager, ReviewModeration } from "./BackOffice";
import { StudioAdmin } from "./StudioAdmin";
import { Mine } from "./Experience";
import { PriceWatches, OrderPayment, orderPaymentLabel } from "./RetailTools";
const groups = {
  Commerce: ["ORDER", "REVIEW"],
  CRM: ["LEAD", "VISIT", "CAMPAIGN", "TICKET"],
  ERP: ["JOB", "PURCHASE", "TRANSFER", "RETURN"],
};
const access = {
  ORDER: "CUSTOMER SALES CASHIER ACCOUNTANT WAREHOUSE DELIVERY SUPPORT",
  LEAD: "CUSTOMER SALES DESIGNER",
  JOB: "PRODUCTION DESIGNER WAREHOUSE ACCOUNTANT",
  PURCHASE: "PURCHASE WAREHOUSE ACCOUNTANT",
  TRANSFER: "WAREHOUSE",
  VISIT: "CUSTOMER SALES DESIGNER DELIVERY",
  CAMPAIGN: "MARKETING",
  TICKET: "CUSTOMER SUPPORT DELIVERY",
  RETURN: "CUSTOMER WAREHOUSE SUPPORT ACCOUNTANT",
  REVIEW: "CUSTOMER SUPPORT",
};
function csv(file, rows) {
  let q = (v) =>
    '"' +
    String(v ?? "")
      .replace(/^[=+@\-]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  let blob = new Blob(
      ["\ufeff" + rows.map((r) => r.map(q).join(",")).join("\r\n")],
      { type: "text/csv" },
    ),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = file;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export function Workspace(p) {
  let { u, desk, cat, M, close, refresh, notify, items, branch } = p;
  const isAdmin = allow(u, "ADMIN");
  const sourceKey = "studio-workspace-source-" + u.id;
  const [demo, showDemo] = useState(() => {
    const choice = sessionStorage.getItem(sourceKey);
    return choice ? choice === "demo" : isAdmin && !desk.work.length;
  });
  const [recordEdit, setRecordEdit] = useState(null),
    [recordDelete, setRecordDelete] = useState(null);
  const [archived, setArchived] = useState(false),
    [teamArchive, setTeamArchive] = useState(false);
  async function manageWork(row, action, body = {}) {
    await api("/admin/manage/work/" + row.id, {
      action,
      revision: row.revision,
      ...body,
    });
    await refresh();
  }
  async function manageStaff(row, action) {
    await api("/admin/manage/staff/" + row.id, {
      action,
      version: row.auth_version,
    });
    await refresh();
  }
  const [tab, V] = useState("Overview"),
    [search, S] = useState(""),
    [status, F] = useState("All"),
    [paymentFilter, setPaymentFilter] = useState("All"),
    [scope, B] = useState("All");
  const [insights, I] = useState(null),
    [reportError, J] = useState("");
  useEffect(() => {
    if (tab === "Planning")
      api("/insights")
        .then(I)
        .catch((e) => J(e.message));
  }, [tab, desk]);
  const [inv, IV] = useState(null);
  useEffect(() => {
    if (tab === "Inventory")
      api("/inventory")
        .then(IV)
        .catch((e) => J(e.message));
  }, [tab, desk]);
  const [ledger, LD] = useState(null);
  useEffect(() => {
    if (tab === "Ledger")
      api("/ledger")
        .then(LD)
        .catch((e) => J(e.message));
  }, [tab, desk]);
  const [ops, O] = useState(null);
  useEffect(() => {
    if (tab === "Operations")
      api("/operations")
        .then(O)
        .catch((e) => J(e.message));
  }, [tab, desk]);
  const matches = desk.work.filter(
      (w) =>
        !!w.archived === archived &&
        (scope === "All" || w.branch === scope) &&
        (tab === "Overview" || w.kind === tab),
    ),
    rows = matches.filter(
      (w) =>
        (status === "All" || w.stage === status) &&
        (tab !== "ORDER" ||
          paymentFilter === "All" ||
          orderPaymentLabel(w) === paymentFilter) &&
        (
          w.title +
          " " +
          w.id +
          " " +
          (w.customer || "") +
          " " +
          (w.assigned_to || "")
        )
          .toLowerCase()
          .includes(search.toLowerCase()),
    );
  const open = (w) => M({ kind: "record", id: w.id });
  const navTo = (t) => ({
    onClick: () => tabTo(t),
    "aria-current": tab === t ? "page" : undefined,
  });
  function tabTo(t) {
    V(t);
    setArchived(false);
    setRecordEdit(null);
    setRecordDelete(null);
    document
      .querySelector(".workspace")
      ?.scrollTo({ top: 0, behavior: "instant" });
    setPaymentFilter("All");
    S("");
    F("All");
  }
  const form = (title, fields, submit, button) =>
    M({
      kind: "form",
      title,
      fields,
      button,
      submit: async (b) => {
        let r = await submit(b);
        await refresh();
        if (r?.id) M({ kind: "record", id: r.id });
        else close();
        notify("Saved");
      },
    });
  const productOpts = items.map((x) => [x.id, x.name + " · " + x.sku]);
  function create(k) {
    let fields = [
      ["title", k === "PURCHASE" ? "Supplier / reference" : "Title"],
    ];
    if (k === "LEAD")
      fields.push(
        [
          "source",
          "Lead source",
          "select",
          [
            "Website",
            "Showroom",
            "Phone",
            "Referral",
            ...desk.work
              .filter((x) => x.kind === "CAMPAIGN")
              .map((x) => x.title),
          ],
        ],
        ["budget", "Budget (INR)", "number", null, 0],
        ["buyDays", "Buying timeline in days", "number", null, 30],
      );
    if (["PURCHASE", "TRANSFER"].includes(k))
      fields.push(
        ["productId", "SKU", "select", productOpts],
        ["qty", "Units", "number"],
      );
    if (k === "TRANSFER")
      fields.push([
        "detail",
        "Destination",
        "select",
        desk.branches.filter((x) => x !== branch),
      ]);
    else
      fields.push([
        "detail",
        k === "LEAD" ? "Requirements, contact and budget" : "Details",
        "textarea",
      ]);
    if (k === "VISIT")
      fields.push([
        "parentId",
        "Lead",
        "select",
        desk.work.filter((x) => x.kind === "LEAD").map((x) => [x.id, x.title]),
      ]);
    if (["VISIT", "LEAD", "CAMPAIGN"].includes(k))
      fields.push([
        "due",
        "Follow-up or scheduled date",
        "date",
        null,
        "",
        k !== "VISIT",
      ]);
    if (k === "LEAD" && u.role !== "CUSTOMER")
      fields.push([
        "customerEmail",
        "Registered customer email (optional)",
        "email",
        null,
        "",
        true,
      ]);
    form("New " + label(k), fields, (b) =>
      api("/work", { ...b, kind: k, branch }),
    );
  }
  const creatable = {
    LEAD: ["CUSTOMER", "SALES", "ADMIN"],
    TRANSFER: ["WAREHOUSE", "ADMIN"],
    PURCHASE: ["PURCHASE", "ADMIN"],
    CAMPAIGN: ["MARKETING", "ADMIN"],
    VISIT: ["SALES", "DESIGNER", "ADMIN"],
  };
  const activeWork = desk.work.filter(
    (w) => !w.archived && w.enabled !== false,
  );
  let orders = activeWork.filter(
      (x) => x.kind === "ORDER" && x.stage !== "CANCELLED",
    ),
    leads = activeWork.filter((x) => x.kind === "LEAD"),
    today = new Date().toLocaleDateString("en-CA"),
    tasks = activeWork.filter(
      (x) =>
        x.due_date &&
        String(x.due_date).slice(0, 10) <= today &&
        ![
          "CLOSED",
          "WON",
          "LOST",
          "ACCEPTED",
          "COMPLETED",
          "CANCELLED",
          "INSTALLED",
        ].includes(x.stage),
    );
  return (
    <div className="shell">
      <aside aria-label="Workspace navigation" tabIndex={0}>
        <div className="eyebrow">STUDIO WORKSPACE</div>
        {allow(u, "ADMIN", "ACCOUNTANT") && (
          <button {...navTo("Ledger")}>
            <Wallet size={16} />
            General ledger
          </button>
        )}
        <button
          className={tab === "Overview" ? "active" : ""}
          {...navTo("Overview")}
        >
          <LayoutGrid size={16} />
          Overview
        </button>
        {Object.entries(groups).map(([g, ks]) => {
          let vis = ks.filter((k) =>
            allow(u, "ADMIN", ...access[k].split(" ")),
          );
          return (
            vis.length > 0 && (
              <div key={g}>
                <small>{g}</small>
                {vis.map((k) => (
                  <button
                    className={tab === k ? "active" : ""}
                    key={k}
                    {...navTo(k)}
                  >
                    {g === "Commerce" ? (
                      <ShoppingBag size={15} />
                    ) : g === "CRM" ? (
                      <Users size={15} />
                    ) : (
                      <Package size={15} />
                    )}{" "}
                    {typeNames[k]}
                  </button>
                ))}
              </div>
            )
          );
        })}
        {allow(u, "WAREHOUSE", "PURCHASE", "ADMIN") && (
          <button {...navTo("Inventory")}>
            <Box size={16} />
            Inventory
          </button>
        )}
        {allow(
          u,
          "ADMIN",
          "ACCOUNTANT",
          "CASHIER",
          "WAREHOUSE",
          "DELIVERY",
        ) && (
          <button {...navTo("Operations")}>
            <Truck size={16} />
            Dispatch & finance
          </button>
        )}
        {allow(
          u,
          "ADMIN",
          "ACCOUNTANT",
          "PURCHASE",
          "WAREHOUSE",
          "PRODUCTION",
        ) && (
          <button {...navTo("Planning")}>
            <ChartNoAxesColumn size={16} />
            Planning & margins
          </button>
        )}
        {allow(u, "ADMIN", "SALES", "SUPPORT") && (
          <button {...navTo("Customer history")}>
            <Users size={16} />
            Customer history
          </button>
        )}
        {allow(u, "ADMIN") && (
          <>
            <button {...navTo("Product catalogue")}>
              <Package size={16} />
              Product catalogue
            </button>
            <button {...navTo("Site studio")}>
              <LayoutGrid size={16} />
              Site studio
            </button>
            <button {...navTo("Administration")}>
              <Shield size={16} />
              Administration
            </button>
          </>
        )}
      </aside>
      <section
        className="workspace"
        aria-label="Workspace content"
        tabIndex={0}
      >
        <div className="eyebrow green">
          {label(u.role)} / {u.branch}
        </div>
        <div className="sectionhead">
          <h1>{typeNames[tab] || tab}</h1>
          {isAdmin && (
            <WorkspaceSource
              value={demo}
              change={(next) => {
                showDemo(next);
                sessionStorage.setItem(sourceKey, next ? "demo" : "live");
              }}
            />
          )}
          {!(isAdmin && demo) &&
            creatable[tab] &&
            allow(u, ...creatable[tab]) && (
              <button className="primary" onClick={() => create(tab)}>
                <Plus size={16} />
                New {label(tab)}
              </button>
            )}
        </div>
        {isAdmin && demo ? (
          <ExampleWorkspace tab={tab} user={u} />
        ) : (
          <>
            {tab === "Overview" && (
              <>
                <div className="metrics">
                  {[
                    [
                      ShoppingBag,
                      "Order value",
                      rupee(orders.reduce((a, x) => a + Number(x.amount), 0)),
                    ],
                    [
                      ClipboardList,
                      "Active orders",
                      orders.filter(
                        (x) => !["DELIVERED", "INSTALLED"].includes(x.stage),
                      ).length,
                    ],
                    [
                      Users,
                      "Open enquiries",
                      leads.filter(
                        (x) => !["LOST", "ACCEPTED"].includes(x.stage),
                      ).length,
                    ],
                    [CalendarClock, "Follow-ups due", tasks.length],
                  ].map(([I, n, v]) => (
                    <div key={n}>
                      <I size={19} />
                      <small>{n}</small>
                      <strong>{v}</strong>
                    </div>
                  ))}
                </div>
                {tasks.length > 0 && (
                  <div className="panel">
                    <h3>Due for follow-up</h3>
                    {tasks.slice(0, 6).map((x) => (
                      <button
                        className="listlink"
                        key={x.id}
                        onClick={() => open(x)}
                      >
                        {x.title}
                        <span>{String(x.due_date).slice(0, 10)} →</span>
                      </button>
                    ))}
                  </div>
                )}
                {desk.inbox?.length > 0 && (
                  <div className="panel">
                    <h3>Notifications</h3>
                    {desk.inbox.slice(0, 8).map((x, i) => (
                      <p key={i}>
                        {x.message}
                        <small>{String(x.created_at).slice(0, 16)}</small>
                      </p>
                    ))}
                  </div>
                )}
                {allow(u, "SALES", "ADMIN") && leads.length > 0 && (
                  <div className="panel">
                    <h3>Sales pipeline</h3>
                    <div className="chips">
                      {[
                        "NEW",
                        "CONTACTED",
                        "QUALIFIED",
                        "MEASURED",
                        "QUOTED",
                        "ACCEPTED",
                        "LOST",
                      ].map((stage) => (
                        <button
                          key={stage}
                          onClick={() => {
                            tabTo("LEAD");
                            F(stage);
                          }}
                        >
                          {label(stage)} ·{" "}
                          {leads.filter((l) => l.stage === stage).length}
                        </button>
                      ))}
                    </div>
                    <p>
                      Open quotation value ·{" "}
                      {rupee(
                        leads
                          .filter((l) => l.stage === "QUOTED")
                          .reduce((n, l) => n + l.amount, 0),
                      )}
                    </p>
                  </div>
                )}
                <h3>Recent activity</h3>
              </>
            )}
            {u.role === "CUSTOMER" && tab === "Overview" && (
              <>
                <Mine />
                <PriceWatches />
              </>
            )}
            {tab === "Customer history" ? (
              <CustomerHistory open={open} revision={desk} />
            ) : tab === "Product catalogue" ? (
              <CatalogueManager {...p} />
            ) : tab === "Site studio" ? (
              <StudioAdmin {...p} />
            ) : tab === "Ledger" ? (
              <>
                {reportError && <p className="error">{reportError}</p>}
                {ledger && (
                  <>
                    <div className="row wrap">
                      <button
                        onClick={() =>
                          form(
                            "Post journal entry",
                            [
                              [
                                "debit",
                                "Debit account",
                                "select",
                                ledger.accounts,
                              ],
                              [
                                "credit",
                                "Credit account",
                                "select",
                                ledger.accounts,
                              ],
                              ["amount", "Amount", "number"],
                              ["memo", "Business reason"],
                              ["due", "Posting date", "date"],
                              [
                                "branch",
                                "Branch",
                                "select",
                                u.role === "SUPER_ADMIN"
                                  ? desk.branches
                                  : [u.branch],
                              ],
                            ],
                            (b) => api("/ledger", b),
                          )
                        }
                      >
                        Post journal
                      </button>
                      {u.role === "SUPER_ADMIN" && (
                        <button
                          onClick={() =>
                            form(
                              "Close accounting period",
                              [
                                ["branch", "Branch", "select", desk.branches],
                                [
                                  "due",
                                  "Lock all postings through date",
                                  "date",
                                ],
                              ],
                              (b) => api("/ledger/close", b),
                              "Close period",
                            )
                          }
                        >
                          Close period
                        </button>
                      )}
                    </div>
                    <div className="panel">
                      <h3>Trial balance</h3>
                      <DataTable label="Trial balance" exportable>
                        <thead>
                          <tr>
                            <th>Account</th>
                            <th className="numeric">Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(ledger.balances).map(([name, n]) => (
                            <tr key={name}>
                              <td>{name}</td>
                              <td className="numeric">
                                {rupee(Math.abs(n))} {n >= 0 ? "Dr" : "Cr"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </DataTable>
                      {!ledger.rows.length && <p>No postings yet.</p>}
                    </div>
                    <div className="panel">
                      <h3>Journal entries</h3>
                      <DataTable label="Journal entries" exportable>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Debit / credit</th>
                            <th>Memo</th>
                            <th>Branch</th>
                            <th className="numeric">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ledger.rows.map((x) => (
                            <tr key={x.id}>
                              <td>{String(x.book_date)}</td>
                              <td>
                                {x.debit} / {x.credit}
                              </td>
                              <td>{x.memo}</td>
                              <td>{x.branch}</td>
                              <td className="numeric">{rupee(x.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </DataTable>
                    </div>
                  </>
                )}
              </>
            ) : tab === "Operations" ? (
              <>
                {reportError && <p className="error">{reportError}</p>}
                {ops?.vehicles && (
                  <div className="panel">
                    <h3>Fleet & delivery schedule</h3>
                    {allow(u, "ADMIN") && (
                      <button
                        onClick={() =>
                          form(
                            "Register vehicle",
                            [
                              ["name", "Registration / vehicle name"],
                              [
                                "capacity",
                                "Usable cargo volume (m³)",
                                "number",
                              ],
                              ["branch", "Branch", "select", desk.branches],
                            ],
                            (b) => api("/vehicles", b),
                          )
                        }
                      >
                        Add vehicle
                      </button>
                    )}
                    {ops.vehicles.map((v) => (
                      <p key={v.name}>
                        {v.name} · {v.branch} · {v.capacity} m³
                      </p>
                    ))}
                    {allow(u, "ADMIN", "WAREHOUSE") && (
                      <button
                        onClick={() =>
                          form(
                            "Schedule delivery",
                            [
                              [
                                "id",
                                "Order",
                                "select",
                                desk.work
                                  .filter(
                                    (x) =>
                                      x.kind === "ORDER" &&
                                      ["PACKED", "CONFIRMED"].includes(x.stage),
                                  )
                                  .map((x) => [x.id, x.title]),
                              ],
                              [
                                "vehicle",
                                "Vehicle",
                                "select",
                                ops.vehicles.map((x) => x.name),
                              ],
                              ["crew", "Crew / installer"],
                              ["volume", "Packed volume (m³)", "number"],
                              ["due", "Delivery date", "date"],
                            ],
                            (b) => api("/work/" + b.id + "/dispatch-slot", b),
                          )
                        }
                      >
                        Book delivery slot
                      </button>
                    )}
                    {ops.route.map((x) => (
                      <p key={x.work_id}>
                        <b>
                          #{x.work_id} · {x.vehicle}
                        </b>{" "}
                        · {String(x.slot).slice(0, 10)} · {x.crew}
                        <small>{x.detail}</small>
                      </p>
                    ))}
                  </div>
                )}
                {ops?.payments && (
                  <div className="panel">
                    <h3>Bank reconciliation</h3>
                    {!ops.payments.length && (
                      <p>Collections and refunds appear here.</p>
                    )}
                    {ops.payments.map((x) => (
                      <div className="listlink" key={x.id}>
                        <div>
                          <b>{x.ref}</b>
                          <small>
                            Order #{x.work_id} · {rupee(x.amount)}
                          </small>
                        </div>
                        {x.statement_ref ? (
                          <Badge>Matched</Badge>
                        ) : allow(u, "ADMIN", "ACCOUNTANT") ? (
                          <button
                            onClick={() =>
                              form(
                                "Match statement entry",
                                [
                                  ["ref", "Bank statement reference"],
                                  [
                                    "amount",
                                    "Absolute statement amount",
                                    "number",
                                  ],
                                ],
                                (b) => api("/bank/" + x.id, b),
                              )
                            }
                          >
                            Match entry
                          </button>
                        ) : (
                          <Badge>Unmatched</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : tab === "Planning" ? (
              <>
                <div className="panel">
                  <h3>Demand & replenishment</h3>
                  <p>
                    Next 30 days estimated from the preceding 30 days of
                    non-cancelled order quantities.
                  </p>
                  {reportError && <p className="error">{reportError}</p>}
                  <DataTable label="Demand and replenishment">
                    <thead>
                      <tr>
                        <th>SKU / branch</th>
                        <th scope="col" className="numeric">
                          Available
                        </th>
                        <th scope="col" className="numeric">
                          Forecast units
                        </th>
                        <th scope="col" className="numeric">
                          Suggested reorder
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {insights?.demand.map((x) => (
                        <tr key={x.sku + x.branch}>
                          <td>
                            {x.name}
                            <small>
                              {x.sku} · {x.branch}
                            </small>
                          </td>
                          <td className="numeric">{x.available}</td>
                          <td className="numeric">{x.sold}</td>
                          <td className="numeric">
                            {Math.max(0, x.sold - x.available)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                </div>
                {insights?.margin && (
                  <div className="panel">
                    <h3>Delivered order contribution</h3>
                    <p>
                      Order total less recorded item costs, before overheads and
                      returns.
                    </p>
                    {insights.margin.map((x) => (
                      <div className="listlink" key={x.id}>
                        {x.title}
                        <b>{rupee(x.invoiced - x.item_cost)}</b>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : tab === "Inventory" ? (
              <>
                <div className="panel">
                  <h3>Stock available to promise</h3>
                  {reportError && <p className="error">{reportError}</p>}
                  <div className="row wrap">
                    {allow(u, "WAREHOUSE", "ADMIN") && (
                      <button
                        onClick={() =>
                          form(
                            "Submit physical count",
                            [
                              ["productId", "SKU", "select", productOpts],
                              [
                                "branch",
                                "Branch",
                                "select",
                                u.role === "SUPER_ADMIN"
                                  ? desk.branches
                                  : [u.branch],
                              ],
                              [
                                "sellable",
                                "Sellable units including reserved",
                                "number",
                              ],
                              ["damaged", "Damaged units", "number", null, 0],
                              [
                                "display",
                                "Display-only units",
                                "number",
                                null,
                                0,
                              ],
                              ["reason", "Count reason"],
                            ],
                            (b) => api("/inventory/count", b),
                          )
                        }
                      >
                        Physical count
                      </button>
                    )}
                    {u.role === "SUPER_ADMIN" && (
                      <button
                        onClick={() =>
                          form(
                            "Update SKU pricing",
                            [
                              ["id", "SKU", "select", productOpts],
                              ["price", "New selling price", "number"],
                              ["cost", "Unit cost", "number"],
                              ["warranty", "Warranty terms"],
                            ],
                            (b) => api("/inventory/product/" + b.id, b),
                          )
                        }
                      >
                        Update price
                      </button>
                    )}
                  </div>
                  {inv?.counts.map((c) => (
                    <div className="listlink" key={c.id}>
                      <div>
                        {c.sku} · {c.branch} · {c.sellable} sellable{" "}
                        <small>
                          {c.damaged} damaged · {c.display_units} display ·{" "}
                          {c.reason}
                        </small>
                      </div>
                      {c.approver ? (
                        <Badge>Approved</Badge>
                      ) : allow(u, "ADMIN") && c.creator !== u.id ? (
                        <button
                          onClick={() =>
                            p.go(async () => {
                              await api(
                                "/inventory/count/" + c.id + "/approve",
                                {},
                              );
                              await refresh();
                            })
                          }
                        >
                          Approve count
                        </button>
                      ) : (
                        <Badge>Pending approval</Badge>
                      )}
                    </div>
                  ))}
                  <p>Units after reservations, by fulfilment branch.</p>
                  <DataTable label="Branch inventory">
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Piece</th>
                        <th>Branch</th>
                        <th scope="col" className="numeric">
                          Available
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {cat.products
                        .filter(
                          (x) =>
                            allow(u, "SUPER_ADMIN") || x.branch === u.branch,
                        )
                        .map((x) => (
                          <tr key={x.id + x.branch}>
                            <td>{x.sku}</td>
                            <td>{x.name}</td>
                            <td>{x.branch}</td>
                            <td className="numeric">{x.available}</td>
                          </tr>
                        ))}
                    </tbody>
                  </DataTable>
                </div>
              </>
            ) : tab === "Administration" ? (
              <>
                <div className="row wrap">
                  {u.role === "SUPER_ADMIN" && (
                    <>
                      <button
                        onClick={() =>
                          form(
                            "Create staff account",
                            [
                              ["name", "Full name"],
                              ["email", "Work email", "email"],
                              [
                                "password",
                                "Initial password (12+ characters)",
                                "password",
                              ],
                              [
                                "role",
                                "Role",
                                "select",
                                desk.roles.filter(
                                  (r) =>
                                    !["CUSTOMER", "SUPER_ADMIN"].includes(r),
                                ),
                              ],
                              ["branch", "Branch", "select", desk.branches],
                            ],
                            (b) => api("/staff", b),
                          )
                        }
                      >
                        Add staff
                      </button>
                      <button
                        onClick={() =>
                          form(
                            "Create catalogue item",
                            [
                              ["sku", "SKU"],
                              ["name", "Name"],
                              ["category", "Category"],
                              ["finish", "Material / finish"],
                              ["dimensions", "Dimensions with units"],
                              ["price", "Selling price", "number"],
                              ["cost", "Unit cost", "number"],
                              ["warranty", "Warranty terms"],
                            ],
                            (b) => api("/products", b),
                          )
                        }
                      >
                        Add SKU
                      </button>
                      <button
                        onClick={() =>
                          form(
                            "Delivery settings",
                            [
                              [
                                "delivery_prefix",
                                "Serviceable pincode prefix (blank for all)",
                                "text",
                                null,
                                cat.settings.find(
                                  (x) => x.name === "delivery_prefix",
                                )?.val,
                                true,
                              ],
                              ...["delivery_fee", "free_above"].map((k) => [
                                k,
                                label(k),
                                "number",
                                null,
                                cat.settings.find((x) => x.name === k)?.val,
                              ]),
                            ],
                            (b) => api("/settings", b),
                          )
                        }
                      >
                        Delivery settings
                      </button>
                      <button
                        onClick={() =>
                          form(
                            "Shop promotion & services",
                            [
                              [
                                "coupon_code",
                                "Coupon code (blank disables coupon)",
                                "text",
                                null,
                                "",
                                true,
                              ],
                              [
                                "coupon_pct",
                                "Discount percent",
                                "number",
                                null,
                                0,
                              ],
                              [
                                "assembly_fee",
                                "Optional assembly (INR)",
                                "number",
                                null,
                                0,
                              ],
                              [
                                "carry_fee",
                                "Optional floor-carry (INR)",
                                "number",
                                null,
                                0,
                              ],
                              [
                                "store_note",
                                "Showroom announcement",
                                "textarea",
                                null,
                                "",
                                true,
                              ],
                            ],
                            (b) => api("/promotion", b),
                          )
                        }
                      >
                        Promotions & services
                      </button>
                    </>
                  )}
                </div>
                <div className="panel">
                  {u.role === "SUPER_ADMIN" && (
                    <div className="panel">
                      <h3>Showroom email</h3>
                      <p>
                        Order and enquiry alerts use {cat.contact?.email}.
                        Customer updates go to the customer's email address.
                      </p>
                      <button
                        onClick={() =>
                          form(
                            "Connect Gmail for this server session",
                            [
                              [
                                "current",
                                "Current Studio password",
                                "password",
                              ],
                              [
                                "appPassword",
                                "Google App Password",
                                "password",
                              ],
                            ],
                            (b) => api("/admin/email", b),
                            "Verify and connect",
                          )
                        }
                      >
                        Connect Gmail
                      </button>
                      <button
                        onClick={() =>
                          p.go(async () => {
                            await api("/admin/email/verify", {});
                            notify("Gmail SMTP connection verified");
                          })
                        }
                      >
                        Check SMTP connection
                      </button>
                    </div>
                  )}
                  <h3>Team access</h3>
                  <label className="field">
                    Team view
                    <select
                      value={teamArchive ? "deleted" : "current"}
                      onChange={(e) =>
                        setTeamArchive(e.target.value === "deleted")
                      }
                    >
                      <option value="current">Current team</option>
                      <option value="deleted">Deleted accounts</option>
                    </select>
                  </label>
                  <DataTable label="Team access">
                    <thead>
                      <tr>
                        <th>Team member</th>
                        <th>Showroom</th>
                        <th>Role</th>
                        <th>Access</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(desk.team || [])
                        .filter((t) => !!t.archived === teamArchive)
                        .map((t) => (
                          <tr key={t.id}>
                            <td>
                              <b>{t.display_name}</b>
                              <small>{t.email}</small>
                            </td>
                            <td>{t.branch}</td>
                            <td>
                              <Badge>{t.role}</Badge>
                            </td>
                            <td>{t.active ? "Enabled" : "Disabled"}</td>
                            <td>
                              <div className="table-actions">
                                {u.role === "SUPER_ADMIN" &&
                                  !["SUPER_ADMIN", "CUSTOMER"].includes(
                                    t.role,
                                  ) &&
                                  (t.archived ? (
                                    <button
                                      onClick={() =>
                                        p.go(() => manageStaff(t, "restore"))
                                      }
                                    >
                                      Restore
                                    </button>
                                  ) : (
                                    <>
                                      <button
                                        onClick={() =>
                                          form(
                                            "Edit team member",
                                            [
                                              [
                                                "name",
                                                "Full name",
                                                "text",
                                                null,
                                                t.display_name,
                                              ],
                                            ],
                                            (b) =>
                                              api(
                                                "/admin/manage/staff/" + t.id,
                                                {
                                                  action: "edit",
                                                  version: t.auth_version,
                                                  ...b,
                                                },
                                              ),
                                          )
                                        }
                                      >
                                        Edit
                                      </button>
                                      <button
                                        onClick={() =>
                                          M({ kind: "staffAccess", id: t.id })
                                        }
                                      >
                                        Manage roles
                                      </button>
                                      <button
                                        onClick={() =>
                                          p.go(async () => {
                                            await api(
                                              "/staff/" + t.id + "/active",
                                              {
                                                active: !t.active,
                                                version: t.auth_version,
                                              },
                                            );
                                            await refresh();
                                          })
                                        }
                                      >
                                        {t.active ? "Disable" : "Enable"}
                                      </button>
                                      <button
                                        className="delete-link"
                                        onClick={() =>
                                          setRecordDelete({
                                            row: t,
                                            staff: true,
                                          })
                                        }
                                      >
                                        Delete
                                      </button>
                                    </>
                                  ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </DataTable>
                </div>
                {desk.audit && (
                  <div className="panel">
                    <h3>Audit history</h3>
                    <DataTable label="Audit history">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Actor</th>
                          <th>Activity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {desk.audit.map((a) => (
                          <tr key={a.id}>
                            <td>{String(a.created_at).slice(0, 16)}</td>
                            <td>{a.actor || "System"}</td>
                            <td>{a.action}</td>
                          </tr>
                        ))}
                      </tbody>
                    </DataTable>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="tools">
                  <div className="search">
                    <Search size={16} />
                    <input
                      placeholder="Search records…"
                      aria-label="Search records"
                      value={search}
                      onChange={(e) => S(e.target.value)}
                    />
                  </div>
                  <div className="row">
                    {isAdmin && (
                      <select
                        aria-label="Record view"
                        value={archived ? "deleted" : "current"}
                        onChange={(e) =>
                          setArchived(e.target.value === "deleted")
                        }
                      >
                        <option value="current">Current records</option>
                        <option value="deleted">Deleted records</option>
                      </select>
                    )}
                    <select
                      aria-label="Filter status"
                      value={status}
                      onChange={(e) => F(e.target.value)}
                    >
                      {["All", ...new Set(matches.map((w) => w.stage))].map(
                        (s) => (
                          <option key={s} value={s}>
                            {s === "All" ? "All statuses" : label(s)}
                          </option>
                        ),
                      )}
                    </select>
                    {tab === "ORDER" && (
                      <select
                        aria-label="Filter payment status"
                        value={paymentFilter}
                        onChange={(e) => setPaymentFilter(e.target.value)}
                      >
                        <option value="All">All payment statuses</option>
                        {[...new Set(matches.map(orderPaymentLabel))]
                          .sort()
                          .map((value) => (
                            <option key={value}>{value}</option>
                          ))}
                      </select>
                    )}
                    {u.role === "SUPER_ADMIN" && (
                      <select
                        aria-label="Filter branch"
                        value={scope}
                        onChange={(e) => B(e.target.value)}
                      >
                        {["All", ...desk.branches].map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    )}
                    {u.role !== "CUSTOMER" && (
                      <button
                        aria-label="Export displayed records"
                        onClick={() =>
                          csv("studio-records.csv", [
                            [
                              "ID",
                              "Type",
                              "Title",
                              "Stage",
                              "Branch",
                              "Amount",
                            ],
                            ...rows.map((w) => [
                              w.id,
                              w.kind,
                              w.title,
                              w.stage,
                              w.branch,
                              w.amount,
                            ]),
                          ])
                        }
                      >
                        <Download size={16} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="tablewrap responsive-records record-list">
                  <DataTable
                    key={tab}
                    label={typeNames[tab] || "Activity records"}
                    searchable={false}
                    context={[tab, status, scope, search, paymentFilter].join(
                      "|",
                    )}
                  >
                    <thead>
                      <tr>
                        <th>Record</th>
                        <th>Status</th>
                        <th>Customer / branch</th>
                        {tab === "ORDER" && <th>Payment</th>}
                        <th scope="col" className="numeric">
                          Amount
                        </th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((w) => (
                        <tr key={w.id}>
                          <td className="row-title">
                            <button className="link" onClick={() => open(w)}>
                              {w.title}
                            </button>
                            <small>
                              #{w.id} · {label(w.kind)}
                            </small>
                          </td>
                          <td data-label="Status">
                            <Badge>{w.stage}</Badge>
                            {w.enabled === false && <small>Disabled</small>}
                          </td>
                          <td data-label="Customer / branch">
                            {w.customer || w.branch}
                          </td>
                          {tab === "ORDER" && (
                            <td data-label="Payment">{orderPaymentLabel(w)}</td>
                          )}
                          <td className="numeric" data-label="Amount">
                            {Number(w.amount) ? rupee(w.amount) : "—"}
                          </td>
                          <td className={isAdmin ? "row-actions" : "row-open"}>
                            <div className="table-actions">
                              <button
                                className="icon"
                                aria-label={"Open record " + w.id}
                                onClick={() => open(w)}
                              >
                                <ChevronRight size={16} />
                              </button>
                              {isAdmin &&
                                (u.role === "SUPER_ADMIN" ||
                                  w.branch === u.branch) &&
                                (w.archived ? (
                                  <button
                                    onClick={() =>
                                      p.go(() => manageWork(w, "restore"))
                                    }
                                  >
                                    Restore
                                  </button>
                                ) : (
                                  <>
                                    {w.enabled && w.canEdit && (
                                      <button
                                        onClick={() =>
                                          w.kind === "REVIEW"
                                            ? open(w)
                                            : setRecordEdit(w)
                                        }
                                      >
                                        Edit
                                      </button>
                                    )}
                                    {w.canPause && (
                                      <>
                                        <button
                                          onClick={() =>
                                            p.go(() =>
                                              manageWork(
                                                w,
                                                w.enabled
                                                  ? "disable"
                                                  : "enable",
                                              ),
                                            )
                                          }
                                        >
                                          {w.enabled ? "Disable" : "Enable"}
                                        </button>
                                        {w.canDelete && (
                                          <button
                                            className="delete-link"
                                            onClick={() =>
                                              setRecordDelete({ row: w })
                                            }
                                          >
                                            Delete
                                          </button>
                                        )}
                                      </>
                                    )}
                                  </>
                                ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                  {!rows.length && (
                    <div className="empty">
                      <Box />
                      <h3>No records here yet</h3>
                      <p>
                        {tab === "ORDER"
                          ? "Orders appear here after checkout in the collection."
                          : tab === "JOB"
                            ? "Accept a custom quote to create its workshop job."
                            : tab === "RETURN" ||
                                tab === "TICKET" ||
                                tab === "REVIEW"
                              ? "Open an eligible order to start this workflow."
                              : "New activity for this view will appear here."}
                      </p>
                    </div>
                  )}
                </div>
                {tab === "CAMPAIGN" && desk.audience && (
                  <div className="panel">
                    <h3>Consented audience · {u.branch}</h3>
                    {desk.audience.length} eligible contacts{" "}
                    <button
                      onClick={() =>
                        csv("consented-audience.csv", [
                          ["Name", "Email"],
                          ...desk.audience.map((x) => [
                            x.display_name,
                            x.email,
                          ]),
                        ])
                      }
                    >
                      Export audience
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
        {recordEdit && (
          <Modal title="Edit record" close={() => setRecordEdit(null)}>
            <Form
              fields={[
                ["title", "Title", "text", null, recordEdit.title],
                ...(recordEdit.kind === "TRANSFER"
                  ? []
                  : [
                      [
                        "detail",
                        "Details",
                        "textarea",
                        null,
                        recordEdit.detail,
                        true,
                      ],
                    ]),
              ]}
              button="Save changes"
              submit={async (b) => {
                await manageWork(recordEdit, "edit", b);
                setRecordEdit(null);
              }}
            />
          </Modal>
        )}
        {recordDelete && (
          <DeleteRecord
            name={
              recordDelete.staff
                ? recordDelete.row.display_name
                : recordDelete.row.title
            }
            detail={
              recordDelete.staff
                ? "This removes staff access. You can restore the account from Deleted accounts."
                : "This removes the record from active lists. You can restore it from Deleted records."
            }
            close={() => setRecordDelete(null)}
            submit={() =>
              recordDelete.staff
                ? manageStaff(recordDelete.row, "delete")
                : manageWork(recordDelete.row, "delete")
            }
          />
        )}
      </section>
    </div>
  );
}
export function RecordDetail({
  buyAgain,
  id,
  u,
  desk,
  refresh,
  close,
  M,
  notify,
  items,
}) {
  let [data, D] = useState(null),
    [error, E] = useState(""),
    [act, A] = useState(""),
    [busy, G] = useState(false);
  async function load() {
    D(await api("/work/" + id));
  }
  useEffect(() => {
    load().catch((e) => E(e.message));
  }, [id]);
  if (!data)
    return (
      <Modal title={"Record #" + id} close={close}>
        <p>{error || "Loading…"}</p>
      </Modal>
    );
  let w = data.record,
    k = w.kind,
    r = u.role,
    delivered = ["DELIVERED", "INSTALLED"].includes(w.stage),
    path = "/work/" + id,
    fields = [],
    endpoint = path,
    inject = {},
    next = data.actions.includes(act);
  let options = [...data.actions];
  if (
    k === "JOB" &&
    ["PLANNED", "AWAITING_ADVANCE"].includes(w.stage) &&
    allow(u, "PRODUCTION", "ADMIN")
  )
    options.push("Plan BOM");
  if (k === "LEAD" && w.stage === "MEASURED" && allow(u, "SALES", "ADMIN"))
    options.push("Cost estimate");
  if (data.estimate?.some((e) => !e.approved) && allow(u, "ADMIN"))
    options.push("Approve discount");
  if (
    k === "ORDER" &&
    w.stage === "PACKED" &&
    allow(u, "WAREHOUSE", "DELIVERY", "ADMIN")
  )
    options.push("Ship order line");
  if (
    k === "ORDER" &&
    allow(u, "CASHIER", "ACCOUNTANT", "ADMIN") &&
    Number(data.due) > 0 &&
    w.stage !== "CANCELLED"
  )
    options.push("Record collection");
  if (k === "ORDER" && allow(u, "CUSTOMER", "SUPPORT", "ADMIN")) {
    options.push("Open ticket");
    if (delivered) {
      options.push("Request return");
      if (r !== "CUSTOMER" || !data.items.some((i) => i.product_id))
        options.push("Write review");
    }
  }
  if (k === "LEAD" && w.stage === "QUOTED" && allow(u, "ADMIN", "SALES"))
    options.push("Revise quote");
  if (k === "JOB" && w.stage === "PLANNED" && allow(u, "ADMIN", "PRODUCTION"))
    options.push("Issue materials");
  if (allow(u, "ADMIN", "SALES", "SUPPORT", "PRODUCTION"))
    options.push("Schedule");
  options.push("Add note");
  if (next) {
    endpoint += "/move";
    inject = { to: act, revision: w.revision };
    fields = [
      [
        "note",
        "Action note / evidence",
        "textarea",
        null,
        "",
        ![
          "MEASURED",
          "QUOTED",
          "LOST",
          "REWORK",
          "DECLINED",
          "REFUND_APPROVED",
          "MATCHED",
          "INSTALLED",
          "DELIVERED",
          "RESOLVED",
        ].includes(act),
      ],
    ];
    if (act === "QUOTED")
      fields.push(["amount", "Quoted total (INR)", "number"]);
    if (k === "PURCHASE" && act === "RECEIVED")
      fields.push(
        ["qty", "QC accepted quantity", "number"],
        ["lot", "Supplier lot / batch"],
        ["bin", "Storage bin"],
      );
    if (act === "MATCHED")
      fields.push(["invoiceAmount", "Supplier invoice total (INR)", "number"]);
    if (act === "REFUNDED") fields.push(["ref", "Settlement reference"]);
    if (act === "REFUND_APPROVED")
      fields.push([
        "restock",
        "Inspection outcome",
        "select",
        [
          ["no", "Damaged / quarantine"],
          ["yes", "Saleable — return to stock"],
        ],
      ]);
  } else if (act === "Plan BOM") {
    endpoint += "/bom";
    fields = [
      [
        "productId",
        "Material / component",
        "select",
        items.map((p) => [p.id, p.name]),
      ],
      ["qty", "Required units", "number"],
    ];
  } else if (act === "Cost estimate") {
    endpoint += "/estimate";
    fields = ["materials", "labour", "freight", "discount"].map((k) => [
      k,
      label(k) + " (INR)",
      "number",
      null,
      0,
    ]);
  } else if (act === "Approve discount") {
    endpoint += "/discount";
    fields = [];
  } else if (act === "Ship order line") {
    endpoint += "/ship";
    fields = [
      [
        "lineId",
        "Packed item",
        "select",
        data.items
          .filter((i) => i.shipped < i.qty)
          .map((i) => [
            i.id,
            i.name + " · " + (i.qty - i.shipped) + " remaining",
          ]),
      ],
      ["qty", "Units in shipment", "number"],
      ["ref", "Carrier / dispatch reference"],
    ];
  } else if (act === "Record collection") {
    endpoint += "/collect";
    fields = [
      ["amount", "Amount actually received", "number"],
      ["ref", "Unique payment / receipt reference"],
    ];
  } else if (["Open ticket", "Request return", "Write review"].includes(act)) {
    endpoint = "/work";
    inject = {
      kind: {
        "Open ticket": "TICKET",
        "Request return": "RETURN",
        "Write review": "REVIEW",
      }[act],
      parentId: id,
    };
    fields = [
      ["title", "Subject"],
      ["detail", "Details", "textarea"],
    ];
    if (act === "Request return")
      fields.push(
        [
          "lineId",
          "Order line",
          "select",
          data.items.map((i) => [
            i.id,
            i.name + " · " + (i.qty - i.returned_qty) + " eligible",
          ]),
        ],
        ["qty", "Quantity", "number"],
      );
  } else if (act === "Revise quote") {
    endpoint += "/revise";
    fields = [
      ["amount", "New quoted total", "number"],
      ["note", "Revision details", "textarea"],
    ];
  } else if (act === "Issue materials") {
    endpoint += "/materials";
    fields = [
      [
        "productId",
        "Inventory item",
        "select",
        items.map((p) => [p.id, p.name]),
      ],
      ["qty", "Units to issue", "number"],
    ];
  } else if (act === "Schedule") {
    endpoint += "/schedule";
    fields = [["due", "Due date", "date"]];
    if (desk.team)
      fields.push([
        "assignee",
        "Assign staff (optional)",
        "select",
        desk.team
          .filter((x) => x.branch === w.branch && x.active)
          .map((x) => [x.id, x.display_name + " · " + label(x.role)]),
        null,
        true,
      ]);
  } else {
    endpoint += "/note";
    fields = [["note", "Shared timeline note", "textarea"]];
  }
  return (
    <Modal wide title={w.title} close={close}>
      <div className="recordmeta">
        <span>
          #{id} · {label(k)} · {w.branch}
        </span>
        <Badge>{w.stage}</Badge>
      </div>
      <p className="desc">{w.detail}</p>
      {data.deliveryFit?.length > 0 && (
        <section className="panel">
          <h3>Delivery access</h3>
          {data.deliveryFit.map((f) => (
            <div key={f.sku}>
              <strong>{fitLabel(f.verdict)}</strong>
              <p>{f.summary}</p>
            </div>
          ))}
        </section>
      )}
      {k === "REVIEW" && allow(u, "ADMIN") && (
        <ReviewModeration
          data={data}
          reload={load}
          refresh={refresh}
          notify={notify}
        />
      )}
      {k === "ORDER" && r === "CUSTOMER" && (
        <p>
          <a href={"/track-order?order=" + w.id}>Track this order</a>
        </p>
      )}
      {k === "ORDER" && r === "CUSTOMER" && delivered && (
        <div className="row wrap">
          {data.items
            .filter((i) => i.product_id)
            .map((i) => (
              <button
                key={i.id}
                onClick={() =>
                  M({
                    kind: "reviewProduct",
                    product: {
                      id: i.product_id,
                      name: i.name,
                      branch: w.branch,
                    },
                  })
                }
              >
                Review {i.name}
              </button>
            ))}
        </div>
      )}
      {(k === "ORDER" ||
        (k === "LEAD" && ["QUOTED", "ACCEPTED"].includes(w.stage))) && (
        <p>
          <a
            href={"/api" + path + "/document"}
            target="_blank"
            rel="noreferrer"
          >
            {k === "LEAD"
              ? "Open printable quotation"
              : ["DELIVERED", "INSTALLED"].includes(w.stage)
                ? "Open printable invoice"
                : "Open printable order confirmation"}
          </a>
        </p>
      )}
      <div className="facts">
        <div>
          <small>Amount</small>
          <b>{rupee(w.amount)}</b>
        </div>
        {k === "ORDER" && (
          <>
            <div>
              <small>Collected (net)</small>
              <b>{rupee(data.paid)}</b>
            </div>
            <div>
              <small>Outstanding</small>
              <b>{rupee(data.due)}</b>
            </div>
          </>
        )}
        <div>
          <small>Revision</small>
          <b>{w.revision}</b>
        </div>
      </div>
      {k === "ORDER" && (
        <OrderPayment data={data} user={u} load={load} notify={notify} />
      )}
      {w.kind === "LEAD" && (
        <p>
          Source: {w.source} · Budget: {rupee(w.budget)} · Target: {w.buy_days}{" "}
          days
          {w.valid_until
            ? " · Quote valid to " + String(w.valid_until).slice(0, 10)
            : ""}
          {r !== "CUSTOMER" &&
            " · Priority: " +
              (w.buy_days <= 30 && w.budget > 0
                ? "High"
                : w.buy_days <= 60
                  ? "Medium"
                  : "Standard")}
        </p>
      )}
      {data.booking?.map((v, i) => (
        <p key={i}>
          Delivery window: {String(v.starts).replace("T", " ").slice(0, 16)} –{" "}
          {String(v.ends).slice(11, 16)} · {v.active ? "Reserved" : "Released"}
        </p>
      ))}
      {w.due_date && <p>Due {String(w.due_date).slice(0, 10)}</p>}
      {w.parent_id && <p>Source record #{w.parent_id}</p>}
      {k === "ORDER" &&
        u.role === "CUSTOMER" &&
        data.items.some((x) => x.product_id) && (
          <button onClick={() => buyAgain(data.items)}>
            Buy these items again
          </button>
        )}
      {data.items.length > 0 && (
        <div className="tablewrap">
          <DataTable label="Order items">
            <thead>
              <tr>
                <th>Item</th>
                <th scope="col" className="numeric">
                  Qty
                </th>
                <th scope="col" className="numeric">
                  Unit value
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((i) => (
                <tr key={i.id}>
                  <td>{i.name}</td>
                  <td className="numeric">
                    {i.qty}
                    {k === "PURCHASE" ? " (" + i.received + " received)" : ""}
                  </td>
                  <td className="numeric">{rupee(i.price)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      )}
      {data.bom?.length > 0 && (
        <div className="panel">
          <h3>Material requirements</h3>
          {data.bom.map((b, i) => (
            <p key={i}>
              {b.name} · {b.issued}/{b.required_qty} issued ·{" "}
              {Math.max(0, b.required_qty - b.issued - b.available)} units short
            </p>
          ))}
        </div>
      )}
      {data.estimate?.map((e) => (
        <p key={e.work_id}>
          Costed quote: {rupee(e.materials + e.labour + e.freight - e.discount)}{" "}
          · {e.approved ? "Approved" : "Approval required"}
        </p>
      ))}
      {data.links.map((l) => (
        <button
          className="listlink"
          key={l.id}
          onClick={() => M({ kind: "record", id: l.id })}
        >
          {l.title}
          <span>#{l.id} →</span>
        </button>
      ))}
      {data.payments.map((p, i) => (
        <p key={i}>
          Receipt {p.ref} · {rupee(p.amount)}
        </p>
      ))}
      <div className="panel noprint">
        <h3>Workflow action</h3>
        <select
          aria-label="Workflow action"
          value={act}
          onChange={(e) => A(e.target.value)}
        >
          <option value="">Choose an action…</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {label(o)}
            </option>
          ))}
        </select>
        {act && (
          <Form
            key={act}
            fields={fields}
            button={"Confirm " + label(act)}
            submit={async (b) => {
              let res = await api(endpoint, {
                ...b,
                ...inject,
                restock: b.restock === "yes",
              });
              await refresh();
              if (res?.id) M({ kind: "record", id: res.id });
              else {
                await load();
                A("");
              }
              notify("Workflow updated");
            }}
          />
        )}
      </div>
      <div className="panel">
        <h3>Documents & photos</h3>
        {data.files.map((f) => (
          <p key={f.id}>
            <a href={"/api/files/" + f.id}>{f.name}</a>
          </p>
        ))}
        <label className="field noprint">
          Attach JPG or PNG (up to 5 MB)
          <input
            type="file"
            disabled={busy}
            accept="image/png,image/jpeg"
            onChange={async (e) => {
              if (!e.target.files[0]) return;
              G(true);
              E("");
              try {
                let f = new FormData();
                f.append("file", e.target.files[0]);
                await api(path + "/files", f);
                await load();
              } catch (x) {
                E(x.message);
              } finally {
                G(false);
              }
            }}
          />
        </label>
      </div>
      <details open>
        <summary>Activity timeline</summary>
        {data.events.map((e, i) => (
          <div className="event" key={i}>
            <div>{e.action}</div>
            <small>
              {e.actor} · {String(e.created_at).replace("T", " ").slice(0, 16)}
            </small>
          </div>
        ))}
      </details>
      {error && <p className="error">{error}</p>}
      <button className="noprint" onClick={() => window.print()}>
        <Printer size={16} /> Print record
      </button>
    </Modal>
  );
}
