// Run from ui/ after building the JAR. Test data lives in a fresh temporary database.
import {layoutTests} from "./test-layout.mjs";
import {adminRecordTests} from "./test-admin-records.mjs";
import {catalogTests,catalogBrowser} from "./test-catalog.mjs";
import {purchaseBrowser} from "./test-purchase.mjs";
import {experienceTests,studioBrowser} from "./test-experience.mjs";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const dir = await mkdtemp(join(tmpdir(), "apsp-check-")),
  port = String(19000 + Math.floor(Math.random() * 8000)),
  base = "http://127.0.0.1:" + port;
const password = randomUUID() + "!",
  jar = resolve(
    process.env.APSP_TEST_JAR || "../target/furniture-suite-1.0.0.jar",
  );
let javaCommand = process.env.APSP_JAVA || "java";
if (process.platform === "win32") {
  // The Oracle PATH launcher starts a second JVM that survives killing the launcher.
  const settings = spawnSync(javaCommand, ["-XshowSettings:properties", "-version"], {
    encoding: "utf8",
    windowsHide: true,
  });
  const home = /^\s*java\.home\s*=\s*(.+)$/m.exec(settings.stderr || "")?.[1].trim();
  if (settings.status === 0 && home) javaCommand = join(home, "bin", "java.exe");
}
const proc = spawn(javaCommand, ["-jar", jar], {
  cwd: dir,
  env: {
    ...process.env,
    APSP_PORT: port,
    APSP_OWNER_PASSWORD: password,
    APSP_GMAIL_APP_PASSWORD: "",
    APSP_NOTIFICATION_URL: "",
    APSP_NOTIFICATION_SECRET: "",
    RAZORPAY_TEST_KEY_ID:"", RAZORPAY_TEST_KEY_SECRET:"", RAZORPAY_KEY_ID: "",
    RAZORPAY_KEY_SECRET: "",
    RAZORPAY_WEBHOOK_SECRET: "",
  },
  windowsHide: true,
});
let log = "";
proc.stdout.on("data", (x) => (log = (log + x).slice(-7000)));
proc.stderr.on("data", (x) => (log = (log + x).slice(-7000)));
class Client {
  async req(path, b, status) {
    const res = await fetch(base + "/api" + path, {
      method: b === undefined ? "GET" : "POST",
      headers: {
        Cookie: this.cookie || "",
        "X-CSRF-Token": this.csrf || "",
        "Content-Type": "application/json",
      },
      body: b === undefined ? undefined : JSON.stringify(b),
    });
    let ck = res.headers.get("set-cookie");
    if (ck) this.cookie = ck.split(";")[0];
    let text = await res.text();
    let data = text ? JSON.parse(text) : null;
    if (data?.csrf) this.csrf = data.csrf;
    if (status) {
      assert.equal(res.status, status, path + " " + text);
      return data;
    }
    assert.ok(res.ok, path + " " + res.status + " " + text);
    return data;
  }
  async login(email) {
    await this.req("/session");
    await this.req("/login", { email, password });
    return this;
  }
  async register(name) {
    await this.req("/session");
    await this.req("/register", {
      name,
      email: name + "@example.com",
      password,
    });
    assert.equal((await this.req("/session")).user, null);
    await this.req("/desk", undefined, 401);
    return this.login(name + "@example.com");
  }
  async move(id, to, more = {}) {
    const { record } = await this.req("/work/" + id);
    return this.req("/work/" + id + "/move", {
      to,
      revision: record.revision,
      note: "Checked reference",
      ...more,
    });
  }
}
try {
  let started = false;
  for (const until = Date.now() + 120_000; Date.now() < until;) {
    try {
      if ((await fetch(base + "/api/catalog")).ok) {
        started = true;
        break;
      }
    } catch {}
    if (proc.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  assert.ok(started, log);
  const owner = await new Client().login("owner@apsp.local"),
    a = await new Client().register("a"),
    b = await new Client().register("b");
  await owner.req("/staff", {
    name: "Branch manager",
    email: "manager@test.local",
    role: "ADMIN",
    branch: "Central",
    password,
  });
  const mgr = await new Client().login("manager@test.local");
  const profileLogin=await a.req("/session");
  assert.ok(profileLogin.expiresAt>Date.now()+86_000_000 && profileLogin.expiresAt<=Date.now()+86_400_000);
  await a.req("/profile",{name:"First customer",phone:"2025550147",address:"Fixture delivery lane",pincode:"110001",branch:"Central",role:"SUPER_ADMIN"});
  const own=(await a.req("/session")).user;assert.equal(own.role,"CUSTOMER");assert.equal(own.delivery_address,"Fixture delivery lane");
  assert.notEqual((await b.req("/session")).user.delivery_address,own.delivery_address);
  await a.req("/profile",{name:"Buyer",address:"Fixture",pincode:"bad"},400);
  const newWork = async (c, b) => (await c.req("/work", b)).id;
  const orderBody = {
    kind: "ORDER",
    detail: "Test customer, 1 Test Lane",
    pincode: "110001",
    items: [{ productId: 1, qty: 1 }],
  };
  const order = await newWork(a, orderBody);
  await b.req("/work/" + order, undefined, 403);
  await a.req("/staff", { name: "Not allowed" }, 403);
  await a.req("/desk");
  await mgr.req("/desk");
  await mgr.req("/work/" + order + "/collect", {
    amount: 48900,
    ref: "BANK-1",
  });
  await mgr.req(
    "/work/" + order + "/collect",
    { amount: 1, ref: "BANK-2" },
    409,
  );
  for (const step of ["PACKED", "DISPATCHED", "DELIVERED", "INSTALLED"])
    await mgr.move(order, step);
  let line = (await a.req("/work/" + order)).items[0];
  let ret = await newWork(a, {
    kind: "RETURN",
    parentId: order,
    lineId: line.id,
    qty: 1,
    detail: "Damaged frame",
  });
  for (const step of ["APPROVED", "INSPECTING", "REFUND_APPROVED", "REFUNDED"])
    await mgr.move(ret, step, { ref: "REF-001" });
  assert.equal((await a.req("/work/" + order)).paid, 0);
  const lead = await newWork(a, {
    kind: "LEAD",
    title: "Walnut sofa",
    detail: "210 cm",
  });
  for (const step of ["CONTACTED", "QUALIFIED", "MEASURED", "QUOTED"])
    await mgr.move(lead, step, { amount: 60000 });
  let old = (await a.req("/work/" + lead)).record;
  await mgr.req("/work/" + lead + "/revise", {
    amount: 61000,
    note: "Changed fabric",
  });
  await a.req(
    "/work/" + lead + "/move",
    { to: "ACCEPTED", revision: old.revision },
    409,
  );
  await a.move(lead, "ACCEPTED");
  let custom = (await a.req("/work/" + lead)).links[0];
  let job = (await mgr.req("/work/" + custom.id)).links[0];
  const buildTracking = await a.req("/orders/"+custom.id+"/tracking");
  assert.equal(buildTracking.stage,"IN_PRODUCTION");assert.ok(buildTracking.milestones.IN_PRODUCTION);assert.equal(buildTracking.milestones.CONFIRMED,undefined);assert.equal(buildTracking.workshop[0].stage,"AWAITING_ADVANCE");
  await mgr.req(
    "/work/" + job.id + "/move",
    { to: "PLANNED", revision: 1 },
    409,
  );
  await mgr.req("/work/" + custom.id + "/collect", {
    amount: 15000,
    ref: "ADV-001",
  });
  for (const step of [
    "PLANNED",
    "CUTTING",
    "ASSEMBLY",
    "FINISHING",
    "QC",
    "READY",
  ])
    await mgr.move(job.id, step);
  assert.equal((await a.req("/work/" + custom.id)).record.stage, "CONFIRMED");
  const readyTracking=await a.req("/orders/"+custom.id+"/tracking");
  assert.ok(readyTracking.milestones.CONFIRMED);assert.equal(readyTracking.workshop[0].stage,"READY");
  for(const stage of ["PACKED","DISPATCHED","DELIVERED"])await mgr.move(custom.id,stage);
  assert.equal((await a.req("/orders/"+custom.id+"/tracking")).items[0].shipped,1);
  let po = await newWork(owner, {
    kind: "PURCHASE",
    title: "Timber vendor",
    productId: 1,
    qty: 3,
  });
  await owner.req(
    "/work/" + po + "/move",
    { to: "APPROVED", revision: 1 },
    403,
  );
  for (const step of ["APPROVED", "ORDERED", "INSPECTING"])
    await mgr.move(po, step);
  await mgr.move(po, "RECEIVED", { qty: 1 });
  assert.equal((await mgr.req("/work/" + po)).record.stage, "INSPECTING");
  await mgr.move(po, "RECEIVED", { qty: 2 });
  for (const step of ["MATCHED", "PAID"])
    await mgr.move(po, step, { invoiceAmount: 88020 });
  const race = {
    ...orderBody,
    branch: "North",
    items: [{ productId: 2, qty: 3 }],
  };
  let tries = await Promise.allSettled([newWork(a, race), newWork(b, race)]);
  assert.equal(tries.filter((t) => t.status === "fulfilled").length, 1);
  let won = tries.find((t) => t.status === "fulfilled").value;
  await mgr.req("/work/" + won, undefined, 403);
  let bad = await fetch(base + "/api/work", {
    method: "POST",
    headers: { Cookie: a.cookie, "Content-Type": "application/json" },
    body: JSON.stringify(orderBody),
  });
  assert.equal(bad.status, 403);
  // Validate material planning, shop pricing, reconciliation, campaign consent and split dispatch.
  await owner.req("/promotion", {
    coupon_code: "STUDIO10",
    coupon_pct: 10,
    assembly_fee: 400,
    carry_fee: 100,
    store_note: "Studio offer",
  });
  const advanced = {
    ...orderBody,
    items: [{ productId: 2, qty: 2 }],
    coupon: "STUDIO10",
    assembly: true,
    carry: true,
    requestKey: "stable-checkout-key",
  };
  const split = await newWork(a, advanced);
  assert.equal(await newWork(a, advanced), split);
  let sw = await mgr.req("/work/" + split);
  assert.equal(sw.record.amount, 31420);
  await mgr.req("/vehicles", {
    name: "VAN-1",
    branch: "Central",
    capacity: 10,
  });
  await mgr.req("/work/" + split + "/dispatch-slot", {
    vehicle: "VAN-1",
    volume: 5,
    due: "2027-01-05",
    crew: "Team A",
  });
  await mgr.move(split, "PACKED");
  await mgr.req("/work/" + split + "/ship", {
    lineId: sw.items[0].id,
    qty: 1,
    ref: "LOAD-1",
  });
  await mgr.move(split, "DISPATCHED");
  assert.equal((await mgr.req("/work/" + split)).items[0].shipped, 2);
  let ops = await mgr.req("/operations");
  assert.ok(ops.route.some((x) => x.work_id === split));
  let cash = ops.payments.find((x) => x.ref === "ADV-001");
  await mgr.req("/bank/" + cash.id, { ref: "BANK-ADV", amount: 15000 });
  assert.ok((await mgr.req("/insights")).demand.length);
  await a.req("/consent", { enabled: true });
  let camp = await newWork(mgr, {
    kind: "CAMPAIGN",
    title: "Dining offer",
    detail: "Members can book a showroom visit.",
  });
  await mgr.move(camp, "ACTIVE");
  assert.ok(
    (await a.req("/desk")).inbox.some((x) =>
      x.message.includes("Dining offer"),
    ),
  );
  assert.ok(
    !(await b.req("/desk")).inbox.some((x) =>
      x.message.includes("Dining offer"),
    ),
  );
  let lead2 = await newWork(a, { kind: "LEAD", title: "Built-in wardrobe" });
  for (const step of ["CONTACTED", "QUALIFIED", "MEASURED"])
    await mgr.move(lead2, step);
  await mgr.req("/work/" + lead2 + "/estimate", {
    materials: 15000,
    labour: 5000,
    freight: 0,
    discount: 3000,
  });
  await mgr.req("/work/" + lead2 + "/discount", {}, 409);
  await owner.req("/work/" + lead2 + "/discount", {});
  await mgr.move(lead2, "QUOTED", { amount: 17000 });
  await a.move(lead2, "ACCEPTED");
  let o2 = (await mgr.req("/work/" + lead2)).links[0];
  let j2 = (await mgr.req("/work/" + o2.id)).links[0];
  await mgr.req("/work/" + o2.id + "/collect", {
    amount: 5000,
    ref: "advance-2",
  });
  await mgr.move(j2.id, "PLANNED");
  await mgr.req("/work/" + j2.id + "/bom", { productId: 2, qty: 1 });
  await mgr.req(
    "/work/" + j2.id + "/move",
    { to: "CUTTING", revision: 2 },
    409,
  );
  await mgr.req("/work/" + j2.id + "/materials", { productId: 2, qty: 1 });
  await mgr.move(j2.id, "CUTTING");
  console.log(
    "Passed: demand reports, bank match, coupon pricing, checkout replay, vehicle schedule, partial shipment, consented campaign, CPQ approval and BOM gates.",
  );
  const invoice = await fetch(base + "/api/work/" + order + "/document", {
    headers: { Cookie: a.cookie },
  });
  assert.ok(invoice.ok);
  assert.match(await invoice.text(), /Sales invoice/);
  assert.equal(
    (
      await fetch(base + "/api/work/" + order + "/document", {
        headers: { Cookie: b.cookie },
      })
    ).status,
    403,
  );
  const ledger = await owner.req("/ledger");
  assert.ok(ledger.rows.length > 5);
  assert.equal(
    Object.values(ledger.balances).reduce((a, v) => a + v, 0),
    0,
  );
  await mgr.req("/inventory/count", {
    productId: 3,
    sellable: 6,
    damaged: 1,
    display: 1,
    reason: "Cycle count",
  });
  let c = (await owner.req("/inventory")).counts[0];
  await mgr.req("/inventory/count/" + c.id + "/approve", {}, 409);
  await owner.req("/inventory/count/" + c.id + "/approve", {});
  assert.equal(
    (await mgr.req("/inventory")).units.find(
      (x) => x.product_id === 3 && x.branch === "Central",
    ).on_hand,
    6,
  );
  const key = (await b.req("/recovery-key", { password })).key;
  let fresh = await new Client().register("recovery-test");
  await fresh.req("/recover", { email: "b@example.com", key, password });
  await b.req("/desk", undefined, 401);
  await fresh.req("/recover", { email: "b@example.com", key, password }, 403);
  await experienceTests({a,owner,mgr,fresh,orderBody,password});
  const catalogFixture=await catalogTests({owner,mgr,Client,password,dir});
  await adminRecordTests({owner,mgr,Client,password,postedOrder:order});
  if (process.env.APSP_BROWSER) {
    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch({
      executablePath: process.env.APSP_BROWSER,
      headless: true,
    });
    try {
      const context = await browser.newContext();const page = await context.newPage();
      let errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(base);
      assert.equal(await page.getByRole("link", {name:/Chat on WhatsApp/}).getAttribute("href"), "https://wa.me/917390916220");
      assert.equal(await page.getByRole("link", {name:/Email ·/}).getAttribute("href"), "mailto:apratap5449@gmail.com");
      await page
        .getByRole("heading", { name: "Furniture collection" })
        .waitFor();
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.getByLabel("Email", { exact: true }).fill("owner@apsp.local");
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Sign in", exact: true })
        .click();
      await page.getByRole("button", { name: "Studio Owner" }).waitFor();
      await page
        .getByRole("button", { name: "Workspace", exact: true })
        .click();
      await page.getByRole("heading", { name: "Overview" }).waitFor();
      await page
        .getByRole("button", { name: "Administration", exact: true })
        .click();
      await page.getByRole("heading", { name: "Team access" }).waitFor();
      await page.getByRole("button", {name:"Connect Gmail"}).waitFor();
      await page.setViewportSize({ width: 390, height: 844 });
      await page
        .getByRole("button", { name: "Collection", exact: true })
        .click();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page
        .getByRole("button", { name: "Moss three-seat sofa", exact: true })
        .first()
        .click();
      await page
        .getByText("3D dimensions & room preview", { exact: true })
        .click();
      await page.waitForFunction(
        () => document.querySelector("model-viewer")?.loaded === true,
        {},
        { timeout: 25000 },
      );
      await page.getByRole("button", { name: "Close dialog" }).click();
      await page.getByRole("button", { name: "Plan a room layout" }).click();
      await page
        .getByRole("button", { name: "Add piece", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Save layout", exact: true })
        .click();
      await page.getByText("Layout saved on this device.").waitFor();
      await page.getByRole("button", { name: "Close dialog" }).click();
      await studioBrowser(page,base);assert.deepEqual(errors, []);
      await purchaseBrowser(browser,base,password);
      await catalogBrowser(browser,base,password,catalogFixture);
      await layoutTests(browser,base,password);
      console.log(
        "Desktop login, workspace, admin and mobile storefront passed",
      );
    } finally {
      await browser.close();
    }
  }
  console.log(
    "Passed: checkout, stock race, roles, branch/customer isolation, CSRF, returns, collections, quote revisions, custom production, procurement and partial receipts.",
  );
} catch (e) {
  console.error(log);
  throw e;
} finally {
  proc.kill();
}
