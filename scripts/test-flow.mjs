// End-to-end flow test — drives the real UI in Chrome like a user and checks
// every button lands on the right screen. Run the app first (npm run dev), then:
//   node scripts/test-flow.mjs
import puppeteer from "puppeteer-core";

const B = process.env.NAJM_URL || "http://localhost:3000";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`);
  ok ? pass++ : fail++;
};

async function newSession(body = {}) {
  const r = await fetch(`${B}/api/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}
async function getReport(id) {
  return (await fetch(`${B}/api/report/${id}`)).json();
}

const clickText = (page, t) =>
  page.evaluate((t) => {
    const els = [...document.querySelectorAll("button,[role=button],[role=option],label,a,span,div")];
    const el = els.reverse().find((e) => e.textContent && e.textContent.trim() === t);
    if (el) { el.click(); return true; }
    return false;
  }, t);
const bodyText = (page) => page.evaluate(() => document.body.innerText);
const has = async (page, re) => re.test(await bodyText(page));

// Fill the shared details form: 3 Radix selects (first option) + 5 text inputs.
async function fillDetails(page) {
  const n = await page.$$eval("[role=combobox]", (e) => e.length);
  const triggerText = (i) =>
    page.$$eval("[role=combobox]", (els, i) => els[i]?.textContent.trim() || "", i);
  for (let i = 0; i < n; i++) {
    // Radix selects re-render/detach and leave a dismissing overlay after the
    // previous select — open, pick, then VERIFY the value changed; retry if not.
    for (let attempt = 0; attempt < 6; attempt++) {
      const before = await triggerText(i);
      await page.keyboard.press("Escape"); // clear any lingering overlay
      await wait(150);
      const combos = await page.$$("[role=combobox]");
      await combos[i].evaluate((el) => el.scrollIntoView({ block: "center" }));
      await combos[i].click();
      try {
        await page.waitForSelector("[role=option]", { timeout: 1500 });
      } catch {
        continue;
      }
      const opt = await page.$("[role=option]");
      await opt.click();
      await wait(300);
      const after = await triggerText(i);
      if (after && !after.toLowerCase().startsWith("select") && after !== before) break;
    }
  }
  await page.evaluate(() => {
    const set = (el, v) => {
      const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      d.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    for (const el of document.querySelectorAll("input")) {
      const ph = (el.placeholder || "").toLowerCase();
      if (el.type === "checkbox" || el.type === "file") continue;
      if (ph.includes("number") && el.inputMode === "numeric") set(el, "1234");
      else if (ph.includes("identity number")) set(el, "1023456789");
      else if (ph.includes("full name")) set(el, "Tester");
      else if (el.type === "tel") set(el, "0551234567");
      else if (el.type === "email") set(el, "t@x.com");
    }
  });
  await wait(300);
  await page.evaluate(() => {
    const c = document.querySelector("input[type=checkbox]");
    if (c && !c.checked) c.click();
  });
  await wait(300);
}

async function run() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  try {
    const s = await newSession({
      partyA: { vehicle: { number: "1234" }, driver: { mobile: "0551234567" } },
      partyB: { driver: { mobile: "0509876543" } },
    });
    const reportId = s.reportId;
    const slugA = s.partyA.url.split("/r/")[1];
    const slugB = s.partyB.url.split("/r/")[1];
    console.log(`\n── Report ${reportId} ──\n`);

    // ========== PARTY A ==========
    console.log("PARTY A");
    const ctxA = await browser.createBrowserContext();
    const pA = await ctxA.newPage();
    const errsA = [];
    pA.on("pageerror", (e) => errsA.push(String(e)));
    await pA.goto(`${B}/r/${slugA}`, { waitUntil: "networkidle0" });
    await wait(400);

    check("A: language gate shows", await has(pA, /العربية|English/));
    await clickText(pA, "English");
    await wait(500);
    check("A: gate → triage (injuries question)", await has(pA, /injuries/i));

    // injuries YES → inline 911, same page
    const urlBefore = pA.url();
    await clickText(pA, "Yes");
    await wait(400);
    check("A: injuries Yes → inline 911 (no redirect)", (await has(pA, /Call emergency 911/i)) && pA.url() === urlBefore);
    check("A: injuries Yes hides role choice", !(await has(pA, /which driver is reporting/i)));

    // back to No
    await clickText(pA, "No");
    await wait(300);
    check("A: injuries No → role choice returns", await has(pA, /which driver is reporting/i));

    // not agreed → inline notice
    await clickText(pA, "Not agreed upon");
    await wait(300);
    check("A: 'Not agreed' → inline notice (same page)", (await has(pA, /traffic police/i)) && pA.url() === urlBefore);

    // pick a real role
    await clickText(pA, "Driver who caused the traffic accident");
    await wait(300);
    const nextDisabled = await pA.evaluate(() => {
      const btns = [...document.querySelectorAll("button.cta-premium")];
      return btns.length ? btns[btns.length - 1].disabled : null;
    });
    check("A: Next enabled after role chosen", nextDisabled === false);

    await clickText(pA, "Next");
    await wait(600);
    check("A: Next → details+accident form", (await has(pA, /VEHICLE DETAILS|Vehicle Details/i)) && (await has(pA, /ACCIDENT DETAILS|Accident/i)));

    await fillDetails(pA);
    await clickText(pA, "Submit report");
    await wait(1500);
    check("A: Submit → done screen", await has(pA, /report was submitted|report is complete/i));
    check("A: done shows Party B link", await has(pA, /Party B link|192\.168|\/r\//i));
    check("A: no page errors", errsA.length === 0, errsA[0] || "");
    const afterA = await getReport(reportId);
    check("A: report status = partyA_done", afterA.status === "partyA_done", afterA.status);
    await ctxA.close();

    // ========== PARTY B ==========
    console.log("\nPARTY B");
    const ctxB = await browser.createBrowserContext();
    const pB = await ctxB.newPage();
    const errsB = [];
    pB.on("pageerror", (e) => errsB.push(String(e)));
    await pB.goto(`${B}/r/${slugB}`, { waitUntil: "networkidle0" });
    await wait(400);
    await clickText(pB, "English");
    await wait(500);
    check("B: shows Party A read-only + own form", (await has(pB, /Party A/i)) && (await has(pB, /VEHICLE DETAILS|Vehicle Details/i)));
    check("B: Party B tel prefilled from call", await pB.evaluate(() => {
      const el = document.querySelector("input[type=tel]");
      return !!el && el.value === "0509876543";
    }));
    await fillDetails(pB);
    await clickText(pB, "Submit report");
    await wait(1500);
    check("B: Submit → done (complete)", await has(pB, /complete|submitted/i));
    check("B: no page errors", errsB.length === 0, errsB[0] || "");
    const afterB = await getReport(reportId);
    check("B: report status = complete", afterB.status === "complete", afterB.status);
    await ctxB.close();

    console.log(`\n── ${pass} passed, ${fail} failed ──`);
    process.exitCode = fail ? 1 : 0;
  } finally {
    await browser.close();
  }
}
run();
