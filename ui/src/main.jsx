import React, { useState, useEffect } from "react";
import { DataTable } from "./DataTable";
import { createRoot } from "react-dom/client";
import {
  Armchair,
  ShoppingBag,
  LayoutDashboard,
  UserRound,
  ArrowUpRight,
  LogOut,
  Heart,
  SlidersHorizontal,
  Plus,
  ArrowRight,
  Search,
  MapPin,
  Ruler,
  Minus,
  Box,
  Menu,
} from "lucide-react";
import { api, rupee, label, allow, Modal, Form } from "./lib";
import { Workspace, RecordDetail } from "./workspace";
import { RazorpayTest } from "./RetailTools";
import { Checkout, CustomerProfile } from "./Purchase";
import { Login, EmailEnrollment } from "./AccountAccess";
import { ProductZoom } from "./ProductZoom";
import { openPurchasePayment } from "./RetailTools";
import { DeliveryFit, RoomBundles } from "./FurnitureTools";
import { Planner } from "./Planner";
import {
  Appearance,
  PageBody,
  Discover,
  Modules,
  ProductExtras,
  isOn,
  readRecent,
  remember,
} from "./Experience";
import "./style.css";
import "./studio.css";
import "./purchase.css";
import { StaffGrants } from "./BackOffice";
import { Reviews, OrderTracker, RolePicker, searchText } from "./Customers";
import "./catalog.css";
import "./layout.css";
import "./account.css";
import "./storefront.css";
function alternatePieces(pieces, keyOf) {
  const counts = new Map(),
    rounds = [];
  for (const piece of pieces) {
    const key = keyOf(piece),
      index = counts.get(key) || 0;
    (rounds[index] ??= []).push(piece);
    counts.set(key, index + 1);
  }
  return rounds.flat();
}
function App() {
  const [u, U] = useState(null),
    [desk, D] = useState({ work: [], wishlist: [], team: [] }),
    [cat, C] = useState({ products: [], settings: [], reviews: [] }),
    [page, P] = useState(() =>
      location.pathname === "/track-order"
        ? "tracking"
        : location.pathname === "/razorpay-test"
          ? "test"
          : location.pathname === "/profile"
            ? "profile"
            : new URLSearchParams(location.search).has("page")
              ? "custom"
              : "shop",
    ),
    [expires, setExpires] = useState(null),
    [recent, setRecent] = useState(readRecent),
    [modal, M] = useState(null),
    [msg, N] = useState(""),
    [error, E] = useState(""),
    [branch, B] = useState("Central"),
    [search, S] = useState(""),
    [category, K] = useState("All"),
    [resultPage, setResultPage] = useState(1),
    [inStock, setInStock] = useState(false),
    [maxPrice, MP] = useState(""),
    [maxWidth, MW] = useState(""),
    [sort, T] = useState("Featured"),
    [saved, H] = useState(false),
    [cart, A] = useState(() => {
      try {
        return JSON.parse(sessionStorage.cart || "{}");
      } catch {
        return {};
      }
    }),
    [compare, Q] = useState([]),
    [coupon, CP] = useState(""),
    [assembly, AS] = useState(false),
    [carry, CA] = useState(false),
    [requestKey, RK] = useState(
      () => sessionStorage.basketCheckoutKey || crypto.randomUUID(),
    ),
    [boot, L] = useState(false);
  const showroomUser = React.useRef(null);
  async function refresh() {
    let [session, c] = await Promise.all([api("/session"), api("/catalog")]);
    let d = session.user ? await api("/desk") : { work: [], wishlist: [] };
    U(session.user);
    setExpires(session.expiresAt || null);
    C(c);
    D(d);
    if (
      session.user &&
      (showroomUser.current !== session.user.id ||
        !["CUSTOMER", "SUPER_ADMIN"].includes(session.user.role))
    )
      B(session.user.branch);
    showroomUser.current = session.user?.id ?? null;
    L(true);
  }
  useEffect(() => {
    refresh().catch((e) => E(e.message));
  }, []);
  useEffect(() => {
    if (!expires) return;
    const signInAgain = () => {
      U(null);
      setExpires(null);
      D({ work: [], wishlist: [] });
      M({ kind: "auth" });
      N("Your sign-in expired. Sign in to continue.");
      api("/session").catch(() => {});
    };
    const timer = setTimeout(signInAgain, Math.max(0, expires - Date.now()));
    window.addEventListener("studio-signin-expired", signInAgain);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("studio-signin-expired", signInAgain);
    };
  }, [expires]);
  useEffect(() => {
    sessionStorage.cart = JSON.stringify(cart);
    sessionStorage.basketCheckoutKey = requestKey;
  }, [cart, requestKey]);
  useEffect(() => {
    if (!msg) return;
    let t = setTimeout(() => N(""), 3500);
    return () => clearTimeout(t);
  }, [msg]);
  const close = () => M(null),
    notify = N;
  async function go(fn) {
    try {
      await fn();
    } catch (e) {
      N(e.message);
    }
  }
  function auth(action) {
    if (!u) {
      M({ kind: "auth", after: action });
      return;
    }
    action();
  }
  const words = searchText(search).split(" ").filter(Boolean);
  useEffect(
    () => setResultPage(1),
    [branch, search, category, maxPrice, maxWidth, sort, saved, inStock],
  );
  let items = cat.products.filter((p) => p.branch === branch),
    shown = items.filter(
      (p) =>
        (!maxPrice || p.price <= Number(maxPrice)) &&
        (!maxWidth || parseFloat(p.dimensions) <= Number(maxWidth)) &&
        (category === "All" || p.category === category) &&
        (!saved || desk.wishlist?.some((x) => x.product_id === p.id)) &&
        (!inStock || p.available > 0) &&
        words.every((word) =>
          searchText(
            [p.sku, p.name, p.finish, p.category, p.dimensions].join(" "),
          ).includes(word),
        ),
    );
  if (sort === "Featured")
    shown = alternatePieces(
      alternatePieces(shown, (p) => p.variant_family || p.sku),
      (p) => p.photo,
    );
  if (sort === "Price: low first") shown.sort((a, b) => a.price - b.price);
  if (sort === "Price: high first") shown.sort((a, b) => b.price - a.price);
  if (sort === "Name: A–Z") shown.sort((a, b) => a.name.localeCompare(b.name));
  const perPage = 5,
    pages = Math.max(1, Math.ceil(shown.length / perPage)),
    currentPage = Math.min(resultPage, pages);
  const movePage = (n) => {
    setResultPage(n);
    document
      .getElementById("home-products")
      ?.scrollTo({ left: 0, behavior: "instant" });
    document.getElementById("collection")?.scrollIntoView({ block: "start" });
  };
  let cartItems = items.filter((x) => cart[x.id] > 0),
    count = cartItems.reduce((n, x) => n + cart[x.id], 0),
    sub = cartItems.reduce((n, p) => n + p.price * cart[p.id], 0),
    conf = Object.fromEntries(cat.settings.map((s) => [s.name, s.val])),
    discount =
      coupon &&
      coupon.toUpperCase() === String(conf.coupon_code || "").toUpperCase()
        ? Number(conf.coupon_pct)
        : 0,
    net = cartItems.reduce(
      (n, p) => n + (Math.round(p.price * (100 - discount)) / 100) * cart[p.id],
      0,
    ),
    fee = net >= Number(conf.free_above) ? 0 : Number(conf.delivery_fee || 0),
    grand =
      net +
      fee +
      (assembly ? Number(conf.assembly_fee || 0) : 0) +
      (carry ? Number(conf.carry_fee || 0) : 0);
  function add(p, n = 1) {
    let next = Math.max(0, (cart[p.id] || 0) + n);
    if (next > p.available) {
      N("Only " + p.available + " available at this branch");
      return;
    }
    A({ ...cart, [p.id]: next });
    if (n > 0) N("Added to your bag");
  }
  async function addRoomSet(selection) {
    const current = await api("/catalog");
    C(current);
    const next = { ...cart };
    for (const { product, qty } of selection) {
      const listing = current.products.find(
        (p) => p.id === product.id && p.branch === branch,
      );
      if (!listing || listing.available < (next[product.id] || 0) + qty)
        throw Error("Stock changed. Choose an available set.");
      if (Number(listing.price) !== Number(product.price))
        throw Error("A price changed. Review the new set total before adding.");
      next[product.id] = (next[product.id] || 0) + qty;
    }
    RK(crypto.randomUUID());
    A(next);
  }
  function quote(p) {
    auth(() =>
      M({
        kind: "form",
        title: "Request a custom quote",
        fields: [
          ["title", "Piece or project", "text", null, p?.name || ""],
          ["budget", "Budget in INR (optional)", "number", null, "", true],
          [
            "buyDays",
            "Purchase timeline",
            "select",
            [
              [7, "This week"],
              [30, "This month"],
              [90, "Exploring"],
            ],
            "30",
          ],
          [
            "detail",
            "Dimensions, finish, budget and contact details",
            "textarea",
          ],
        ],
        submit: async (b) => {
          let r = await api("/work", { ...b, branch, kind: "LEAD" });
          await refresh();
          M({ kind: "record", id: r.id });
        },
      }),
    );
  }
  function bag() {
    M({ kind: "bag" });
  }
  function workspace() {
    auth(() => {
      if (location.pathname !== "/") history.replaceState(null, "", "/");
      P("desk");
      close();
    });
  }
  const exp = cat.experience,
    params = new URLSearchParams(location.search),
    slug = params.get("page"),
    customPage = exp?.pages.find((x) => x.slug === slug);
  function home() {
    history.replaceState(null, "", "/");
    P("shop");
    close();
  }
  function openProduct(p) {
    setRecent(remember(p.id));
    M({ kind: "product", p });
  }
  const deepLink = React.useRef(false);
  useEffect(() => {
    if (!boot || deepLink.current) return;
    deepLink.current = true;
    let routed =
      cat.experience?.pages.find((x) => x.slug === slug)?.branch ||
      params.get("branch");
    let target =
      (!u || allow(u, "CUSTOMER")) && ["Central", "North"].includes(routed)
        ? routed
        : branch;
    if (target !== branch) B(target);
    const product = cat.products.find(
      (x) => x.sku === params.get("sku") && x.branch === target,
    );
    if (product && isOn(cat.experience, "SHARE")) {
      if (params.get("tool") === "delivery-fit")
        M({ kind: "product", p: product, fitDraft: {} });
      else openProduct(product);
    } else if (params.get("tool") === "room-budget") M({ kind: "roomBundles" });
  }, [boot]);
  function action(a) {
    if (a === "planner") M({ kind: "planner" });
    else if (a === "quote") quote();
    else if (a === "contact") location.href = "mailto:" + cat.contact.email;
    else home();
  }
  function buyAgain(lines) {
    const next = { ...cart };
    let added = 0;
    for (const line of lines) {
      const p = items.find((x) => x.id === line.product_id);
      if (!p) continue;
      let n = Math.max(0, Math.min(line.qty, p.available - (next[p.id] || 0)));
      if (n) {
        next[p.id] = (next[p.id] || 0) + n;
        added += n;
      }
    }
    if (!added) {
      N("These items are unavailable at this showroom");
      return;
    }
    A(next);
    M({ kind: "bag" });
    N(added + " available units added at current prices");
  }
  const shared = {
    u,
    desk,
    cat,
    branch,
    refresh,
    M,
    close,
    notify,
    go,
    items,
    buyAgain,
  };
  return (
    <>
      <header className="top">
        <button className="brand" onClick={home}>
          <span className="logo">
            <Armchair size={23} />
          </span>
          <span>
            APSP <strong>Studio</strong>
          </span>
        </button>
        <nav>
          <button className={page === "shop" ? "current" : ""} onClick={home}>
            Collection
          </button>
          <button
            className={page === "desk" ? "current" : ""}
            disabled={!boot}
            onClick={workspace}
          >
            {u?.role === "CUSTOMER" ? "My activity" : "Workspace"}
          </button>
          {exp?.pages?.length > 0 && (
            <button
              className={page === "custom" ? "current" : ""}
              onClick={() => M({ kind: "directory" })}
            >
              Studio pages
            </button>
          )}
        </nav>
        <div className="right">
          <button
            className="quiet account"
            disabled={!boot}
            onClick={() => {
              if (u?.role === "CUSTOMER" && page !== "profile")
                location.assign("/profile");
              else M({ kind: u ? "account" : "auth" });
            }}
          >
            <UserRound size={16} />
            {u?.display_name || "Sign in"}
          </button>
          <button
            className="bag"
            aria-label={"Shopping bag (" + count + ")"}
            onClick={bag}
          >
            <ShoppingBag size={17} />
            <span>{count}</span>
          </button>
        </div>
      </header>
      {error ? (
        <main>
          <p className="error">{error}</p>
          <button onClick={() => location.reload()}>Retry</button>
        </main>
      ) : !boot ? (
        <main>Opening studio…</main>
      ) : page === "tracking" ? (
        <OrderTracker
          user={u}
          work={desk.work}
          signIn={() => M({ kind: "auth" })}
        />
      ) : page === "profile" ? (
        u?.role === "CUSTOMER" ? (
          <CustomerProfile
            user={u}
            desk={desk}
            expires={expires}
            refresh={refresh}
            notify={notify}
            onShowroom={B}
            collection={() => {
              H(false);
              home();
            }}
            showSaved={() => {
              S("");
              K("All");
              MP("");
              MW("");
              setInStock(false);
              H(true);
              home();
              requestAnimationFrame(() =>
                document.getElementById("collection")?.scrollIntoView(),
              );
            }}
            open={(id) => M({ kind: "record", id })}
            security={() => M({ kind: "account" })}
          />
        ) : (
          <main>
            <section className="panel editor">
              <h1>Customer profile</h1>
              {u ? (
                <p>Use Workspace to manage your staff account.</p>
              ) : (
                <button className="primary" onClick={() => M({ kind: "auth" })}>
                  Sign in to your profile
                </button>
              )}
            </section>
          </main>
        )
      ) : page === "test" ? (
        <main className="test-page">
          <h1>Payment testing</h1>
          {u?.role === "SUPER_ADMIN" ? (
            <RazorpayTest notify={notify} />
          ) : (
            <section className="panel editor">
              <h2>Razorpay test checkout</h2>
              <p>
                Sign in with the Super Admin account to run a simulated ₹100
                payment and view its receipt.
              </p>
              {!u && (
                <button className="primary" onClick={() => M({ kind: "auth" })}>
                  Sign in to test payments
                </button>
              )}
            </section>
          )}
        </main>
      ) : page === "desk" && u ? (
        <Workspace key={u.role + "-" + u.branch} {...shared} />
      ) : page === "custom" ? (
        <main>
          {customPage ? (
            <PageBody
              title={customPage.title}
              blocks={JSON.parse(customPage.blocks)}
              items={items}
              open={openProduct}
              action={action}
              contact={cat.contact}
            />
          ) : (
            <section className="panel">
              <h1>Page unavailable</h1>
              <button onClick={home}>Browse collection</button>
            </section>
          )}
        </main>
      ) : (
        <main>
          <section className="hero">
            <img
              src="/images/room.jpg"
              alt="A furnished living room with warm wood and natural light"
            />
            <div className="hero-copy">
              <h1>
                Furniture for
                <br />
                <i>your space.</i>
              </h1>
              <p>
                Explore the collection or commission a piece made to your
                measurements.
              </p>
              <div className="row">
                <a className="lightbtn" href="#collection">
                  Shop collection <ArrowRight size={16} />
                </a>
                <button className="herolink" onClick={() => quote()}>
                  Custom enquiry <ArrowUpRight size={15} />
                </button>
              </div>
            </div>
          </section>
          <div className="room-nav" aria-label="Browse by collection">
            {[...new Set(items.map((p) => p.category))]
              .slice(0, 4)
              .map((c) => items.find((p) => p.category === c))
              .map((p) => (
                <button
                  key={p.category}
                  onClick={() => {
                    K(p.category);
                    document.getElementById("collection")?.scrollIntoView();
                  }}
                >
                  <img src={p.photo} alt="" />
                  <b>{p.category}</b>
                  <ArrowUpRight size={14} />
                </button>
              ))}
          </div>
          {conf.store_note && <div className="panel">{conf.store_note}</div>}
          <section id="collection">
            <header className="collection-heading">
              <h2>Furniture collection</h2>
              <div className="collection-actions">
                <button onClick={() => M({ kind: "planner" })}>
                  <Ruler size={16} />
                  Plan a room layout
                </button>
                <button onClick={() => M({ kind: "roomBundles" })}>
                  <Armchair size={16} />
                  Build a room within budget
                </button>
              </div>
            </header>
            <div className="catalog-searchbar">
              {" "}
              <div className="search">
                <Search size={15} />
                <input
                  aria-label="Search catalogue"
                  placeholder="Search products, SKU or finish"
                  value={search}
                  onChange={(e) => S(e.target.value)}
                />
              </div>
              <label className="location">
                <MapPin size={16} aria-hidden="true" />
                <span>Showroom</span>
                <select
                  aria-label="Showroom branch"
                  value={branch}
                  disabled={u && !allow(u, "CUSTOMER")}
                  onChange={(e) => B(e.target.value)}
                >
                  <option>Central</option>
                  <option>North</option>
                </select>
              </label>
              <select
                aria-label="Sort collection"
                value={sort}
                onChange={(e) => T(e.target.value)}
              >
                {[
                  "Featured",
                  "Price: low first",
                  "Price: high first",
                  "Name: A–Z",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              <button
                aria-label="Show wishlist"
                aria-pressed={saved}
                className={"icon " + (saved ? "on" : "")}
                onClick={() => auth(() => H(!saved))}
              >
                <Heart size={16} />
              </button>
            </div>
            <div className="chips" role="group" aria-label="Product categories">
              {["All", ...new Set(items.map((p) => p.category))].map((x) => (
                <button
                  key={x}
                  aria-pressed={category === x}
                  className={category === x ? "selected" : ""}
                  onClick={() => K(x)}
                >
                  {x}
                </button>
              ))}
            </div>

            <div className="collection-refinements">
              {" "}
              <details className="size-filters">
                <summary>Size & budget filters</summary>
                <div className="row wrap">
                  <label className="field">
                    Max width (cm)
                    <input
                      type="number"
                      min="1"
                      value={maxWidth}
                      onChange={(e) => MW(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    Max price (INR)
                    <input
                      type="number"
                      min="1"
                      value={maxPrice}
                      onChange={(e) => MP(e.target.value)}
                    />
                  </label>
                </div>
              </details>
              <div className="catalog-results">
                <span aria-live="polite">
                  {shown.length} {shown.length === 1 ? "piece" : "pieces"}
                  {category !== "All" ? " in " + category : ""} · {branch}
                </span>
                <label>
                  <input
                    type="checkbox"
                    checked={inStock}
                    onChange={(e) => setInStock(e.target.checked)}
                  />{" "}
                  In stock only
                </label>
              </div>
            </div>
            {compare.length > 0 && (
              <p>
                <button onClick={() => M({ kind: "compare" })}>
                  Compare selected ({compare.length})
                </button>
              </p>
            )}
            <div
              className="grid home-products"
              id="home-products"
              key={[
                currentPage,
                branch,
                category,
                search,
                sort,
                saved,
                inStock,
                maxPrice,
                maxWidth,
              ].join("|")}
              role="region"
              aria-label="Five products per page"
              tabIndex={0}
            >
              {shown
                .slice((currentPage - 1) * perPage, currentPage * perPage)
                .map((p) => (
                  <article className="card" key={p.id}>
                    <div className="photo">
                      <button
                        className="imagebtn"
                        onClick={() => openProduct(p)}
                      >
                        <img loading="lazy" src={p.photo} alt={p.name} />
                      </button>
                      <button
                        className="fav"
                        aria-label={"Save " + p.name}
                        onClick={() =>
                          auth(() =>
                            go(async () => {
                              await api("/wishlist/" + p.id, {});
                              await refresh();
                            }),
                          )
                        }
                      >
                        <Heart
                          size={16}
                          fill={
                            desk.wishlist?.some((x) => x.product_id === p.id)
                              ? "currentColor"
                              : "none"
                          }
                        />
                      </button>
                    </div>
                    <div className="cardbody">
                      <h3>
                        <button
                          aria-label={p.name}
                          onClick={() => openProduct(p)}
                        >
                          {p.variant_family &&
                          p.name === p.variant_family + " · " + p.finish
                            ? p.variant_family
                            : p.name}
                        </button>
                      </h3>
                      <small>
                        {p.category} · {p.finish}
                      </small>
                      <div className="between">
                        <b>{rupee(p.price)}</b>
                        <button
                          className="round"
                          aria-label={"Add " + p.name}
                          onClick={() => add(p)}
                        >
                          <Plus size={17} />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
            </div>
            {pages > 1 && (
              <nav className="catalog-pager" aria-label="Catalogue pages">
                <button
                  disabled={currentPage === 1}
                  onClick={() => movePage(currentPage - 1)}
                >
                  Previous
                </button>
                <label>
                  Page{" "}
                  <select
                    aria-label="Catalogue page"
                    value={currentPage}
                    onChange={(e) => movePage(Number(e.target.value))}
                  >
                    {Array.from({ length: pages }, (_, i) => (
                      <option key={i} value={i + 1}>
                        {i + 1}
                      </option>
                    ))}
                  </select>{" "}
                  of {pages}
                </label>
                <button
                  disabled={currentPage === pages}
                  onClick={() => movePage(currentPage + 1)}
                >
                  Next
                </button>
              </nav>
            )}
            {!shown.length && (
              <div className="empty">
                No pieces match these filters.{" "}
                <button
                  onClick={() => {
                    K("All");
                    S("");
                    MP("");
                    MW("");
                    H(false);
                    setInStock(false);
                  }}
                >
                  Clear filters
                </button>
              </div>
            )}
          </section>
          <Modules
            experience={exp}
            items={items}
            open={openProduct}
            {...shared}
            auth={auth}
          />
          {cat.reviews.length > 0 && (
            <section>
              <h2>Customer reviews</h2>
              {cat.reviews.map((r, i) => (
                <p key={i}>
                  <b>{r.title}</b> · {r.detail}
                </p>
              ))}
            </section>
          )}
        </main>
      )}
      {boot && page !== "desk" && cat.contact && (
        <footer className="store-footer">
          <div className="footer-main">
            <div className="footer-brand">
              <a href="/">
                <span className="logo">
                  <Armchair size={23} />
                </span>
                APSP <strong>Studio</strong>
              </a>
              <span>Furniture showroom · Central &amp; North</span>
            </div>
            <nav aria-label="Shop links">
              <h2>Explore</h2>
              <a href="/#collection">Furniture collection</a>
              <a href="/?tool=room-budget">Build a room</a>
              {isOn(cat.experience, "DISCOVERY") && (
                <button onClick={() => M({ kind: "discover" })}>
                  Popular &amp; recently viewed
                </button>
              )}
            </nav>
            <nav aria-label="Customer links">
              <h2>Your account</h2>
              <a href="/profile">Customer profile</a>
              <a href="/track-order">Track an order</a>
            </nav>
            <div className="footer-contact">
              <h2>Contact the showroom</h2>
              <a href={"mailto:" + cat.contact.email}>
                Email · {cat.contact.email}
              </a>
              <a
                href={cat.contact.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Chat on WhatsApp · {cat.contact.whatsapp}
              </a>
            </div>
          </div>
          <div className="footer-base">
            <small>© {new Date().getFullYear()} APSP Furniture Studio</small>
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            >
              Back to top ↑
            </button>
          </div>
        </footer>
      )}
      {modal?.kind === "discover" && (
        <Modal title="Popular & recently viewed" close={close}>
          <Discover
            exp={exp}
            items={items}
            branch={branch}
            open={openProduct}
            recent={recent}
          />
          {!recent.length &&
            !exp?.trending?.some((t) => t.branch === branch) && (
              <p>
                Browse the collection to see your recently viewed furniture
                here.
              </p>
            )}
        </Modal>
      )}
      <Appearance />
      {modal?.kind === "directory" && (
        <Modal title="Studio pages" close={close}>
          {exp.pages.map((p) => (
            <a className="listlink" key={p.slug} href={"/?page=" + p.slug}>
              {p.title}
              <small>
                {p.branch === "All" ? "All showrooms" : p.branch + " showroom"}
              </small>
            </a>
          ))}
        </Modal>
      )}
      {modal?.kind === "share" && (
        <Modal title="Share product" close={close}>
          <input
            readOnly
            value={modal.url}
            onFocus={(e) => e.target.select()}
          />
        </Modal>
      )}
      {modal?.kind === "roomBundles" && (
        <RoomBundles
          items={items}
          cart={cart}
          branch={branch}
          close={close}
          addSet={addRoomSet}
          viewBag={bag}
        />
      )}
      {modal?.kind === "planner" && <Planner items={items} close={close} />}{" "}
      {modal?.kind === "staffAccess" && (
        <Modal title="Staff role access" close={close}>
          <StaffGrants
            id={modal.id}
            roles={desk.roles}
            branches={desk.branches}
            onDone={async () => {
              await refresh();
              close();
              notify("Staff access saved");
            }}
          />
        </Modal>
      )}
      {modal?.kind === "reviewProduct" && (
        <Modal title={modal.product.name} close={close}>
          <Reviews product={modal.product} user={u} refresh={refresh} />
        </Modal>
      )}
      {modal?.kind === "auth" && <Login {...shared} after={modal.after} />}
      {modal?.kind === "emailEnrollment" && <EmailEnrollment {...shared} />}
      {modal?.kind === "secret" && (
        <Modal title="One-time recovery key" close={close}>
          <p>
            Save this key in your password manager. It can reset your password
            once.
          </p>
          <code>{modal.keyValue}</code>
        </Modal>
      )}
      {modal?.kind === "account" && (
        <Modal title="Your account" close={close}>
          <button
            onClick={() =>
              M({
                kind: "form",
                title: "Generate recovery key",
                fields: [["password", "Current password", "password"]],
                submit: async (b) => {
                  let r = await api("/recovery-key", b);
                  M({ kind: "secret", keyValue: r.key });
                },
              })
            }
          >
            Generate recovery key
          </button>
          <p>
            {u.email} · {label(u.role)} · {u.branch}
          </p>
          <RolePicker
            user={u}
            choices={desk.assignedRoles}
            onChange={async () => {
              close();
              await refresh();
              P("desk");
            }}
          />
          <div className="stack">
            <button
              onClick={() =>
                M({
                  kind: "form",
                  title: "Change password",
                  fields: [
                    ["current", "Current password", "password"],
                    ["password", "New password (12+ characters)", "password"],
                  ],
                  submit: async (b) => {
                    await api("/password", b);
                    close();
                    P("shop");
                    await refresh();
                    N("Password updated. Please sign in again.");
                  },
                })
              }
            >
              Change password
            </button>
            <button
              onClick={() =>
                go(async () => {
                  await api("/consent", { enabled: !u.marketing });
                  await refresh();
                  N("Preference saved");
                })
              }
            >
              Marketing messages: {u.marketing ? "on" : "off"}
            </button>
            <button
              disabled={desk.mfa}
              onClick={() => M({ kind: "emailEnrollment" })}
            >
              {desk.mfa
                ? "Email verification enabled"
                : "Enable email verification"}
            </button>
            <button
              onClick={() =>
                go(async () => {
                  await api("/logout", {});
                  close();
                  A({});
                  H(false);
                  P("shop");
                  await refresh();
                })
              }
            >
              Sign out
            </button>
          </div>
        </Modal>
      )}
      {modal?.kind === "product" && (
        <Modal
          title={modal.p.name}
          close={close}
          wide
          className="product-dialog"
        >
          <div className="product-overview">
            <div className="product-media">
              <ProductZoom
                key={modal.p.sku}
                photo={modal.p.photo}
                name={modal.p.name}
              />
              {["SF-101", "CH-202", "TB-303", "BD-404", "CH-505"].includes(
                modal.p.sku,
              ) && (
                <details
                  onToggle={(e) => {
                    if (
                      e.currentTarget.open &&
                      !document.querySelector("#mv-script")
                    ) {
                      let el = document.createElement("script");
                      el.id = "mv-script";
                      el.type = "module";
                      el.src = "/model-viewer.js";
                      document.head.appendChild(el);
                    }
                  }}
                >
                  <summary>3D dimensions & room preview</summary>
                  <model-viewer
                    style={{ width: "100%", height: 270 }}
                    src={"/models/" + modal.p.sku + ".glb"}
                    alt="Illustrative furniture model"
                    camera-controls=""
                    ar=""
                    ar-modes="webxr scene-viewer quick-look"
                    ar-scale="fixed"
                  ></model-viewer>
                  <small>
                    Approximate shape at listed scale. Room placement requires
                    an AR-compatible device and a secure connection.
                  </small>
                </details>
              )}
            </div>
            <section
              className="purchase-summary"
              aria-label="Product information"
            >
              <p className="piece-reference">
                <span>{modal.p.category}</span>
                <span>{modal.p.sku}</span>
              </p>
              <strong className="piece-price">{rupee(modal.p.price)}</strong>
              {modal.p.variant_family && (
                <label className="field">
                  Finish &amp; colour
                  <select
                    value={modal.p.id}
                    onChange={(e) =>
                      openProduct(
                        items.find((p) => p.id === Number(e.target.value)),
                      )
                    }
                  >
                    {items
                      .filter(
                        (p) => p.variant_family === modal.p.variant_family,
                      )
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.finish} · {rupee(p.price)} · {p.available}{" "}
                          available
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <dl>
                {[
                  ["Finish", modal.p.finish],
                  ["Dimensions", modal.p.dimensions],
                  ["Warranty", modal.p.warranty],
                  ["Availability", modal.p.available + " at " + branch],
                ].map(([a, b]) => (
                  <React.Fragment key={a}>
                    <dt>{a}</dt>
                    <dd>{b}</dd>
                  </React.Fragment>
                ))}
              </dl>
              <div className="purchase-actions">
                {modal.p.available > 0 ? (
                  <>
                    <button
                      className="primary"
                      onClick={() => {
                        const piece = modal.p;
                        auth(() =>
                          M({
                            kind: "checkout",
                            piece,
                            requestKey: crypto.randomUUID(),
                          }),
                        );
                      }}
                    >
                      Buy now
                    </button>
                    <button onClick={() => add(modal.p)}>Add to bag</button>
                  </>
                ) : (
                  <button
                    onClick={() =>
                      auth(() =>
                        go(async () => {
                          await api("/restock/" + modal.p.id, { branch });
                          N("Restock alert saved");
                        }),
                      )
                    }
                  >
                    Notify when available
                  </button>
                )}
                <button onClick={() => quote(modal.p)}>Custom quote</button>
                <button
                  onClick={() => {
                    let id = modal.p.id;
                    Q(
                      compare.includes(id)
                        ? compare.filter((x) => x !== id)
                        : [...compare, id],
                    );
                    close();
                  }}
                >
                  {compare.includes(modal.p.id)
                    ? "Remove from comparison"
                    : "Add to comparison"}
                </button>
              </div>
            </section>
          </div>
          <div className="product-support">
            <ProductExtras
              key={modal.p.id}
              p={modal.p}
              exp={exp}
              branch={branch}
              settings={cat.settings}
              auth={auth}
              refresh={refresh}
              notify={N}
              M={M}
            />
            <DeliveryFit
              key={"fit-" + modal.p.id + "-" + modal.p.branch}
              product={modal.p}
              user={u}
              initial={modal.fitDraft}
              refresh={refresh}
              signIn={(draft) => {
                const piece = modal.p;
                M({
                  kind: "auth",
                  after: () =>
                    M({ kind: "product", p: piece, fitDraft: draft }),
                });
              }}
            />
            <Reviews
              key={"reviews-" + modal.p.id}
              product={modal.p}
              user={u}
              refresh={refresh}
              signIn={() => {
                const piece = modal.p;
                M({ kind: "auth", after: () => openProduct(piece) });
              }}
            />
          </div>
        </Modal>
      )}
      {modal?.kind === "compare" && (
        <Modal wide title="Compare furniture" close={close}>
          <div className="tablewrap">
            <DataTable label="Furniture comparison">
              <thead>
                <tr>
                  {["Piece", "Price", "Finish", "Dimensions", "Stock"].map(
                    (x) => (
                      <th key={x}>{x}</th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {items
                  .filter((x) => compare.includes(x.id))
                  .map((x) => (
                    <tr key={x.id}>
                      <td>{x.name}</td>
                      <td>{rupee(x.price)}</td>
                      <td>{x.finish}</td>
                      <td>{x.dimensions}</td>
                      <td>{x.available}</td>
                    </tr>
                  ))}
              </tbody>
            </DataTable>
          </div>
          <button
            onClick={() => {
              Q([]);
              close();
            }}
          >
            Clear comparison
          </button>
        </Modal>
      )}
      {modal?.kind === "bag" && (
        <Modal title={"Shopping bag · " + count} close={close}>
          {!count ? (
            <p>Your bag is empty.</p>
          ) : (
            <>
              {cartItems.map((p) => (
                <div className="cartline" key={p.id}>
                  <img src={p.photo} alt="" />
                  <div>
                    <b>{p.name}</b>
                    <p>{rupee(p.price)}</p>
                  </div>
                  <div className="row">
                    <button aria-label="Remove one" onClick={() => add(p, -1)}>
                      −
                    </button>
                    {cart[p.id]}
                    <button aria-label="Add one" onClick={() => add(p)}>
                      +
                    </button>
                  </div>
                </div>
              ))}
              <label className="field">
                Coupon code
                <input
                  value={coupon}
                  onChange={(e) => CP(e.target.value.trim())}
                />
              </label>
              {coupon && (
                <p>
                  {discount
                    ? discount + "% discount applied"
                    : "Coupon not recognised"}
                </p>
              )}
              <div className="stack">
                <label>
                  <input
                    type="checkbox"
                    checked={assembly}
                    onChange={(e) => AS(e.target.checked)}
                  />{" "}
                  Assembly · {rupee(conf.assembly_fee)}
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={carry}
                    onChange={(e) => CA(e.target.checked)}
                  />{" "}
                  Floor-carry · {rupee(conf.carry_fee)}
                </label>
              </div>
              <dl>
                <dt>Delivery</dt>
                <dd>{rupee(fee)}</dd>
                <dt>Total</dt>
                <dd>{rupee(grand)}</dd>
              </dl>
              <button
                className="primary"
                onClick={() => auth(() => M({ kind: "checkout" }))}
              >
                Checkout <ArrowRight size={16} />
              </button>
            </>
          )}
        </Modal>
      )}
      {modal?.kind === "checkout" && u && (
        <Checkout
          hasFit={desk.fitProducts?.some(
            (f) =>
              f.branch === (modal.piece?.branch || branch) &&
              (modal.piece
                ? f.product_id === modal.piece.id
                : cartItems.some((p) => p.id === f.product_id)),
          )}
          user={u}
          branch={modal.piece?.branch || branch}
          summary={
            modal.piece
              ? modal.piece.name + " × 1"
              : cartItems.map((p) => p.name + " × " + cart[p.id]).join(", ")
          }
          slots={exp?.slots}
          mode={cat.checkoutMode}
          total={
            modal.piece
              ? Number(modal.piece.price) +
                (modal.piece.price >= Number(conf.free_above)
                  ? 0
                  : Number(conf.delivery_fee || 0))
              : grand
          }
          close={close}
          place={async (b) => {
            const order = await api("/work", {
              ...b,
              kind: "ORDER",
              branch: modal.piece?.branch || branch,
              requestKey: modal.requestKey || requestKey,
              coupon: modal.piece ? "" : coupon,
              assembly: !modal.piece && assembly,
              carry: !modal.piece && carry,
              items: modal.piece
                ? [{ productId: modal.piece.id, qty: 1 }]
                : cartItems.map((p) => ({
                    productId: p.id,
                    qty: cart[p.id],
                  })),
            });
            if (!modal.piece) {
              A({});
              RK(crypto.randomUUID());
            }
            M({ kind: "record", id: order.id });
            if (b.paymentMethod === "OFFLINE") {
              await refresh();
              return;
            }
            const update = () => {
              M((current) =>
                current?.kind === "record" && current.id === order.id
                  ? { ...current, updated: (current.updated || 0) + 1 }
                  : current,
              );
              refresh().catch((e) => notify(e.message));
            };
            try {
              await openPurchasePayment(
                order.id,
                b.paymentMethod,
                (message) => {
                  notify(message);
                  update();
                },
              );
            } catch (e) {
              notify("Order #" + order.id + " saved. " + e.message);
            } finally {
              update();
            }
          }}
        />
      )}
      {modal?.kind === "form" && (
        <Modal title={modal.title} close={close}>
          {modal.hint && <p className="hint">{modal.hint}</p>}
          <Form
            key={modal.title}
            fields={modal.fields}
            button={modal.button}
            submit={modal.submit}
          />
        </Modal>
      )}
      {modal?.kind === "record" && (
        <RecordDetail
          key={modal.id + "-" + (modal.updated || 0)}
          {...shared}
          id={modal.id}
        />
      )}
      {msg && (
        <div className="toast" role="status">
          {msg}
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
