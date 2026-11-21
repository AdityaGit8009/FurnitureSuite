import assert from "node:assert/strict";

export async function adminRecordTests({owner, mgr, Client, password, postedOrder}) {
  const customer = await new Client().register("admin-record-buyer");
  const guest = new Client();
  const examples = "/admin/examples";
  const all = await owner.req(examples);
  const central = await mgr.req(examples);
  assert.ok(central.every(row => row.branch === "Central"));
  for (const branch of ["Central", "North"]) {
    const modules = new Set(all.filter(row => row.branch === branch).map(row => row.module));
    assert.equal(modules.size, 18);
    for (const module of modules) {
      assert.ok(all.filter(row => row.module === module && row.branch === branch).length >= 3);
    }
  }
  await customer.req(examples, undefined, 403);
  const north = all.find(row => row.branch === "North");
  await mgr.req(examples + "/" + north.id, {action: "delete", revision: north.revision}, 403);
  const sample = central.find(row => row.module === "Ledger");
  const samplePath = examples + "/" + sample.id;
  const liveLedger = await mgr.req("/ledger");
  let sampleRevision = sample.revision;
  await mgr.req(samplePath, {...sample, action: "edit", title: "Revised demo entry"});
  await mgr.req(samplePath, {action: "disable", revision: sampleRevision}, 409);
  const currentSample = () => mgr.req(examples).then(rows => rows.find(row => row.id === sample.id));
  assert.equal((await currentSample()).title, "Revised demo entry");
  for (const [action, enabled, deleted] of [
    ["disable", false, false], ["delete", false, true], ["restore", false, false], ["enable", true, false],
  ]) {
    await mgr.req(samplePath, {action, revision: ++sampleRevision});
    const row = await currentSample();
    assert.equal(row.enabled, enabled);
    assert.equal(row.deleted, deleted);
  }
  await mgr.req(samplePath, {...sample, action: "edit", revision: ++sampleRevision});
  assert.deepEqual(await mgr.req("/ledger"), liveLedger);

  const {id: lead} = await customer.req("/work", {kind: "LEAD", title: "Admin test enquiry", detail: "Original measurements"});
  const management = id => "/admin/manage/work/" + id;
  const work = id => "/work/" + id;
  const read = async id => (await mgr.req(work(id))).record;
  const leadEdit = {action: "edit", title: "Measured alcove", detail: "216 cm", revision: 1};
  await customer.req(management(lead), leadEdit, 403);
  const race = await Promise.allSettled([mgr.req(management(lead), leadEdit), owner.req(management(lead), leadEdit)]);
  assert.equal(race.filter(result => result.status === "fulfilled").length, 1);
  assert.match(race.find(result => result.status === "rejected").reason.message, /409/);
  assert.equal((await read(lead)).detail, leadEdit.detail);
  const manage = async (id, action, status) => {
    const {revision} = await read(id);
    return mgr.req(management(id), {action, revision}, status);
  };
  await manage(lead, "disable");
  await customer.req(work(lead), undefined, 403);
  assert.ok(!(await customer.req("/desk")).work.some(row => row.id === lead));
  assert.deepEqual((await mgr.req(work(lead))).actions, []);
  await mgr.req(work(lead) + "/note", {note: "Unavailable"}, 409);
  const visit = {kind: "VISIT", parentId: lead, title: "Measurements visit"};
  await mgr.req("/work", visit, 409);
  await manage(lead, "enable");
  await manage(lead, "delete");
  await manage(lead, "enable", 409);
  await customer.req(work(lead), undefined, 403);
  await manage(lead, "restore");
  assert.equal((await customer.req(work(lead))).record.title, leadEdit.title);
  await mgr.req("/work", visit);
  assert.equal((await mgr.req("/desk")).work.find(row => row.id === lead).canDelete, false);
  await manage(lead, "delete", 409);

  const receipt = await mgr.req(work(postedOrder));
  const {revision} = receipt.record;
  await mgr.req(management(postedOrder), {...leadEdit, revision}, 409);
  for (const action of ["disable", "delete"]) await manage(postedOrder, action, 409);
  assert.deepEqual(await mgr.req(work(postedOrder)), receipt);
  const desk = await mgr.req("/desk");
  assert.equal(desk.work.find(row => row.id === postedOrder).canEdit, false);
  const signed = desk.work.find(row => row.kind === "LEAD" && row.stage === "ACCEPTED");
  await mgr.req(management(signed.id), {...leadEdit, revision: signed.revision}, 409);
  const {id: transfer} = await owner.req("/work", {
    kind: "TRANSFER", title: "North transfer", branch: "North", detail: "Central", productId: 1, qty: 1,
  });
  await mgr.req(management(transfer), {action: "disable", revision: 1}, 403);
  await owner.req(management(transfer), {...leadEdit, detail: "Other destination"}, 400);
  await owner.req(management(transfer), {action: "edit", title: "North transfer reference", revision: 1});
  assert.equal((await read(transfer)).detail, "Central");
  await owner.req(management(transfer), {action: "disable", revision: 2});
  const purchase = await mgr.req("/work", {kind: "PURCHASE", productId: 1, qty: 1, title: "Draft materials request"});
  await manage(purchase.id, "delete");

  const branch = "Central";
  const product = (await mgr.req("/catalog-admin?branch=Central")).find(row => row.sku === "BD-404");
  const publicReview = "/catalog/products/" + product.id + "/reviews";
  const submitReview = "/products/" + product.id + "/review";
  const review = {branch, stars: 4, title: "Admin visibility test", detail: "Customer supplied text", revision: 0};
  const baseline = (await guest.req(publicReview)).total;
  const {id: reviewId} = await customer.req(submitReview, review);
  const moderation = {...review, reason: "Approved for publication", stage: "PUBLISHED", revision: 1};
  await mgr.req("/reviews/" + reviewId + "/moderate", moderation);
  await mgr.req(management(reviewId), {...leadEdit, revision: 2}, 409);
  async function visibleReview(visible) {
    const published = await guest.req(publicReview);
    assert.equal(published.total, baseline + Number(visible));
    assert.equal(published.reviews.some(row => row.title === review.title), visible);
    assert.equal((await guest.req("/catalog")).reviews.some(row => row.title === review.title), visible);
    assert.equal((await customer.req("/products/" + product.id + "/my-review")).length, Number(visible));
  }
  await visibleReview(true);
  await manage(reviewId, "disable");
  await visibleReview(false);
  await customer.req(submitReview, {...review, revision: (await read(reviewId)).revision}, 409);
  await manage(reviewId, "enable");
  await manage(reviewId, "delete");
  await visibleReview(false);
  await manage(reviewId, "restore");
  await visibleReview(true);
  assert.equal((await mgr.req(work(reviewId))).feedback[0].author_body, review.detail);

  const listing = "/admin/manage/listing/" + product.id;
  const catalog = "/catalog-admin/" + product.id;
  let listingRevision = product.listing_revision;
  const changeListing = action => mgr.req(listing, {branch, action, revision: listingRevision++});
  await mgr.req(listing, {branch: "North", action: "disable", revision: 0}, 403);
  const priceRequest = {branch, price: product.price + 500, reason: "Fixture price request"};
  await mgr.req(catalog + "/price-request", priceRequest);
  const pending = (await owner.req("/catalog-admin/prices?branch=Central")).find(row => row.product_id === product.id);
  await changeListing("disable");
  await changeListing("delete");
  await mgr.req(listing, {branch, action: "restore", revision: listingRevision - 1}, 409);
  await mgr.req(catalog, {...product, branch, published: true, revision: listingRevision}, 409);
  await mgr.req(catalog + "/price-request", priceRequest, 409);
  await owner.req("/catalog-admin/prices/" + pending.id, {stage: "APPROVED"}, 409);
  await owner.req("/catalog-admin/prices/" + pending.id, {stage: "DECLINED"});
  await mgr.req(catalog + "/packing", {branch, cartons: "20 x 30 x 40", upright: true, revision: 0}, 409);
  const branches = async () => (await guest.req("/catalog")).products.filter(row => row.id === product.id).map(row => row.branch);
  assert.deepEqual(await branches(), ["North"]);
  await customer.req("/work", {kind: "ORDER", branch, detail: "Test address", pincode: "110001", items: [{productId: product.id, qty: 1}]}, 404);
  await changeListing("restore");
  assert.deepEqual(await branches(), ["North"]);
  await changeListing("enable");
  assert.deepEqual(await branches(), ["Central", "North"]);

  const email = "admin-lifecycle@test.local";
  await owner.req("/staff", {name: "Fixture staff", email, role: "SALES", branch, password});
  let staff = await new Client().login(email);
  const staffId = (await staff.req("/session")).user.id;
  const manageStaff = "/admin/manage/staff/" + staffId;
  const active = "/staff/" + staffId + "/active";
  const access = "/staff/" + staffId + "/access";
  const version = (await owner.req(access)).auth_version;
  await owner.req(manageStaff, {action: "restore", version}, 409);
  await mgr.req(active, {active: false, version}, 403);
  await owner.req(active, {active: false}, 400);
  await owner.req(active, {active: "false", version}, 400);
  await owner.req("/staff/" + (await customer.req("/session")).user.id + "/active", {active: false, version: 1}, 403);
  await owner.req(manageStaff, {action: "edit", name: "Updated staff", version});
  await owner.req(active, {active: false, version}, 409);
  await staff.req("/desk", undefined, 401);
  staff = await new Client().login(email);
  assert.equal((await staff.req("/session")).user.display_name, "Updated staff");
  await owner.req(active, {active: false, version: version + 1});
  await staff.req("/desk", undefined, 401);
  await owner.req(manageStaff, {action: "delete", version: version + 2});
  await owner.req(active, {active: true, version: version + 3}, 409);
  await owner.req(access, {primary: "SALES", roles: [], branch, version: version + 3}, 409);
  await owner.req(manageStaff, {action: "restore", version: version + 3});
  const login = new Client();
  await login.req("/session");
  await login.req("/login", {email, password}, 401);
  await owner.req(active, {active: true, version: version + 4});
  await new Client().login(email);
  console.log("Passed admin sample isolation, live record lifecycle, posted history, branch listings, review visibility and staff versioning.");
}
