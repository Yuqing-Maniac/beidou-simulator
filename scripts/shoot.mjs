import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    "--remote-debugging-port=9333",
    "--user-data-dir=/tmp/beidou-chrome",
    "--window-size=1280,800",
    "about:blank",
  ],
  { stdio: "ignore" },
);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function json(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

let ws;
class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.id = 0;
    this.pending = new Map();
    this.socket.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const tabs = await json("http://127.0.0.1:9333/json");
      const page = tabs.find((t) => t.type === "page");
      if (page) return page;
    } catch {}
    await sleep(200);
  }
  throw new Error("no chrome");
}

const AUDIT = `(() => {
  const bad = [];
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  for (const el of document.querySelectorAll("body *")) {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (r.right > vw + 2 || r.left < -2) {
      bad.push({ kind: "x", tag: el.tagName, cls: el.className?.toString?.().slice(0, 80), right: Math.round(r.right), left: Math.round(r.left) });
    }
    const clips = ["hidden", "clip", "auto"].includes(s.overflow) || ["hidden", "clip", "auto"].includes(s.overflowX);
    if ((s.overflowX === "hidden" || s.overflow === "hidden") && el.scrollWidth > el.clientWidth + 2) {
      bad.push({ kind: "clip", tag: el.tagName, cls: el.className?.toString?.().slice(0, 80), sw: el.scrollWidth, cw: el.clientWidth });
    }
  }
  const groups = [...document.querySelectorAll(".card")].map((el) => {
    const r = el.getBoundingClientRect();
    return { g: el.dataset.group, top: Math.round(r.top), bottom: Math.round(r.bottom), in: r.top >= 0 && r.bottom <= vh + 1 };
  });
  const wire = document.querySelector(".wire")?.getBoundingClientRect();
  return {
    vw, vh, dpr: window.devicePixelRatio,
    scrollH: document.documentElement.scrollHeight,
    groups,
    wire: wire && { top: Math.round(wire.top), bottom: Math.round(wire.bottom) },
    sentence: document.querySelector("#sentence")?.textContent?.slice(0, 80),
    bad: bad.slice(0, 25),
  };
})()`;

async function shot(cdp, name) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  const path = `${outDir}/${name}.png`;
  const fs = await import("node:fs");
  fs.writeFileSync(path, Buffer.from(data, "base64"));
  console.log("wrote", path);
}

