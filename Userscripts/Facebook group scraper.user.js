// ==UserScript==
// @name         Facebook Groups → CSV/JSON Exporter (Enhanced v3.0)
// @namespace    devskits916.fb.groups.csv
// @version      3.0.0
// @description  Advanced Facebook group discovery scraper with modern UI, draggable/resizable panel, theme toggle, better progress, filters, robust scanning, error resilience, and 2025 layout compatibility.
// @author       Calder (improved by AI assistant)
// @match        https://www.facebook.com/*groups*
// @match        https://m.facebook.com/*groups*
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // --------- State ---------
    const state = {
        items: new Map(), // key: groupKey, value: record
        autoscanTimer: null,
        autoscanEndAt: 0,
        isScanning: false,
        theme: 'dark',
        panelMinimized: false,
        settings: {
            autoStart: false,
            maxItems: 5000,
            exportFormat: 'csv',
            showProgress: true,
            minMembers: 0, // filter: min members (parsed as number)
            activityThreshold: '' // e.g., '1 day' or empty
        }
    };

    // --------- Storage ---------
    function loadSettings() {
        try {
            const saved = localStorage.getItem('fb-groups-scraper-settings-v3');
            if (saved) Object.assign(state.settings, JSON.parse(saved));
        } catch (e) { console.error('Load settings error:', e); }
    }

    function saveSettings() {
        try {
            localStorage.setItem('fb-groups-scraper-settings-v3', JSON.stringify(state.settings));
        } catch (e) { console.error('Save settings error:', e); }
    }

    // --------- UI Creation ---------
    function createPanel() {
        const panel = document.createElement('div');
        panel.id = 'fb-groups-scraper-panel';
        panel.innerHTML = `
            <div id="fb-groups-scraper-header" class="header">
                <div class="title">
                    <strong>📊 Groups Exporter</strong>
                    <span id="fb-groups-scraper-count">0</span>
                </div>
                <div class="controls">
                    <button id="fb-groups-scraper-theme" title="Toggle theme">🌙</button>
                    <button id="fb-groups-scraper-minimize" title="Minimize">_</button>
                    <button id="fb-groups-scraper-close" title="Close">✕</button>
                </div>
            </div>
            <div id="fb-groups-scraper-body" class="body">
                <div class="section buttons">
                    <button id="fb-groups-scraper-scan">Scan Visible</button>
                    <button id="fb-groups-scraper-autoscan">Auto-Scan (2min)</button>
                    <button id="fb-groups-scraper-export">Export</button>
                    <button id="fb-groups-scraper-copy">Copy</button>
                    <button id="fb-groups-scraper-clear">Clear</button>
                </div>

                <div class="section filters">
                    <label>Min members: <input type="number" id="fb-groups-scraper-minmembers" min="0" value="${state.settings.minMembers}"></label>
                    <select id="fb-groups-scraper-format">
                        <option value="csv">CSV</option>
                        <option value="json">JSON</option>
                    </select>
                </div>

                <div class="section progress-container">
                    <label><input type="checkbox" id="fb-groups-scraper-showprogress" ${state.settings.showProgress ? 'checked' : ''}> Show progress</label>
                    <div id="fb-groups-scraper-progress-bar" class="progress-bar"><div class="fill"></div></div>
                </div>

                <div id="fb-groups-scraper-status" class="status">Ready 🚀</div>
            </div>
        `;

        document.body.appendChild(panel);
        addStyles();
        attachEvents(panel);
        updateTheme();
        updateCount();
        updateProgress();
    }

    function addStyles() {
        GM_addStyle(`
            #fb-groups-scraper-panel {
                position: fixed;
                z-index: 999999;
                right: 20px;
                bottom: 20px;
                width: 360px;
                max-height: 80vh;
                background: var(--bg);
                color: var(--text);
                font-family: system-ui, sans-serif;
                font-size: 13px;
                border-radius: 14px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.5);
                padding: 0;
                overflow: hidden;
                transition: all 0.3s ease;
                resize: both;
            }
            #fb-groups-scraper-panel.minimized { height: 40px !important; }
            #fb-groups-scraper-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 14px;
                background: var(--header-bg);
                cursor: move;
                user-select: none;
            }
            #fb-groups-scraper-header .title { font-weight: bold; }
            #fb-groups-scraper-header .controls button {
                background: none;
                border: none;
                color: var(--text);
                font-size: 16px;
                cursor: pointer;
                padding: 4px;
                margin-left: 4px;
            }
            #fb-groups-scraper-body {
                padding: 12px;
                display: flex;
                flex-direction: column;
                gap: 10px;
                overflow-y: auto;
                max-height: calc(80vh - 40px);
            }
            .section.buttons { display: grid; grid-template-columns: repeat(3, 1fr) 1fr 1fr; gap: 6px; }
            .section.buttons button, .section.filters select, .section.filters input {
                padding: 8px;
                border-radius: 6px;
                border: 1px solid var(--border);
                background: var(--btn-bg);
                color: inherit;
                cursor: pointer;
            }
            .section.filters { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
            .section.filters label { white-space: nowrap; }
            .progress-container { display: flex; flex-direction: column; gap: 4px; }
            .progress-bar { height: 6px; background: var(--progress-bg); border-radius: 3px; overflow: hidden; opacity: 0; transition: opacity 0.3s; }
            .progress-bar.visible { opacity: 1; }
            .progress-bar .fill { height: 100%; background: var(--progress-fill); width: 0%; transition: width 0.4s; }
            .status { font-size: 12px; opacity: 0.9; min-height: 18px; }
            /* Themes */
            #fb-groups-scraper-panel.dark { --bg: rgba(30,30,30,0.98); --header-bg: rgba(20,20,20,0.98); --text: #eee; --border: rgba(255,255,255,0.15); --btn-bg: rgba(255,255,255,0.1); --progress-bg: rgba(0,255,0,0.2); --progress-fill: #4caf50; }
            #fb-groups-scraper-panel.light { --bg: rgba(255,255,255,0.98); --header-bg: rgba(240,240,240,0.98); --text: #111; --border: rgba(0,0,0,0.15); --btn-bg: rgba(0,0,0,0.05); --progress-bg: rgba(0,100,0,0.2); --progress-fill: #4caf50; }
        `);
    }

    function updateTheme() {
        const panel = document.getElementById('fb-groups-scraper-panel');
        if (panel) {
            panel.classList.toggle('dark', state.theme === 'dark');
            panel.classList.toggle('light', state.theme === 'light');
            document.getElementById('fb-groups-scraper-theme').textContent = state.theme === 'dark' ? '🌙' : '☀️';
        }
    }

    // --------- Event Attachment ---------
    function attachEvents(panel) {
        // Drag header
        const header = panel.querySelector('#fb-groups-scraper-header');
        let dragging = false, startX, startY, startRight, startBottom;
        header.addEventListener('pointerdown', e => {
            if (e.target.tagName === 'BUTTON') return;
            dragging = true;
            startX = e.clientX; startY = e.clientY;
            const rect = panel.getBoundingClientRect();
            startRight = window.innerWidth - rect.right;
            startBottom = window.innerHeight - rect.bottom;
            header.setPointerCapture(e.pointerId);
        });
        document.addEventListener('pointermove', e => {
            if (!dragging) return;
            panel.style.right = Math.max(0, startRight - (e.clientX - startX)) + 'px';
            panel.style.bottom = Math.max(0, startBottom - (e.clientY - startY)) + 'px';
        });
        document.addEventListener('pointerup', () => dragging = false);

        // Buttons
        panel.querySelector('#fb-groups-scraper-scan').onclick = () => {
            const added = scanPage();
            setStatus(`Scan done: +${added} new groups (${state.items.size} total)`);
        };

        panel.querySelector('#fb-groups-scraper-autoscan').onclick = () => {
            if (state.autoscanTimer) {
                clearInterval(state.autoscanTimer);
                state.autoscanTimer = null;
                setStatus('Auto-scan stopped');
                return;
            }
            state.autoscanEndAt = Date.now() + 120000; // 2 minutes
            state.isScanning = true;
            setStatus('🤖 Auto-scan started (2min)...');
            state.autoscanTimer = setInterval(() => {
                window.scrollBy(0, window.innerHeight);
                const added = scanPage();
                if (added > 0) setStatus(`Auto-scan: +${added} (${state.items.size} total)`);
                if (Date.now() > state.autoscanEndAt || state.items.size >= state.settings.maxItems) {
                    clearInterval(state.autoscanTimer);
                    state.autoscanTimer = null;
                    state.isScanning = false;
                    setStatus(`Auto-scan finished: ${state.items.size} groups`);
                }
            }, 2000);
        };

        panel.querySelector('#fb-groups-scraper-export').onclick = () => {
            const data = exportData(state.settings.exportFormat);
            downloadData(data, state.settings.exportFormat);
            setStatus(`Exported ${state.items.size} groups`);
        };

        panel.querySelector('#fb-groups-scraper-copy').onclick = async () => {
            const data = exportData(state.settings.exportFormat);
            try {
                await navigator.clipboard.writeText(data);
                setStatus('Copied to clipboard!');
            } catch {
                if (typeof GM_setClipboard === 'function') GM_setClipboard(data);
                setStatus('Copied via GM!');
            }
        };

        panel.querySelector('#fb-groups-scraper-clear').onclick = () => {
            if (confirm('Clear all collected groups?')) {
                state.items.clear();
                updateCount();
                updateProgress();
                setStatus('Data cleared');
            }
        };

        panel.querySelector('#fb-groups-scraper-theme').onclick = () => {
            state.theme = state.theme === 'dark' ? 'light' : 'dark';
            updateTheme();
        };

        panel.querySelector('#fb-groups-scraper-minimize').onclick = () => {
            state.panelMinimized = !state.panelMinimized;
            panel.classList.toggle('minimized', state.panelMinimized);
        };

        panel.querySelector('#fb-groups-scraper-close').onclick = () => panel.remove();

        panel.querySelector('#fb-groups-scraper-format').value = state.settings.exportFormat;
        panel.querySelector('#fb-groups-scraper-format').onchange = e => {
            state.settings.exportFormat = e.target.value;
            saveSettings();
        };

        panel.querySelector('#fb-groups-scraper-minmembers').onchange = e => {
            state.settings.minMembers = parseInt(e.target.value) || 0;
            saveSettings();
        };

        panel.querySelector('#fb-groups-scraper-showprogress').onchange = e => {
            state.settings.showProgress = e.target.checked;
            document.querySelector('.progress-bar').classList.toggle('visible', e.target.checked);
            saveSettings();
        };

        // Keyboard shortcuts
        document.addEventListener('keydown', e => {
            if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
            if (e.ctrlKey || e.metaKey) {
                switch (e.key.toLowerCase()) {
                    case 's': e.preventDefault(); panel.querySelector('#fb-groups-scraper-scan').click(); break;
                    case 'a': e.preventDefault(); panel.querySelector('#fb-groups-scraper-autoscan').click(); break;
                    case 'e': e.preventDefault(); panel.querySelector('#fb-groups-scraper-export').click(); break;
                }
            }
        });
    }

    function setStatus(msg) {
        const el = document.getElementById('fb-groups-scraper-status');
        if (el) el.textContent = msg;
    }

    function updateCount() {
        const el = document.getElementById('fb-groups-scraper-count');
        if (el) el.textContent = state.items.size.toLocaleString();
    }

    function updateProgress() {
        const pct = Math.min(100, (state.items.size / state.settings.maxItems) * 100);
        const fill = document.querySelector('.progress-bar .fill');
        if (fill) fill.style.width = pct + '%';
        if (state.items.size >= state.settings.maxItems) {
            setStatus(`Max limit (${state.settings.maxItems}) reached!`);
        }
    }

    // --------- Robust Scanning (2025 compatible) ---------
    function scanPage() {
        let added = 0;
        const linkSelectors = [
            'a[href*="/groups/"]:not([href*="feed"]):not([href*="joins"]):not([href*="discover"]):not([href*="create"]):not([href*="requests"])',
            'a[role="link"][href*="/groups/"]'
        ];

        const anchors = new Set();
        linkSelectors.forEach(sel => {
            document.querySelectorAll(sel).forEach(a => anchors.add(a));
        });

        for (const a of anchors) {
            let href = a.getAttribute('href');
            if (!href) continue;

            const abs = absolutize(href);
            if (!abs) continue;

            const canonical = canonicalizeGroupUrl(abs);
            if (!canonical) continue;

            const key = groupKey(canonical);
            if (state.items.has(key)) continue;

            // Find container for text
            let container = a.closest('div[role="article"], div[data-pagelet], div.x1lliihq, div.x1y1aw1k, div.x78zum5, div.x1n2onr6') || a.closest('div') || a.parentElement;
            if (!container) continue;

            const textBlock = container.innerText || '';

            let name = a.querySelector('span[dir="auto"]')?.innerText?.trim() || cleanText(a.innerText) || findBestName(container);
            if (!name || name.length < 3) continue;

            const membersStr = findMembers(textBlock);
            const membersNum = parseMembers(membersStr);

            if (membersNum < state.settings.minMembers) continue;

            const lastActive = findLastActive(textBlock);

            const record = {
                name,
                members: membersStr || '',
                membersNum,
                lastActive: lastActive || '',
                url: canonical,
                timestamp: new Date().toISOString()
            };

            state.items.set(key, record);
            added++;
        }

        if (added > 0) {
            updateCount();
            updateProgress();
        }
        return added;
    }

    function parseMembers(str) {
        if (!str) return 0;
        const m = str.match(/([\d,.]+)([KkMm]?)/);
        if (!m) return 0;
        let num = parseFloat(m[1].replace(/,/g, ''));
        if (m[2].toLowerCase() === 'k') num *= 1000;
        if (m[2].toLowerCase() === 'm') num *= 1000000;
        return num;
    }

    function findBestName(container) {
        const candidates = container.querySelectorAll('span, div, strong, h3');
        let best = '';
        for (const el of candidates) {
            const t = cleanText(el.innerText);
            if (t.length > best.length && t.length < 150 && !/(members|posts|active|joined)/i.test(t)) {
                best = t;
            }
        }
        return best;
    }

    // Helpers (unchanged/improved)
    function absolutize(u) {
        try { return new URL(u, location.href).href; } catch { return null; }
    }

    function canonicalizeGroupUrl(u) {
        try {
            const url = new URL(u);
            if (!url.hostname.endsWith('facebook.com')) return null;
            const match = url.pathname.match(/\/groups\/([^/?]+)/);
            return match ? `${url.origin}/groups/${match[1]}` : null;
        } catch { return null; }
    }

    function groupKey(url) { return url.split('/groups/')[1]; }

    function cleanText(s) { return (s || '').replace(/\s+/g, ' ').trim(); }

    function findMembers(text) {
        const regex = /([\d,.]+[KkMm]?)\s*members?/i;
        const m = text.match(regex);
        return m ? m[1].trim() : null;
    }

    function findLastActive(text) {
        const patterns = [
            /active\s*([\d\w\s]+?)\s*ago/i,
            /last\s*active\s*([\d\w\s]+?)\s*ago/i,
            /([\d\w\s]+?)\s*(hour|day|week|month|year)s?\s*ago/i
        ];
        for (const pat of patterns) {
            const m = text.match(pat);
            if (m) return cleanText(m[1] || m[0]);
        }
        return null;
    }

    // --------- Export ---------
    function exportData(format) {
        const sorted = Array.from(state.items.values())
            .sort((a, b) => b.membersNum - a.membersNum); // sort by members descending

        const rows = [['Group Name', 'Members', 'Last Active', 'URL', 'Scanned At']];
        for (const rec of sorted) {
            rows.push([
                rec.name,
                rec.members,
                rec.lastActive,
                rec.url,
                new Date(rec.timestamp).toLocaleString()
            ]);
        }

        if (format === 'csv') {
            const esc = v => `"${String(v || '').replace(/"/g, '""')}"`;
            return '\uFEFF' + rows.map(r => r.map(esc).join(',')).join('\n');
        } else {
            return JSON.stringify({
                exportedAt: new Date().toISOString(),
                total: sorted.length,
                groups: sorted
            }, null, 2);
        }
    }

    function downloadData(data, format) {
        const blob = new Blob([data], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fb-groups-${format}-${new Date().toISOString().slice(0,10)}.${format}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // --------- Init ---------
    function init() {
        if (document.getElementById('fb-groups-scraper-panel')) return;
        loadSettings();
        createPanel();
        setStatus('Initialized! Scan or Auto-Scan. Shortcuts: Ctrl+S/A/E');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();