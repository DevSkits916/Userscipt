// ==UserScript==
// @name         FB Groups Joins Scanner -> CSV Export
// @namespace    devskits916
// @version      1.0.0
// @description  Continuously scans Facebook /groups/joins list, collects group name + URL, exports to CSV.
// @match        https://www.facebook.com/groups/joins/*
// @match        https://www.facebook.com/groups/joins/?*
// @run-at       document-idle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// ==/UserScript==

(() => {
  "use strict";

  /***********************
   * CONFIG
   ***********************/
  const STORE_KEY = "DEVSKITS_FB_GROUP_SCANNER_DATA_V1";
  const SCAN_INTERVAL_MS = 1500;      // how often we scan DOM for groups
  const SCROLL_INTERVAL_MS = 2500;    // how often we scroll down
  const SCROLL_STEP = 900;            // pixels per scroll tick
  const MAX_NAME_LEN = 180;

  /***********************
   * UTIL
   ***********************/
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function nowIso() {
    return new Date().toISOString();
  }

  function sanitizeName(name) {
    if (!name) return "";
    return String(name)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_NAME_LEN);
  }

  function normalizeGroupUrl(url) {
    if (!url) return "";
    try {
      const u = new URL(url, location.origin);
      // Strip FB tracking params
      u.searchParams.delete("__cft__");
      u.searchParams.delete("__tn__");
      u.searchParams.delete("ref");
      u.searchParams.delete("source");
      u.searchParams.delete("nav_source");
      u.searchParams.delete("epa");
      u.searchParams.delete("mibextid");
      // Normalize to canonical groups path
      // e.g. https://www.facebook.com/groups/123456789/
      // Keep pathname only, ensure trailing slash
      let path = u.pathname;
      // Sometimes links are like /groups/ID/?ref=...; keep /groups/ID/
      const m = path.match(/\/groups\/[^\/?#]+/i);
      if (m) path = m[0] + "/";
      return `${u.origin}${path}`;
    } catch {
      return url;
    }
  }

  function csvEscape(value) {
    const s = String(value ?? "");
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function toCsv(rows) {
    const header = ["name", "url", "firstSeen"];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push([csvEscape(r.name), csvEscape(r.url), csvEscape(r.firstSeen)].join(","));
    }
    return lines.join("\n");
  }

  function downloadText(filename, text, mime = "text/csv;charset=utf-8") {
    const blob = new Blob([text], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // iOS Safari is moody. Fallback to a temporary textarea + selection.
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        ta.style.top = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return !!ok;
      } catch {
        return false;
      }
    }
  }

  function loadStore() {
    try {
      const raw = GM_getValue(STORE_KEY, "");
      if (!raw) return { byUrl: {}, order: [] };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return { byUrl: {}, order: [] };
      if (!parsed.byUrl) parsed.byUrl = {};
      if (!parsed.order) parsed.order = [];
      return parsed;
    } catch {
      return { byUrl: {}, order: [] };
    }
  }

  function saveStore(store) {
    GM_setValue(STORE_KEY, JSON.stringify(store));
  }

  /***********************
   * FIND GROUP LINKS
   ***********************/
  function extractGroupCandidates() {
    // We look for anchors linking to /groups/...
    const anchors = Array.from(document.querySelectorAll('a[href*="/groups/"]'));
    const results = [];

    for (const a of anchors) {
      const href = a.getAttribute("href") || "";
      if (!href.includes("/groups/")) continue;

      // Exclude obviously irrelevant FB pages (discover, search, create, etc.)
      // We mainly want actual group pages like /groups/<id or slug>/
      const fullUrl = normalizeGroupUrl(href.startsWith("http") ? href : new URL(href, location.origin).href);
      if (!/\/groups\/[^\/]+\/$/i.test(fullUrl)) continue;

      // Get a name. Often FB has nested spans; innerText of anchor is usually ok.
      // But some links are icon-only; ignore empty.
      let name = sanitizeName(a.innerText);
      if (!name) {
        // Try aria-label if present
        name = sanitizeName(a.getAttribute("aria-label") || "");
      }
      if (!name) continue;

      results.push({ name, url: fullUrl });
    }

    // Deduplicate within this scan
    const seen = new Set();
    return results.filter((r) => {
      const k = r.url;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  /***********************
   * UI
   ***********************/
  function makeUI() {
    const box = document.createElement("div");
    box.id = "devskits-fb-groups-scanner";
    box.style.cssText = `
      position: fixed;
      right: 12px;
      bottom: 12px;
      width: 320px;
      max-width: calc(100vw - 24px);
      background: rgba(18,18,18,0.92);
      color: #fff;
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 12px;
      padding: 10px;
      font: 14px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      z-index: 2147483647;
      box-shadow: 0 8px 30px rgba(0,0,0,0.35);
      user-select: none;
    `;

    box.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <div style="font-weight:700;">FB Group Scanner</div>
        <button data-act="min" style="all:unset; cursor:pointer; padding:4px 8px; border-radius:8px; background:rgba(255,255,255,0.10);">–</button>
      </div>
      <div data-row="stats" style="margin-top:8px; color:rgba(255,255,255,0.85);">
        <div>Collected: <b data-k="count">0</b></div>
        <div>New last scan: <b data-k="new">0</b></div>
        <div>Status: <b data-k="status">idle</b></div>
      </div>

      <div data-row="controls" style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
        <button data-act="toggle" style="flex:1; min-width:120px; padding:8px 10px; border-radius:10px; border:0; cursor:pointer; background:#1b74e4; color:white; font-weight:700;">Start</button>
        <button data-act="export" style="flex:1; min-width:120px; padding:8px 10px; border-radius:10px; border:0; cursor:pointer; background:rgba(255,255,255,0.12); color:white; font-weight:700;">Export CSV</button>
        <button data-act="copy" style="flex:1; min-width:120px; padding:8px 10px; border-radius:10px; border:0; cursor:pointer; background:rgba(255,255,255,0.12); color:white; font-weight:700;">Copy CSV</button>
        <button data-act="clear" style="flex:1; min-width:120px; padding:8px 10px; border-radius:10px; border:0; cursor:pointer; background:rgba(255,70,70,0.18); color:white; font-weight:700;">Clear</button>
      </div>

      <div data-row="log" style="margin-top:10px; padding:8px; border-radius:10px; background:rgba(255,255,255,0.06); color:rgba(255,255,255,0.85); max-height:110px; overflow:auto; white-space:pre-wrap;"></div>
      <div style="margin-top:8px; font-size:12px; color:rgba(255,255,255,0.55);">
        Tip: leave this page open. It will scroll + collect as FB loads more.
      </div>
    `;

    document.body.appendChild(box);

    // drag
    let dragging = false, startX = 0, startY = 0, startRight = 0, startBottom = 0;
    const header = box.firstElementChild;
    header.style.cursor = "grab";

    header.addEventListener("pointerdown", (e) => {
      dragging = true;
      header.setPointerCapture(e.pointerId);
      startX = e.clientX;
      startY = e.clientY;
      startRight = parseFloat(box.style.right) || 12;
      startBottom = parseFloat(box.style.bottom) || 12;
      header.style.cursor = "grabbing";
    });

    header.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      box.style.right = Math.max(6, startRight - dx) + "px";
      box.style.bottom = Math.max(6, startBottom - dy) + "px";
    });

    header.addEventListener("pointerup", (e) => {
      dragging = false;
      header.releasePointerCapture(e.pointerId);
      header.style.cursor = "grab";
    });

    return box;
  }

  function uiSet(box, key, val) {
    const el = box.querySelector(`[data-k="${key}"]`);
    if (el) el.textContent = String(val);
  }

  function uiLog(box, msg) {
    const log = box.querySelector('[data-row="log"]');
    if (!log) return;
    const t = `[${new Date().toLocaleTimeString()}] ${msg}\n`;
    log.textContent = (t + log.textContent).slice(0, 4000);
  }

  /***********************
   * MAIN LOOP
   ***********************/
  let running = false;
  let scanTimer = null;
  let scrollTimer = null;

  const store = loadStore();

  function getRows() {
    return store.order.map((url) => store.byUrl[url]).filter(Boolean);
  }

  function addGroup(name, url) {
    const key = url;
    if (store.byUrl[key]) {
      // update name if it improved
      if (name && name.length > store.byUrl[key].name.length) store.byUrl[key].name = name;
      return false;
    }
    store.byUrl[key] = { name, url, firstSeen: nowIso() };
    store.order.push(key);
    return true;
  }

  function scanOnce(ui) {
    const candidates = extractGroupCandidates();
    let added = 0;

    for (const c of candidates) {
      if (!c.url || !c.name) continue;
      if (addGroup(c.name, c.url)) added++;
    }

    if (added > 0) {
      saveStore(store);
      uiLog(ui, `Added ${added} new group(s). Total now ${store.order.length}.`);
    }

    uiSet(ui, "count", store.order.length);
    uiSet(ui, "new", added);
    return added;
  }

  async function start(ui) {
    if (running) return;
    running = true;
    uiSet(ui, "status", "running");

    // Initial scan
    scanOnce(ui);

    scanTimer = setInterval(() => {
      try { scanOnce(ui); } catch (e) { uiLog(ui, `Scan error: ${e?.message || e}`); }
    }, SCAN_INTERVAL_MS);

    scrollTimer = setInterval(() => {
      try {
        // Scroll down to force load more groups
        window.scrollBy(0, SCROLL_STEP);
      } catch (e) {
        uiLog(ui, `Scroll error: ${e?.message || e}`);
      }
    }, SCROLL_INTERVAL_MS);

    uiLog(ui, "Started scanning + scrolling.");
  }

  function stop(ui) {
    running = false;
    uiSet(ui, "status", "stopped");
    if (scanTimer) clearInterval(scanTimer);
    if (scrollTimer) clearInterval(scrollTimer);
    scanTimer = null;
    scrollTimer = null;
    uiLog(ui, "Stopped.");
  }

  function clearData(ui) {
    store.byUrl = {};
    store.order = [];
    saveStore(store);
    uiSet(ui, "count", 0);
    uiSet(ui, "new", 0);
    uiLog(ui, "Cleared saved data.");
  }

  function exportCsv(ui) {
    const rows = getRows();
    const csv = toCsv(rows);
    const filename = `fb_groups_${new Date().toISOString().slice(0,10)}.csv`;
    downloadText(filename, csv);
    uiLog(ui, `Exported CSV (${rows.length} rows).`);
  }

  async function copyCsv(ui) {
    const rows = getRows();
    const csv = toCsv(rows);
    const ok = await copyToClipboard(csv);
    uiLog(ui, ok ? `Copied CSV to clipboard (${rows.length} rows).` : "Clipboard copy failed (thanks, iOS). Try Export CSV.");
  }

  /***********************
   * INIT
   ***********************/
  function init() {
    const ui = makeUI();
    uiSet(ui, "count", store.order.length);
    uiSet(ui, "new", 0);
    uiSet(ui, "status", "idle");
    uiLog(ui, "Loaded. Ready.");

    const btnToggle = ui.querySelector('[data-act="toggle"]');
    const btnExport = ui.querySelector('[data-act="export"]');
    const btnCopy = ui.querySelector('[data-act="copy"]');
    const btnClear = ui.querySelector('[data-act="clear"]');
    const btnMin = ui.querySelector('[data-act="min"]');

    btnToggle.addEventListener("click", async () => {
      if (!running) {
        btnToggle.textContent = "Stop";
        btnToggle.style.background = "rgba(255,255,255,0.12)";
        btnToggle.style.color = "#fff";
        await start(ui);
      } else {
        btnToggle.textContent = "Start";
        btnToggle.style.background = "#1b74e4";
        btnToggle.style.color = "#fff";
        stop(ui);
      }
    });

    btnExport.addEventListener("click", () => exportCsv(ui));
    btnCopy.addEventListener("click", () => copyCsv(ui));

    btnClear.addEventListener("click", () => {
      stop(ui);
      btnToggle.textContent = "Start";
      btnToggle.style.background = "#1b74e4";
      btnToggle.style.color = "#fff";
      clearData(ui);
    });

    let minimized = false;
    btnMin.addEventListener("click", () => {
      minimized = !minimized;
      const rows = ["stats", "controls", "log"];
      for (const r of rows) {
        const el = ui.querySelector(`[data-row="${r}"]`);
        if (el) el.style.display = minimized ? "none" : "";
      }
      btnMin.textContent = minimized ? "+" : "–";
    });

    // Safety: if FB navigates within SPA, keep scanning
    uiLog(ui, "Note: FB is an SPA. If you navigate away, reload this page to keep scanning.");
  }

  // FB can take time to render; give it a moment
  (async () => {
    await sleep(1200);
    init();
  })();
})();