try {
  const tab = await connect();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });
  const cdp = new Cdp(ws);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.send("Page.navigate", { url: "http://127.0.0.1:43123/" });
  await sleep(800);
  let audit = await cdp.send("Runtime.evaluate", { expression: AUDIT, returnByValue: true });
  const fit = await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const vh = window.innerHeight;
      const box = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), in: r.top >= -1 && r.bottom <= vh + 1 }; };
      const cards = [...document.querySelectorAll('.card')].map(el => ({g: el.dataset.group, h: Math.round(el.getBoundingClientRect().height), t: el.querySelector('h3')?.textContent}));
      const fields = [...document.querySelectorAll('.key-cols .field')].map(el => ({k: el.dataset.key, h: Math.round(el.getBoundingClientRect().height)}));
      return { vh, sentence: box('#sentence'), bits: box('#bits'), warn: box('[data-group="warn"]'), stream: box('.stream-grid'), parse: box('#parse'), scroll: document.documentElement.scrollHeight, cards, fields };
    })()`,
    returnByValue: true,
  });
  console.log("fit", JSON.stringify(fit.result.value));
  console.log("audit100", JSON.stringify(audit.result.value, null, 2));
  const heights = await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const card = document.querySelector('[data-group="nav"]');
      const rows = [...card.querySelectorAll('.field')].map(el => ({k: el.dataset.key, h: Math.round(el.getBoundingClientRect().height), t: el.innerText.slice(0,80)}));
      const cards = [...document.querySelectorAll('.card')].map(el => ({g: el.dataset.group, box: Math.round(el.getBoundingClientRect().height), scroll: el.scrollHeight}));
      return { cards, rows, note: card.querySelector('.note')?.getBoundingClientRect().height };
    })()`,
    returnByValue: true,
  });
  console.log("imu", JSON.stringify(heights.result.value, null, 2));
  await shot(cdp, "overview-1280x800");
  const fullH = Math.ceil(audit.result.value.scrollH);
  const full = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: 1280, height: fullH, scale: 1 },
  });
  const fs0 = await import("node:fs");
  fs0.writeFileSync(`${outDir}/overview-full.png`, Buffer.from(full.data, "base64"));
  console.log("wrote full", fullH);

  async function clipShot(expr, name) {
    const clipBox = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true });
    const png = await cdp.send("Page.captureScreenshot", { format: "png", clip: clipBox.result.value });
    const fs = await import("node:fs");
    fs.writeFileSync(`${outDir}/${name}.png`, Buffer.from(png.data, "base64"));
    console.log("wrote", name, JSON.stringify(clipBox.result.value));
  }
  await clipShot(
    `(() => { const r = document.querySelector('[data-group="warn"]').getBoundingClientRect(); return { x: 0, y: Math.max(0, r.top - 4), width: 1280, height: Math.ceil(r.height + 8), scale: 1 }; })()`,
    "warning-0102",
  );
  await clipShot(
    `(() => { const a = document.querySelector('.stream-head').getBoundingClientRect(); const b = document.querySelector('.stream-grid').getBoundingClientRect(); return { x: 0, y: Math.max(0, a.top - 4), width: 1280, height: Math.ceil(b.bottom - a.top + 8), scale: 1 }; })()`,
    "stream-parsed",
  );

  await cdp.send("Runtime.evaluate", { expression: `document.querySelector("#tab-proto").click(); window.scrollTo(0,0);` });
  await sleep(200);
  await shot(cdp, "protocol");

  await cdp.send("Runtime.evaluate", { expression: `document.querySelector("#tab-board").click(); window.scrollTo(0,0);` });
  await sleep(150);
  const clip = await cdp.send("Runtime.evaluate", {
    expression: `(() => { const r = document.querySelector(".toolbar").getBoundingClientRect(); return { x:0, y: Math.max(0, r.top-4), width: 1280, height: Math.ceil(r.height+8), scale: 1 }; })()`,
    returnByValue: true,
  });
  const { data: chipPng } = await cdp.send("Page.captureScreenshot", { format: "png", clip: clip.result.value });
  const fs = await import("node:fs");
  fs.writeFileSync(`${outDir}/datasets.png`, Buffer.from(chipPng, "base64"));
  console.log("wrote datasets");

  await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector("#tab-track").click(); document.querySelector("#track-kind").value="circle"; document.querySelector("#track-kind").dispatchEvent(new Event("change")); if (document.querySelector("#track-run").textContent !== "暂停运动") document.querySelector("#track-run").click();`,
  });
  await sleep(500);
  await shot(cdp, "track-circle");
  await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const kind = document.querySelector("#track-kind");
      kind.value = "path";
      kind.dispatchEvent(new Event("change"));
      document.querySelector("#track-clear").click();
      const c = document.querySelector("#track-map");
      const r = c.getBoundingClientRect();
      for (const [x, y] of [[180, 420], [520, 180], [900, 460], [240, 160]]) {
        c.dispatchEvent(new MouseEvent("click", { clientX: r.left + x, clientY: r.top + y, bubbles: true }));
      }
    })()`,
  });
  await sleep(300);
  await shot(cdp, "track-path");
  await cdp.send("Page.reload");
  await sleep(800);

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1.5,
    mobile: false,
  });
  await sleep(200);
  let audit15 = await cdp.send("Runtime.evaluate", { expression: AUDIT, returnByValue: true });
  console.log("audit150zoom", JSON.stringify(audit15.result.value.bad), "scroll", audit15.result.value.scrollH);
  await shot(cdp, "overview-150dpi");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 800,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await sleep(200);
  let audit2 = await cdp.send("Runtime.evaluate", { expression: AUDIT, returnByValue: true });
  console.log("audit150", JSON.stringify(audit2.result.value, null, 2));
  await shot(cdp, "overview-200dpi");
} finally {
  chrome.kill("SIGKILL");
}
