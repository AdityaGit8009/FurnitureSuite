# APSP Furniture Studio

## Run the shop on Windows

Double-click **Run-Local.cmd** in File Explorer, or enter the following commands in Command Prompt. The launcher opens the shop in your browser and recognises an already-running instance.

```cmd
cd /d C:\APSP\FurnitureSuite
Run-Local.cmd
```

Use Java 21 or newer. On a fresh Git clone, install Node.js with npm and Maven 3.9+ so the launcher can build the missing JAR. The supplied local installation already has the JAR. Use the Windows account that saved the Gmail and Razorpay credentials when starting those integrations.

From PowerShell, use the commands below.

```powershell
Set-Location C:\APSP\FurnitureSuite
.\Start.ps1
```

Open [the shop](http://127.0.0.1:8174) on this computer. Leave PowerShell open while using the app. Press Ctrl+C there to stop it. React and the Spring Boot API share one server. Orders, inventory and settings persist in the local H2 database under `data/`. To build changes from source, stop the server, run `.\Build.ps1`, then run `.\Start.ps1` again.

**Owner login:** owner@apsp.local. The initial password is in data/owner-first-login.txt. Sign in and change the password from the account menu. You can enable email verification and save a backup recovery key. Keep the credential file private. Create staff from Workspace → Administration → Add staff. Customers create an account and then sign in with the email and password they registered. The first startup seeds 500 distinct catalogue SKUs with inventory for Central and North. Collections, sizes and finishes vary. The demo reuses five bundled sample photographs. Later startups preserve edits, orders and stock. A fictional customer, Ananya Sharma, has a saved delivery address, preferred showroom and two wishlist items. Open `data/demo-customer-login.txt` on this computer for the demo login.

## Working in the studio

The home collection shows five pieces per page in a single row. Swipe the row on a phone, or use **Next** and **Previous** to change pages. The footer links to the collection, room builder, recent pieces, customer profile, tracking and showroom contacts.

In the owner or branch Admin workspace, choose **Demo data** to practice with orders, leads, purchasing, stock, dispatch, accounting and the other modules. Sample changes persist in H2. Choose **Live data** to work with the actual showroom. Tables support search, column sorting, row counts and paging. In trial balances, journals, demand reports, branch inventory and the product catalogue, **Export CSV** downloads all rows matching the current filters across every page. The file opens in spreadsheet applications with Indian currency, multiline notes and leading phone prefixes preserved. Eligible records offer edit, enable, disable, delete and restore. Use the order, return or journal workflow for financial adjustments. The sidebar and content have independent scrolling.

For two-step sign-in, open **Account settings → Enable email verification**, confirm your password and enter the six digits emailed to you. Future sign-ins ask for a code after the password. **Recover account** sends a separate email code. Codes expire after ten minutes. Resend becomes available after one minute. For the bootstrap owner login, codes go to the configured showroom mailbox. Other accounts use their own email address.

For a ₹100 sandbox payment without an SMS, choose **Netbanking**, select a bank and choose **Success** on the mock bank page. Check for a **Captured** test receipt. A Pay Later eligibility prompt belongs to the payment provider. [Razorpay test payments](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/)

## Project structure

| Path | Contents |
| --- | --- |
| `src/main/java/in/apsp/suite/` | Spring Boot controllers, account security, catalogue, CRM, inventory, fulfilment, ledger and payment services |
| `src/main/resources/schema.sql` | Embedded H2 tables, indexes and startup migrations |
| `ui/src/` | React storefront, account, workspace, site editor and shared tables |
| `ui/public/` | Images bundled with the shop |
| `src/main/resources/static/` | Packaged browser assets, rebuilt by `ui/build.mjs` |
| `src/test/java/` and `ui/test-*` | Backend, browser, workflow and local SMTP regression checks |
| `Run-Local.cmd`, `Start.ps1`, `Build.ps1` | Windows launcher and build scripts |

## Local database

Spring Boot opens embedded H2 when you run the app. On the first start it creates `C:\APSP\FurnitureSuite\data\furniture.mv.db`, runs `src/main/resources/schema.sql` and seeds the demo catalogue and accounts. Later starts reopen the same file. Keep the `data` folder when rebuilding or updating the application. The packaged app runs on Java 21 or newer. Node/npm and Maven are used to rebuild the source.

The current SQL and backup commands target H2. Running on MySQL would require a MySQL driver, compatible schema and query migrations, and a tested transfer of existing records.

## Try the main processes

1. Ready stock: browse or scan/search a SKU, choose branch, compare dimensions, use the 3D preview or room planner, add items to the bag, and enter address and pincode. The product detail has a mouse-following magnifier, mobile tap-and-drag zoom and a full-size image link. **Buy now** purchases one piece and keeps the shopping bag intact. **Shopping bag → Checkout** purchases the selected quantities. Choose Razorpay or pay on delivery. A confirmed order reserves stock. Staff can record a collection, pack, dispatch all or part, confirm delivery, print the sales invoice and record installation. The same checkout supports showroom sales.
2. Custom work: request a quote, contact and qualify the lead, record measurements, cost the design and issue a quote. Costed discounts over 10% require a second manager. The customer accepts the current quote to create a sales order and workshop job. Collect an advance, plan the material list, issue stock, cut, assemble, finish and perform QC. Rework or release the finished item for delivery.
3. Purchasing: raise a PO request, have a second authorised person approve it, order, inspect, record partial receipts, match the supplier invoice and post payment. For a stock transfer the source branch issues stock and the destination receives it. Physical counts distinguish available, damaged and display units and require independent approval.
4. After-sales: start a ticket against an order. For a delivered item open a line-specific return, inspect the affected units, approve the disposition and record the settled refund. The credit and net collections update the customer's balance.
5. Dispatch and finance: register a vehicle and book an order, crew, date and cargo volume. Split shipments track line quantities. Match bank entries, post expenses, inspect the balanced general ledger and close past accounting periods.
6. CRM and planning: assign appointments, track lead source, budget, priority and follow-ups, view pipeline stages, activate a campaign for consenting customers, receive in-app updates, and review demand, shortages and delivered-order contribution.

## Catalogue, feedback and customer tracking

- In **Collection**, pick a showroom and category. Combine keywords, SKU, finish, price, width and in-stock filters. Sort the results or go to another catalogue page. Product details let shoppers compare finishes within a collection and inspect the photograph.
- In **Workspace → Product catalogue**, branch Admins manage their own listings. Super Admin can select either branch. Create a SKU with opening stock, edit its display details or hide it from the storefront. A branch can request a master price change, which Super Admin can approve in **Price approvals**. Checkout reads the current listing and available stock. Earlier orders retain their original line prices.
- Open a product and choose **Write a product review**. A returning customer can edit their rating and text. Reviews enter **Workspace → Product reviews** for moderation. Branch Admin and Super Admin can choose **Edit and moderate**, supply a reason and publish or decline the review. Customer edits go back for approval. A delivered or installed purchase earns the verified-purchase label. The original rating and text are available to moderators.
- Sign in as a customer and open **Profile → Track an order**, or visit [order tracking](http://127.0.0.1:8174/track-order). Select an order to see packing, dispatch, delivery and installation, shipment references, item quantities and any booked window. Updates refresh while tracking is open. For made-to-order furniture, tracking also includes workshop progress from the linked production job. Tracking uses showroom dispatch events. GPS and carrier ETA need a carrier integration.
- Staff with customer access can search **Workspace → Customer history** by name, email or phone. Open a customer to see branch- and role-permitted leads, orders, reviews, tickets and returns. The order number matches the sales, inventory and accounting records.
- Super Admin can open **Workspace → Administration → Team access → Manage roles** to choose a staff member’s showroom, primary role and additional roles. Saving a change invalidates earlier sessions. Sign in again, then use **Your account → Active staff role** to switch roles within the same 24-hour login.

## Furniture buying tools

**Delivery fit** is available under **Will it fit through my door?** on each product. Enter the narrowest opening, lift interior if applicable and clearance allowance. The check evaluates rectangular orientations with a common orientation through the opening and lift, and respects upright-only shipping instructions. Sharp turns, stairs and narrow routes can be referred to the showroom. Staff enter up to eight measured cartons per SKU and branch under **Product catalogue → Shipping cartons**. Until then, the catalogue size gives an unpacked reference. Room & Board’s delivery guide identifies doorway, elevator and stair measurements relevant to furniture delivery. [Measuring for delivery](https://www.roomandboard.com/customer-service/measuring-for-delivery)

A signed-in customer can save dimensions or request a measurement. The latter creates a linked CRM enquiry for the showroom. At checkout the customer may share matching saved measurements for the current delivery address. Dispatch then sees a snapshot on the order. If staff revised packing dimensions after the customer’s check, the order asks for a recheck.

**Build a room within budget** is next to the room layout planner in **Collection**. You can also [open the room builder directly](http://127.0.0.1:8174/?tool=room-budget). Enter a furniture budget and optional finish for a living room, four-seat dining set or bedroom reading corner. Recommendations favour matching collections and finishes and compare total merchandise prices across the available quantities at the selected showroom. Adding a set rechecks the current prices and inventory together. Checkout applies delivery costs, services and promotions. IKEA India’s coordinated dining sets informed the table-and-four-chairs option. [Budget dining sets](https://www.ikea.com/in/en/rooms/dining/affordable-room-sets-dining-sets-pub077392b0/)

## Access and security

Super Admin, branch Admin, Customer, Sales, Cashier, Designer, Purchase, Warehouse, Production, Delivery, Accountant, Support and Marketing have separate permissions. Customer access is scoped by ownership. Branch checks apply to staff. Designers and delivery staff receive assigned records. A completed sign-in issues a cryptographically random, HttpOnly cookie token with a fixed 24-hour expiry. The database stores its SHA-256 digest. A browser can reopen the app and the server can restart during those 24 hours. Signing out revokes the token. Password changes, recovery and access changes invalidate earlier logins. CSRF checks also apply to authenticated mutations. Before sign-in the servlet session binds CSRF and pending email verification to the requesting browser. BCrypt passwords, login throttling, optional two-step sign-in by email, private attachments and audit events are supported.

## Integrations

**Razorpay:** supply RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET, then configure a public HTTPS payment.captured webhook at /payments/razorpay/events. The backend validates the signature and amount, deduplicates captured payments and logs mismatches for reconciliation. Manual collection and COD work without gateway credentials. A refund entry records a refund already settled through the bank or gateway. Live settlement requires configuration and verification with your merchant account. [Standard Checkout](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/) · [Webhook verification](https://razorpay.com/docs/webhooks/validate-test/).

**Shop contacts and email:** The storefront offers email at apratap5449@gmail.com and click-to-chat WhatsApp at +91 7390916220. Transactional alerts use email in place of SMS. New order and enquiry alerts for the shop go to its Gmail address. Customer confirmations, status changes, campaigns and restock alerts are addressed to the respective customer's email. Marketing consent is checked at dispatch.

**Enable Gmail delivery:** Sign in as Super Admin and open Workspace → Administration → Connect Gmail. Enter your Studio password and a Google App Password locally. The app checks the SMTP connection using mandatory STARTTLS and keeps the credential in server memory until restart. For Windows startup, run `.\Start-With-Email.ps1 -SaveOnly` and enter the App Password in the masked prompt. Start or restart with `.\Start.ps1`. The credential is encrypted for the Windows account that saved it. In Administration, **Check SMTP connection** verifies authentication. APSP_GMAIL_APP_PASSWORD remains supported as a server environment setting. Gmail SMTP defaults to port 587. Do not put the credential in source files. See [Google App Passwords](https://support.google.com/accounts/answer/185833).

Messages remain queued until a transport is configured. SMTP takes priority over the optional HTTPS relay. If using that adapter, honor channel=email and deduplicate by Idempotency-Key; APSP_NOTIFICATION_URL and APSP_NOTIFICATION_SECRET configure it. Failed deliveries back off and enter review after five attempts. WhatsApp opens a conversation with the shop. Automatic WhatsApp template delivery requires separate Business API onboarding.

## Customer accounts and orders

Sign in and open your name in the header or visit `/profile`. Save your name, phone, delivery address, pincode and preferred showroom. Checkout uses those values as editable defaults. **My orders** opens each order, its timeline and payment receipts. **Account settings** contains sign-out, password, marketing consent and email verification controls.

In **Workspace → Sales orders**, a branch Admin can filter orders by stage or payment status, open an order, record a collection, and use its workflow actions to pack, dispatch, deliver, install or cancel an eligible order. Super Admin can filter across showrooms. Customer order history reflects these changes.

## Site studio and appearance

The settings tab halfway down the right edge changes the local theme and catalogue density. Atelier, Ocean, Terracotta, Orchid, Midnight and Graphite work on the storefront and staff workspace. Appearance is saved in the current browser. Choose Standard, Large or Extra large under Text size to resize text across the shop and workspace.

Go to **Workspace → Site studio**. A branch Admin can create, preview, publish and unpublish pages for their branch. Super Admin can also publish across all showrooms. Add and reorder hero, text, FAQ, collection, action and contact sections. Each section supports left, centre or right text alignment in the preview and published page. Saving a draft leaves the published version in place. Use version history to restore an earlier publication into the editor. Published pages have shareable URLs of the form `/?page=central-guide`.

**Email templates** controls the subject and plain-text body by event. Preview with sample values before saving. Branch templates override the all-showroom template, then the built-in default. Keep `{{message}}` in the body to include the transaction update. Templates affect both SMTP and the external email relay. Gmail credentials remain in Administration.

**Feature lab** lets Super Admin create and enable curated SKU shelves, community polls and custom service-request forms, and toggle discovery, questions and sharing. Polls allow one current vote per account. Customers follow submitted requests in My activity. Staff review requests and answer product questions from Customer inbox. Custom features use these supported types; integrating a new payment network or a new kind of executable module requires application development.

**Shopping tools** include shareable product links, recently viewed items, branch-specific best sellers derived from orders, target-price alerts/history, reorder from a previous order and a pincode check. In Delivery windows, publish future dates, times and capacity for each showroom. Checkout reserves a slot atomically; cancelling an eligible order frees it. These windows describe the shop's own schedule.

## Razorpay merchant test mode

1. Sign in to the Razorpay Dashboard as an owner/admin. Select **Test Mode**. Open **Account & Settings → Website and app settings → API Keys → Generate Key**. Save the Key ID and Key Secret when shown. [Official key guide](https://razorpay.com/docs/payments/dashboard/account-settings/api-keys/).
2. In the local application open **Workspace → Site studio → Razorpay test** as Super Admin. Enter your Studio password and the test credentials. The server checks the keys with Razorpay and keeps them in memory for this run. For automatic loading across restarts on Windows, run `.\Set-TestPayments.ps1` once, enter the credentials at its prompts, and start the app with `.\Start.ps1`. The secret is encrypted for the current Windows account. The server also accepts RAZORPAY_TEST_KEY_ID and RAZORPAY_TEST_KEY_SECRET in its environment. Open the dedicated local test page at **http://127.0.0.1:8174/razorpay-test**. The Super Admin can run the sandbox checkout and review or resume its receipts on that page.
3. Click **Run ₹100 test payment**. Complete Razorpay's simulated checkout. The server verifies the merchant signature, fetches the payment, and matches its order ID, amount and currency. If it is authorised but not yet captured, refresh the receipt status. Local test checkout uses a browser callback and an outbound provider API call; a public webhook is unnecessary.
4. The customer checkout also uses the configured test credentials when live payment is disabled. **Place order and pay** opens Razorpay with the server-calculated outstanding balance, including shipping and discounts. The customer can reopen the order to resume a pending attempt or check the receipt after a lost callback. Test receipts appear in the order and in the admin payment filter. Only real collections affect the cash ledger. Ready-stock orders still reserve inventory when placed. Real online collections require live keys and the signed capture webhook.

## Build and verify

Use Build.ps1 with Java 21+, Maven 3.9+ and Node/npm. It installs locked UI dependencies, creates the production bundle and packages it in target/furniture-suite-1.0.0.jar. Stop a running instance before rebuilding the same JAR on Windows.

From `ui/` run `node test-flows.mjs` after packaging. This exercises checkout, CRM and ERP workflows, catalogue seeding, pricing, private tracking, review moderation and staff authorization with an isolated temporary database and port. Run `python test-email.py` with `APSP_JAVA` set to the installed JDK executable to check routing and template delivery against the local test SMTP server. APSP_JAVA can name the real JDK executable. APSP_BROWSER can name an installed Chrome/Chromium executable for browser checks.

## Backup and restore

Stop the server. From the project directory run:

    java -jar target/furniture-suite-1.0.0.jar --backup showroom-backup.apsp
    java -jar target/furniture-suite-1.0.0.jar --restore showroom-backup.apsp data/restored-furniture

Use a separate backup passphrase of 16+ characters, supplied at the console or via APSP_BACKUP_PASSWORD. Each archive path and restore database must be new. To inspect the restored database, set SPRING_DATASOURCE_URL to jdbc:h2:file:./data/restored-furniture before launch. Backups use AES-GCM. Protect the live database using restricted filesystem access and device encryption.

## Deployment scope

The default listener is local. APSP_HOST and APSP_PORT override the address and port. A public deployment needs TLS, secure cookies (APSP_HTTPS=true), monitoring, off-machine backups and a security/load review. APSP_OWNER_PASSWORD optionally supplies the first owner password. The default architecture uses one server instance.

The AR models show approximate shapes at catalogue scale; real-device AR requires compatible hardware and HTTPS. Demand planning projects the last 30 days of order quantities. Dispatch planning checks capacity and dates; traffic-aware route optimisation requires maps integration. The sample invoice is a sales document; GST/e-invoicing integration, external immutable audit storage, supplier outsourcing automation and enterprise retention policies are outside the delivered local workflows. Sample product imagery is bundled from Unsplash.