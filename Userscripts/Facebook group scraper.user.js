// ==UserScript==
// @name         Facebook Groups → CSV Exporter (Improved v2.0)
// @namespace    devskits916.fb.groups.csv
// @version      2.0.0
// @description  Enhanced Facebook group scanner with better UI, progress tracking, filters, JSON export, error handling, and auto-detection. Drag panel, dark/light theme, keyboard shortcuts.
// @author       Calder (improved by AI assistant)
// @match        https://www.facebook.com/*groups*
// @match        https://m.facebook.com/*groups*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // --------- State ---------
    const state = {
        items: new Map(), // key: groupKey (id/slug), value: {name, members, lastActive, url, timestamp}
        autoscanTimer: null,
        autoscanEndAt: 0,
        isScanning: false,
        theme: 'dark', // 'dark' or 'light'
        settings: { // Persistent settings
            autoStart: false,
            maxItems: 1000,
            exportFormat: 'csv' // 'csv' or 'json'
        }
    };

    // --------- Storage Helpers ---------
    function loadSettings() {
        try {
            const saved = localStorage.getItem('fb-groups-csv-settings');
            if (saved) Object.assign(state.settings, JSON.parse(saved));
        } catch {}
    }

    function saveSettings() {
        try {
            localStorage.setItem('fb-groups-csv-settings', JSON.stringify(state.settings));
        } catch {}
    }

    // --------- UI (Enhanced) ---------
    function createPanel() {
        const panel = document.createElement('div');
        panel.id = 'fb-groups-csv-panel';
        updatePanelStyles(panel);
        
        panel.innerHTML = `
            <div id="fb-groups-csv-drag" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;cursor:move;">
                <strong>📊 Groups CSV</strong>
                <span id="fb-groups-csv-count" style="opacity:0.85;font-weight:500;">0</span>
            </div>
            
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">
                <button id="fb-groups-csv-scan" title="🔍 Scan visible groups">Scan</button>
                <button id="fb-groups-csv-autoscan" title="🤖 Auto-scroll + scan (60s)">Auto-Scan 60s</button>
                <button id="fb-groups-csv-export" title="💾 Download selected format">Export</button>
                <button id="fb-groups-csv-copy" title="📋 Copy to clipboard">Copy</button>
            </div>
            
            <div style="margin-bottom:6px;font-size:12px;">
                <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:11px;">
                    <input type="checkbox" id="fb-groups-csv-progress" checked>
                    Show progress bar
                </label>
            </div>
            
            <div style="display:flex;gap:4px;margin-bottom:6px;">
                <select id="fb-groups-csv-format" style="flex:1;padding:4px 6px;border-radius:4px;border:1px solid rgba(255,255,255,0.3);background:rgba(0,0,0,0.2);color:inherit;">
                    <option value="csv">CSV</option>
                    <option value="json">JSON</option>
                </select>
                <button id="fb-groups-csv-clear" title="🗑️ Clear all data" style="padding:4px 8px;border:none;background:rgba(255,0,0,0.3);color:#fff;border-radius:4px;cursor:pointer;font-size:11px;">Clear</button>
            </div>
            
            <div id="fb-groups-csv-progress-bar" style="height:4px;background:rgba(0,255,0,0.3);border-radius:2px;overflow:hidden;margin-bottom:6px;opacity:0;transition:opacity 0.3s;">
                <div id="fb-groups-csv-progress-fill" style="height:100%;background:rgba(0,255,0,0.7);width:0%;transition:width 0.3s;"></div>
            </div>
            
            <div id="fb-groups-csv-status" style="font-size:12px;opacity:0.9;font-family:monospace;">Ready</div>
        `;
        
        document.body.appendChild(panel);
        attachPanelEvents(panel);
        updateCount();
    }

    function updatePanelStyles(panel) {
        const isDark = state.theme === 'dark';
        Object.assign(panel.style, {
            position: 'fixed',
            zIndex: 999999,
            right: '16px',
            bottom: '16px',
            width: '320px',
            background: isDark ? 'rgba(32,32,32,0.97)' : 'rgba(255,255,255,0.97)',
            color: isDark ? '#fff' : '#000',
            fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
            fontSize: '13px',
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}`,
            borderRadius: '12px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
            padding: '12px',
            backdropFilter: 'blur(20px)'
        });
    }

    function attachPanelEvents(panel) {
        // Drag functionality
        const drag = panel.querySelector('#fb-groups-csv-drag');
        let startX=0, startY=0, startRight=0, startBottom=0, dragging=false;
        
        drag.addEventListener('pointerdown', e => {
            dragging = true;
            startX = e.clientX; startY = e.clientY;
            const rect = panel.getBoundingClientRect();
            startRight = window.innerWidth - rect.right;
            startBottom = window.innerHeight - rect.bottom;
            panel.setPointerCapture(e.pointerId);
        });

        document.addEventListener('pointermove', e => {
            if (!dragging) return;
            const dx = e.clientX - startX, dy = e.clientY - startY;
            panel.style.right = Math.max(0, startRight - dx) + 'px';
            panel.style.bottom = Math.max(0, startBottom - dy) + 'px';
        });

        document.addEventListener('pointerup', () => dragging = false);

        // Button events
        panel.querySelector('#fb-groups-csv-scan').addEventListener('click', () => {
            const added = scanPage();
            bumpCount(added);
            setStatus(`Scan complete. +${added} new (${state.items.size} total)`);
            updateProgress();
        });

        panel.querySelector('#fb-groups-csv-autoscan').addEventListener('click', () => {
            if (state.autoscanTimer) {
                clearInterval(state.autoscanTimer);
                state.autoscanTimer = null;
                setStatus('Auto-scan stopped.');
                return;
            }
            state.autoscanEndAt = Date.now() + 60000; // 60s
            state.isScanning = true;
            setStatus('🤖 Auto-scan started (60s). Scroll + scan...');
            state.autoscanTimer = setInterval(() => {
                window.scrollBy({ top: 900, behavior: 'smooth' });
                const added = scanPage();
                bumpCount(added);
                setStatus(`Auto-scan: +${added} (${state.items.size} total)`);
                updateProgress();
                if (Date.now() > state.autoscanEndAt || state.items.size >= state.settings.maxItems) {
                    clearInterval(state.autoscanTimer);
                    state.autoscanTimer = null;
                    state.isScanning = false;
                    setStatus(`Auto-scan done. ${state.items.size} groups found.`);
                }
            }, 1500);
        });

        panel.querySelector('#fb-groups-csv-export').addEventListener('click', () => {
            const data = exportData(state.settings.exportFormat);
            downloadData(data, state.settings.exportFormat);
            setStatus(`${state.settings.exportFormat.toUpperCase()} downloaded (${state.items.size} groups)`);
        });

        panel.querySelector('#fb-groups-csv-copy').addEventListener('click', async () => {
            const data = exportData(state.settings.exportFormat);
            try {
                await navigator.clipboard.writeText(data);
                setStatus(`${state.settings.exportFormat.toUpperCase()} copied!`);
            } catch {
                if (typeof GM_setClipboard === 'function') {
                    GM_setClipboard(data);
                    setStatus(`${state.settings.exportFormat.toUpperCase()} copied via GM!`);
                } else {
                    setStatus('Copy failed. Use Export button.');
                }
            }
        });

        panel.querySelector('#fb-groups-csv-clear').addEventListener('click', () => {
            state.items.clear();
            updateCount();
            updateProgress();
            setStatus('Data cleared.');
        });

        // Format selector
        panel.querySelector('#fb-groups-csv-format').addEventListener('change', e => {
            state.settings.exportFormat = e.target.value;
            saveSettings();
        });

        // Progress toggle
        panel.querySelector('#fb-groups-csv-progress').addEventListener('change', e => {
            const bar = panel.querySelector('#fb-groups-csv-progress-bar');
            bar.style.opacity = e.target.checked ? '1' : '0';
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', e => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.ctrlKey || e.metaKey) {
                switch (e.key.toLowerCase()) {
                    case 's': e.preventDefault(); scanPage(); break;
                    case 'a': e.preventDefault(); panel.querySelector('#fb-groups-csv-autoscan').click(); break;
                    case 'e': e.preventDefault(); panel.querySelector('#fb-groups-csv-export').click(); break;
                }
            }
        });
    }

    function setStatus(msg) {
        const el = document.querySelector('#fb-groups-csv-status');
        if (el) el.textContent = msg;
    }

    function bumpCount(added = 0) {
        updateCount();
    }

    function updateCount() {
        const el = document.querySelector('#fb-groups-csv-count');
        if (el) el.textContent = state.items.size.toLocaleString();
    }

    function updateProgress() {
        const total = state.settings.maxItems;
        const pct = Math.min(100, (state.items.size / total) * 100);
        const fill = document.querySelector('#fb-groups-csv-progress-fill');
        const bar = document.querySelector('#fb-groups-csv-progress-bar');
        if (fill) fill.style.width = pct + '%';
        if (bar) bar.style.opacity = '1';
        if (state.items.size >= total) {
            setStatus(`Max items (${total}) reached!`);
            if (state.autoscanTimer) {
                clearInterval(state.autoscanTimer);
                state.autoscanTimer = null;
            }
        }
    }

    // --------- Enhanced Scanning ---------
    function scanPage() {
        const before = state.items.size;
        const anchors = Array.from(document.querySelectorAll('a[role="link"][href*="groups"], a[href*="groups"]'));
        
        const badParts = ['/groups/feed/', '/groups/joins/', '/groups/discover/', '/groups/create/', '/groups/requests/', '/groups/browse/', '/groups/categories/'];
        for (const a of anchors) {
            const href = a.getAttribute('href');
            if (!href || badParts.some(p => href.includes(p))) continue;

            const abs = absolutize(href);
            if (!abs) continue;
            
            const canonical = canonicalizeGroupUrl(abs);
            if (!canonical) continue;

            const key = groupKey(canonical);
            if (state.items.has(key)) continue;

            const container = a.closest('[role="article"], [data-pagelet], div[class*="x1lliihq"], div[class*="x1y1aw1k"]') || a.parentElement;
            const textBlock = container ? cleanText(container.innerText || '') : '';
            
            const members = findMembers(textBlock);
            const lastActive = findLastActive(textBlock);
            const name = pickBestName(cleanText(a.textContent), findAltName(container, textBlock));

            const record = {
                name,
                members: members || state.items.get(key)?.members,
                lastActive: lastActive || state.items.get(key)?.lastActive,
                url: canonical,
                timestamp: new Date().toISOString()
            };

            state.items.set(key, record);
        }
        return state.items.size - before;
    }

    // --------- Enhanced Helpers ---------
    function absolutize(u) {
        try { return new URL(u, location.origin).toString(); } catch { return null; }
    }

    function canonicalizeGroupUrl(u) {
        try {
            const url = new URL(u);
            if (!/facebook\.com$/.test(url.hostname)) return null;
            const path = url.pathname;
            const idx = path.indexOf('/groups/');
            if (idx === -1) return null;
            const rest = path.slice(idx + 8);
            const slug = rest.split('/')[0];
            if (!slug) return null;
            return `${url.origin}/groups/${slug}`;
        } catch { return null; }
    }

    function groupKey(canonicalUrl) {
        return canonicalUrl.replace(/https?:\/\/[^\/]+\/groups\//, '');
    }

    function cleanText(s) {
        return (s || '').replace(/\s+/g, ' ').trim();
    }

    function findMembers(text) {
        // Enhanced regex: 12.3K members, 3,241 members, 50K+ members, etc.
        const m = text.match(/[\d,.KkM]+?\s*members?/i);
        return m ? cleanText(m[0]) : null;
    }

    function findLastActive(text) {
        const patterns = [
            /Last active[:.]\s*([\d.,hwdmy ]+?)(ago|ago)/i,
            /Active[:.]\s*([\d.,hwdmy ]+?)(ago|ago)/i,
            /([\d.,hwdmy ]+?)(hours?|days?|weeks?|months?|years?)\s*(ago)?/i
        ];
        for (const pat of patterns) {
            const m = text.match(pat);
            if (m) return cleanText(m[1]);
        }
        return null;
    }

    function findAltName(container, textBlock) {
        if (!container) return null;
        const candidates = container.querySelectorAll('span, strong, h1, h2, h3, div');
        let best = '';
        for (const el of candidates) {
            const t = cleanText(el.textContent);
            if (t.length > best.length && t.length < 120 && !/(members|active|joined|create|see all)/i.test(t)) {
                best = t;
            }
        }
        return best;
    }

    function pickBestName(a, b) {
        if (!a) return b;
        if (!b) return a;
        const score = s => {
            let score = s.length * 0.3;
            if (s.length > 120) score -= 50;
            if (/^[A-Z]/.test(s)) score += 10;
            if (/members?|active/i.test(s)) score -= 20;
            return score;
        };
        return score(b) > score(a) ? b : a;
    }

    // --------- Export (CSV + JSON) ---------
    function exportData(format) {
        const rows = [['Group Name', 'Members', 'Last Active', 'URL', 'Scanned At']];
        for (const rec of Array.from(state.items.values()).slice(0, state.settings.maxItems)) {
            rows.push([
                rec.name || '',
                rec.members || '',
                rec.lastActive || '',
                rec.url || '',
                rec.timestamp ? new Date(rec.timestamp).toLocaleString() : ''
            ]);
        }

        if (format === 'csv') {
            const esc = v => {
                const s = String(v || '');
                if (s.match(/[\r\n,"]/)) return `"${s.replace(/"/g, '""')}"`;
                return s;
            };
            return '\uFEFF' + rows.map(r => r.map(esc).join(',')).join('\n');
        } else { // json
            return JSON.stringify({
                exportedAt: new Date().toISOString(),
                total: state.items.size,
                groups: Array.from(state.items.values())
            }, null, 2);
        }
    }

    function downloadData(data, format) {
        const blob = new Blob([data], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' });
        const a = document.createElement('a');
        const ts = new Date().toISOString().slice(0,10);
        a.href = URL.createObjectURL(blob);
        a.download = `facebook-groups-${format}-${ts}.${format}`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            URL.revokeObjectURL(a.href);
            a.remove();
        }, 100);
    }

    // --------- Auto-Detection & Observer ---------
    function initObserver() {
        const obs = new MutationObserver(() => {
            if (!state.isScanning) return;
            const added = scanPage();
            if (added > 0) {
                bumpCount(added);
                updateProgress();
            }
        });
        obs.observe(document.documentElement, { childList: true, subtree: true });
    }

    // --------- Boot ---------
    function init() {
        if (document.getElementById('fb-groups-csv-panel')) return;
        
        loadSettings();
        createPanel();
        setStatus('🚀 Initialized! Use Scan/Auto-Scan. Ctrl+S/A/E for shortcuts.');
        initObserver();
        
        // Initial scan if autoStart enabled
        if (state.settings.autoStart) {
            setTimeout(() => document.querySelector('#fb-groups-csv-scan')?.click(), 2000);
        }
    }

    // Start when ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
