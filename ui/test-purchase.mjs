import assert from "node:assert/strict";

export async function signIn(page, email, password) {
  await page.getByRole("button",{name:"Sign in",exact:true}).click();
  const dialog=page.getByRole("dialog");
  await dialog.getByLabel("Email",{exact:true}).fill(email);
  await dialog.getByLabel("Password",{exact:true}).fill(password);
  await dialog.getByRole("button",{name:"Sign in",exact:true}).click();
  await dialog.waitFor({state:"hidden"});
}

export async function purchaseBrowser(browser, base, password) {
  const buyer=await browser.newContext();
  const manager=await browser.newContext();
  try{
    const page=await buyer.newPage();
    await page.goto(base+"/profile");
    await signIn(page,"a@example.com",password);
    await page.getByRole("button",{name:"Edit profile"}).click();
    await page.getByLabel("Default delivery address").fill("Fixture street, Central showroom");
    await page.getByLabel("Default pincode").fill("110001");
    await page.getByRole("button",{name:"Save profile"}).click();
    await page.getByText("Fixture street, Central showroom 110001",{exact:true}).waitFor();
    const token=(await buyer.cookies()).find(c=>c.name==="APSP_AUTH");
    assert.ok(token.httpOnly && token.expires*1000>Date.now()+86_000_000);
    assert.equal(await page.evaluate(()=>document.cookie.includes("APSP_AUTH")),false);
    await page.reload();await page.getByRole("heading",{name:"My orders"}).waitFor();
    await page.getByRole("button",{name:"Collection",exact:true}).click();
    await page.getByRole("button",{name:"Add Forma lounge chair",exact:true}).click();
    await page.getByRole("button",{name:"Atelier accent chair",exact:true}).first().click();
    await page.waitForFunction(()=>{const el=document.querySelector(".zoom-detail img");return el?.naturalWidth>0 && el.clientWidth>100;});
    const detail=page.locator(".zoom-detail img");
    const width=await detail.evaluate(e=>e.clientWidth);
    await page.getByRole("button",{name:"Reduce photo zoom"}).click();
    assert.ok(await detail.evaluate(e=>e.clientWidth)<width);
    await page.setViewportSize({width:390,height:844});
    await page.getByRole("button",{name:"Inspect product photo"}).click();
    assert.ok(await page.locator(".zoom-detail").isVisible());
    const photo = page.getByRole("button", { name: "Reset photo view" });
    await photo.focus();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").getByRole("button", { name: "Buy now" }).waitFor();
    const inspect = page.getByRole("button", { name: "Inspect product photo" });
    assert.equal(await inspect.evaluate((node) => node === document.activeElement), true);
    await inspect.click();
    await page.getByRole("button",{name:"Reset photo zoom"}).click();
    await page.getByRole("button",{name:"Buy now",exact:true}).click();
    assert.match(await page.getByLabel("Recipient, phone and delivery address").inputValue(),/Fixture street/);
    assert.equal(await page.getByLabel("Delivery pincode").inputValue(),"110001");
    await page.getByRole("button",{name:"Confirm order"}).click();
    const title=page.getByRole("dialog").getByRole("heading",{name:/Furniture order #/});
    await title.waitFor();
    const order=Number((await title.innerText()).match(/#(\d+)/)[1]);
    await page.getByRole("button",{name:"Close dialog"}).click();
    await page.getByRole("button",{name:"Shopping bag (1)"}).waitFor();
    await page.getByRole("button",{name:"Shopping bag (1)"}).click();
    await page.getByRole("button",{name:"Checkout",exact:true}).click();
    await page.getByText("Forma lounge chair × 1",{exact:true}).waitFor();
    await page.getByRole("button",{name:"Close dialog"}).click();

    const staff=await manager.newPage();await staff.goto(base);await signIn(staff,"manager@test.local",password);
    await staff.getByRole("button",{name:"Workspace",exact:true}).click();
    await staff.getByRole("button",{name:"Sales orders",exact:true}).click();
    await staff.getByLabel("Filter payment status").selectOption("Pay on delivery");
    await staff.getByRole("button",{name:"Open record "+order,exact:true}).click();
    await staff.getByLabel("Workflow action").selectOption("PACKED");
    await staff.getByRole("button",{name:"Confirm Packed",exact:true}).click();
    await staff.locator(".recordmeta").getByText("Packed",{exact:true}).waitFor();
    await page.goto(base+"/profile");
    const row=page.getByRole("button",{name:new RegExp("Order #"+order+"\\b")});
    assert.match(await row.innerText(),/Packed/i);
    console.log("PASS: customer profile, persistent login, desktop and mobile zoom, Buy now, bag checkout, admin packing and customer order tracking.");
  }finally{await buyer.close();await manager.close();}
}