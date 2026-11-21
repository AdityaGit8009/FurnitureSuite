import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {signIn} from "./test-purchase.mjs";

export async function layoutTests(browser,base,password) {
  const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:"reduce"});
  try {
    const page=await ctx.newPage();
    await page.goto(base);
    await page.getByRole("heading",{name:"Furniture collection",exact:true}).waitFor();
    const openAppearance=()=>page.getByRole("button",{name:"Appearance settings",exact:true}).click();
    await openAppearance();
    await page.getByRole("radio",{name:"Extra large",exact:true}).check();
    await page.getByRole("button",{name:"Close dialog"}).click();
    await page.reload();
    await page.waitForFunction(()=>document.documentElement.dataset.textSize==="largest");
    assert.ok(await page.locator("html").evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=20));
    for(const width of [320,390,768,1280]) {
      await page.setViewportSize({width,height:844});
      await page.locator(".grid .card").first().waitFor();
      const measured=await page.evaluate(()=>{
        const groups=new Map();
        for(const card of document.querySelectorAll(".grid .card")){
          const top=Math.round(card.getBoundingClientRect().top),price=card.querySelector(".between b").getBoundingClientRect().bottom;
          if(!groups.has(top))groups.set(top,[]);groups.get(top).push(price);
        }
        return {width:document.documentElement.scrollWidth,viewport:innerWidth,priceDelta:Math.max(0,...[...groups.values()].map(g=>Math.max(...g)-Math.min(...g)))};
      });
      assert.ok(measured.width<=measured.viewport+1,"Page overflow at "+width+": "+JSON.stringify(measured));
      const cards=page.locator("#home-products .card");assert.equal(await cards.count(),5);
      assert.equal(await cards.evaluateAll(es=>new Set(es.map(e=>Math.round(e.getBoundingClientRect().top))).size),1);
      await page.getByRole("contentinfo").getByRole("link",{name:"Track an order"}).waitFor();
      assert.ok(measured.priceDelta<2,"Misaligned prices at "+width+": "+measured.priceDelta);
    }
    await page.goto(base+"/?sku=SF-101&tool=delivery-fit");
    await page.getByRole("button",{name:"Buy now",exact:true}).waitFor();
    assert.ok(await page.locator(".product-overview").evaluate(e=>e.scrollWidth<=e.clientWidth+1));
    await page.getByRole("button",{name:"Close dialog"}).click();
    await page.setViewportSize({width:390,height:844});
    await openAppearance();await page.getByRole("radio",{name:"Standard",exact:true}).check();await page.getByRole("button",{name:"Close dialog"}).click();
    await signIn(page,"owner@apsp.local",password);
    await page.getByRole("button",{name:"Workspace",exact:true}).click();await page.getByRole("button",{name:"Product catalogue",exact:true}).click();
    await page.locator(".listing-table tbody tr").first().waitFor();
    assert.equal(await page.locator(".listing-table tbody tr").first().evaluate(e=>getComputedStyle(e).display),"grid");
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.setViewportSize({width:1280,height:840});
    assert.equal(await page.locator(".listing-table td.numeric").first().evaluate(e=>getComputedStyle(e).textAlign),"end");
    const exportListings = page.getByRole("button", { name: "Export Product listings as CSV" });
    async function downloadListings() {
      const file = page.waitForEvent("download");
      await exportListings.click();
      const download = await file;
      assert.equal(download.suggestedFilename(), "product-listings.csv");
      return (await readFile(await download.path(), "utf8")).trim().split("\r\n");
    }
    const allListings = await downloadListings();
    assert.equal(allListings[0], '"Product","Price","Available","Visibility"');
    assert.ok(allListings.length > 21, "Export only included the visible page");
    const searchListings = page.getByPlaceholder("Name, SKU, category or finish");
    await searchListings.fill("SF-101");
    await page.waitForFunction(() => document.querySelectorAll(".listing-table tbody tr").length === 1);
    const filteredListings = await downloadListings();
    assert.equal(filteredListings.length, 2);
    assert.match(filteredListings[1], /SF-101/);
    await searchListings.fill("");
    const visitor=await browser.newContext({viewport:{width:390,height:844}});
    try {
      const guest=await visitor.newPage();
      await guest.goto(base+"/profile");await guest.getByRole("button",{name:"Sign in",exact:true}).click();
      const dialog=guest.getByRole("dialog");
      await dialog.getByRole("button",{name:/New customer/}).click();
      await dialog.getByLabel("Full name").fill("Studio Registration");
      const email="registration-ui@example.test";
      await dialog.getByLabel("Email",{exact:true}).fill(email);
      await dialog.getByLabel("Password (12+ characters)",{exact:true}).fill(password);
      await dialog.getByRole("button",{name:"Create account",exact:true}).click();
      await dialog.getByText("Account created. Enter your password to sign in.").waitFor();
      assert.equal(await dialog.getByLabel("Email",{exact:true}).inputValue(),email);
      assert.equal(await dialog.getByLabel("Password",{exact:true}).inputValue(),"");
      assert.equal((await visitor.cookies()).filter(c=>c.name==="APSP_AUTH").length,0);
      assert.equal(await guest.evaluate(async()=> (await (await fetch("/api/session")).json()).user),null);
      await dialog.getByLabel("Password",{exact:true}).fill(password);await dialog.getByRole("button",{name:"Sign in",exact:true}).click();
      await guest.getByRole("heading",{name:"Studio Registration",exact:true}).waitFor();
      await guest.getByRole("button",{name:/Saved pieces/}).click();await guest.getByRole("button",{name:"Show wishlist"}).waitFor();
      assert.equal(await guest.getByRole("button",{name:"Show wishlist"}).getAttribute("aria-pressed"),"true");
    } finally {await visitor.close();}
    await page.getByRole("button",{name:"Demo data",exact:true}).click();
    await page.getByRole("button",{name:"Sales orders",exact:true}).click();
    const region=page.getByRole("region",{name:"Demo records",exact:true});
    const first=region.getByRole("row").filter({hasText:"Moss sofa & ottoman"}).first();
    await first.getByRole("button",{name:"Edit",exact:true}).click();
    const dialog=page.getByRole("dialog");await dialog.getByLabel("Order",{exact:true}).fill("Browser sample order");await dialog.getByRole("button",{name:"Save changes"}).click();
    const changed=region.getByRole("row").filter({hasText:"Browser sample order"});await changed.getByRole("button",{name:"Disable",exact:true}).click();await changed.getByRole("button",{name:"Enable",exact:true}).click();
    await changed.getByRole("button",{name:"Delete",exact:true}).click();await dialog.getByRole("button",{name:"Delete record"}).click();
    await page.getByLabel("Demo record status").selectOption("Deleted");await changed.getByRole("button",{name:"Restore"}).click();await page.getByLabel("Demo record status").selectOption("Current");await changed.waitFor();
    await page.getByRole("button",{name:"Overview",exact:true}).click();
    await region.getByRole("button",{name:"Next rows"}).click();await region.getByRole("button",{name:"Previous rows"}).click();
    await region.getByRole("button",{name:"Sort by Record",exact:true}).click();await region.getByRole("searchbox").fill("Browser sample order");assert.equal(await region.locator("tbody tr").count(),1);
    await page.setViewportSize({width:1200,height:560});await region.getByRole("searchbox").fill("");
    const side=page.getByRole("complementary",{name:"Workspace navigation"});const box=await side.boundingBox();
    const coords=()=>page.evaluate(()=>[document.querySelector(".shell>aside").scrollTop,document.querySelector(".workspace").scrollTop,window.scrollY]);
    await page.locator(".workspace").evaluate(e=>e.scrollTop=0);await side.evaluate(e=>e.scrollTop=0);
    await page.mouse.move(box.x+50,box.y+40);for(let i=0;i<3;i++){await page.mouse.wheel(0,950);await page.waitForTimeout(120);}
    const [sideY,mainY,winY]=await coords();assert.ok(sideY>0);assert.equal(mainY,0);assert.equal(winY,0);
    await page.mouse.wheel(0,800);await page.waitForTimeout(150);assert.deepEqual(await coords(),[sideY,mainY,winY]);
    await page.setViewportSize({width:390,height:760});const mob=await side.boundingBox();await page.mouse.move(mob.x+50,mob.y+12);await page.mouse.wheel(550,0);await page.waitForTimeout(180);assert.ok(await side.evaluate(e=>e.scrollLeft)>0);assert.equal((await coords())[2],0);
    console.log("Passed manual registration, profile actions, demo lifecycle and independent desktop/mobile dashboard scrolling.");
    console.log("Passed persistent text size, aligned product prices at four widths, product details and responsive admin tables.");
  }finally{await ctx.close();}
}
