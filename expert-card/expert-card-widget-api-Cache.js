/**
 * Project: Gold Agent Card System (V4.9.3 - Final Fix)
 * Fixes:
 * 1. Data Key Mismatch (start/end vs start_date/end_date)
 * 2. Missing Font Injection (Shrikhand)
 * 3. 3-Key Architecture (Standardized)
 */

(function (window, document) {
  'use strict';

  // =========================================================
  // 0. Config & KEYS
  // =========================================================
  const CONFIG = {
    API_URL: "https://daju-expert-card-api.dajuteam88.workers.dev",
    PROBE_INTERVAL_MS: 15 * 60 * 1000,   // 15 分鐘
    FETCH_TIMEOUT_MS: 8000,              // 8 秒熔斷
    META_FAIL_COOLDOWN_MS: 60 * 1000,    // 失敗冷卻
    FORCE_REFRESH_PARAM: "refresh"
  };

  // ✅ 採用高效能三鍵分離
  const KEYS = {
    STORAGE: "daju_expert_cache",       // 存 { version, data }
    LAST_PROBE: "daju_expert_probe",    // 存 timestamp
    META_FAIL: "daju_expert_fail"       // 存 timestamp
  };

  // =========================================================
  // 1. CSS Styles (Auto Height + Gold Effects)
  // =========================================================
  const WIDGET_CSS = `
    /* Container Base */
    .expert-container-v4 { display: none; width: 100%; max-width: 1000px; margin: 20px auto; } 
    .expert-container-v4.loaded { display: block; } 

    /* Animation */
    .expert-card-hidden { opacity: 0; visibility: hidden; transform: translateY(30px); pointer-events: none; }
    .expert-card-visible { 
      visibility: visible; opacity: 1; transform: translateY(0); 
      transition: opacity 0.6s ease-out, transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }

    /* Card Design */
    .expert-card-wrapper { position: relative; border-radius: 12px; overflow: hidden; width: 100%; box-shadow: 0 4px 12px rgba(0,0,0,0.08); isolation: isolate; background: #fff; }
    .expert-card-wrapper::before { content: ""; position: absolute; top: -3px; left: -3px; right: -3px; bottom: -3px; border-radius: inherit; background: linear-gradient(130deg, #fffaea, #eccb7d, #fff2d4, #f4c978, #ffedb1, #e6c079, #e7c57c); background-size: 300% 300%; animation: borderFlow 8s linear infinite; z-index: -2; pointer-events: none; }
    @keyframes borderFlow { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }

    .expert-card { padding: 15px 20px; display: flex; align-items: center; flex-wrap: wrap; background: #fff; border-radius: 10px; position: relative; }
    .expert-badge { display: none; } 
    .expert-badge i { color: #fff; font-size: 1.8em; }
    .expert-profile { width: 80px; height: 80px; border-radius: 50%; border: 3px solid #fff; object-fit: cover; margin-right: 15px; box-shadow: 0 4px 10px rgba(194, 145, 67, 0.3); background-color: #f0f0f0; flex-shrink: 0; }
    .expert-info { flex: 1; min-width: 0; }
    .expert-title { font-size: 1rem; font-weight: 700; color: #9f5f00; margin-bottom: 4px; display: flex; align-items: center; gap: 6px; }
    .expert-title i { color: #d1a106; }
    .expert-name-row { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 8px; }
    .expert-name { font-size: 1.5rem; font-weight: bold; color: #333; line-height: 1.2; }
    .expert-contact { display: flex; gap: 10px; }
    .expert-contact a { display: inline-flex; align-items: center; justify-content: center; height: 36px; padding: 0 12px; border-radius: 18px; text-decoration: none; color: #fff; font-size: 0.9rem; transition: transform 0.2s, filter 0.2s; font-weight: 500; }
    .expert-contact a:hover { transform: translateY(-2px); filter: brightness(1.1); }
    .expert-contact-phone { background: linear-gradient(to right, #a45500, #ff9e36); }
    .expert-contact-line { background: linear-gradient(to right, #00a816, #67ca04); }
    .expert-contact a i { margin-right: 6px; }
    .expert-footer { font-size: 0.75rem; color: #af885c; opacity: 0.8; }
    /* Shrikhand Font Apply */
    .expert-level-mark { position: absolute; right: 10px; top: 5px; font-family: "Shrikhand", serif; font-weight: 900; font-style: italic; font-size: 1.5rem; color: rgba(194, 145, 67, 0.15); pointer-events: none; user-select: none; z-index: 0; }

    @media (min-width: 768px) {
      .expert-card { padding: 25px 35px; }
      .expert-profile { width: 110px; height: 110px; margin-right: 25px; border-width: 4px; }
      .expert-title { font-size: 1.1rem; }
      .expert-name { font-size: 2rem; }
      .expert-contact a { height: 42px; padding: 0 20px; font-size: 1rem; }
      .expert-level-mark { font-size: 4rem; right: 20px; top: 20px; }
      .expert-footer { font-size: 0.85rem; }
      .expert-badge { width: 50px; height: 50px; border-radius: 50%; background: linear-gradient(45deg, #f5d770, #d1a106); display: flex; align-items: center; justify-content: center; margin-right: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
    }
  `;

  // =========================================================
  // 2. Helper Functions
  // =========================================================
  function injectStyles() {
    if (document.getElementById('daju-expert-css-v493')) return;
    const style = document.createElement('style');
    style.id = 'daju-expert-css-v493';
    style.innerHTML = WIDGET_CSS;
    document.head.appendChild(style);
  }

  // ✅ 補回字體注入，確保浮水印顯示正確
  function injectFont() {
    if (!document.querySelector('link[href*="Shrikhand"]')) {
      const fontLink = document.createElement('link');
      fontLink.rel = 'stylesheet';
      fontLink.href = 'https://fonts.googleapis.com/css2?family=Shrikhand&display=swap';
      document.head.appendChild(fontLink);
    }
  }

  function safeJSONParse(str, fallback) {
    try { return JSON.parse(str); } catch (e) { return fallback; }
  }

  function safeSetItem(key, val) {
    try { localStorage.setItem(key, val); } catch (e) { console.warn("Storage Full"); }
  }

  function getTaiwanTime() {
    try {
      const now = new Date();
      const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
      return new Date(utc + (3600000 * 8));
    } catch { return new Date(); }
  }

  // =========================================================
  // 3. Unified Data Engine (3-Key Implementation)
  // =========================================================
  async function fetchJSON(url, { timeoutMs, cacheMode }) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal, cache: cacheMode || "no-cache" });
      let data = null;
      try { data = await res.json(); } catch {}
      return { ok: res.ok, status: res.status, data };
    } catch (e) {
      return { ok: false, error: e };
    } finally {
      clearTimeout(id);
    }
  }

  async function unifiedDataEngine() {
    const now = Date.now();
    
    // 1. Read Keys
    const lastProbe = parseInt(localStorage.getItem(KEYS.LAST_PROBE) || "0", 10);
    const lastFail = parseInt(localStorage.getItem(KEYS.META_FAIL) || "0", 10);
    const cachedStr = localStorage.getItem(KEYS.STORAGE);
    const localCache = safeJSONParse(cachedStr, {}); 
    
    const params = new URLSearchParams(window.location.search);
    const isForce = params.has(CONFIG.FORCE_REFRESH_PARAM);

    // 2. Local TTL Check (15 mins)
    if (!isForce && localCache.data && (now - lastProbe < CONFIG.PROBE_INTERVAL_MS)) {
      return localCache.data;
    }

    // 3. Error Cooldown (60s)
    if (!isForce && (now - lastFail < CONFIG.META_FAIL_COOLDOWN_MS)) {
      return localCache.data || [];
    }

    // 4. Network Probe
    try {
      const v = (localCache.version && !isForce) ? localCache.version : "0";
      let url = `${CONFIG.API_URL}?v=${encodeURIComponent(v)}`;
      if (isForce) url += "&refresh=1";

      const res = await fetchJSON(url, {
        timeoutMs: CONFIG.FETCH_TIMEOUT_MS,
        cacheMode: isForce ? "reload" : "no-store"
      });

      // 304 Not Modified
      if (res.status === 304 || (res.data && res.data.code === 304)) {
        safeSetItem(KEYS.LAST_PROBE, String(now));
        safeSetItem(KEYS.META_FAIL, "0");
        return localCache.data || [];
      }

      // 200 OK
      if (res.data && res.data.code === 200 && Array.isArray(res.data.data)) {
        const newCache = {
          version: String(res.data.version),
          data: res.data.data
        };
        safeSetItem(KEYS.STORAGE, JSON.stringify(newCache));
        safeSetItem(KEYS.LAST_PROBE, String(now));
        safeSetItem(KEYS.META_FAIL, "0");
        return newCache.data;
      }

    } catch (e) {
      console.warn("[Expert] Probe failed.");
      safeSetItem(KEYS.META_FAIL, String(now));
    }

    return localCache.data || [];
  }

  // =========================================================
  // 4. Rendering & Animation
  // =========================================================
  const LEVELS = {
    "社區人氣王": { icon: "fa-fire", title: "【社區人氣王】", mark: "HOT" },
    "社區專家": { icon: "fa-trophy", title: "【社區專家】", mark: "PRO+" },
    "社區大師": { icon: "fa-crown", title: "【社區大師】", mark: "MASTER" }
  };

  // ✅ [FIX] 支援舊版資料格式的 start / end
  function isInTimeRange(start, end) {
    const parseTW = (val) => {
      if (!val) return null;
      if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
      // 兼容 "2023/12/01" 或 "2023-12-01"
      let s = String(val).trim().replace(/\//g, '-').replace(' ', 'T');
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00:00';
      if (!/[zZ]|[+\-]\d{2}:\d{2}$/.test(s)) s += '+08:00';
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    };

    const now = getTaiwanTime();
    const s = parseTW(start);
    const e = parseTW(end);
    
    if (s && e) return now >= s && now <= e;
    if (s && !e) return now >= s;
    if (!s && e) return now <= e;
    return true;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  }

  function renderCard(container, experts) {
    const caseName = (container.dataset.caseName || "").trim();
    if (!caseName) return;

    // ✅ [FIX] 這裡改回使用 start / end，這就是資料出不來的關鍵！
    const validExperts = experts.filter(e => 
      e.case_name === caseName && isInTimeRange(e.start, e.end)
    );
    
    if (validExperts.length === 0) return;
    const item = validExperts[Math.floor(Math.random() * validExperts.length)];
    
    const lvl = LEVELS[item.level] || LEVELS["社區專家"];
    const tel = (item.phone || "").replace(/[^\d+]/g, '');
    const line = item.line || "";

    const html = `
      <div class="expert-card-wrapper expert-card-hidden">
        <div class="expert-card">
          <div class="expert-badge"><i class="fas ${lvl.icon}"></i></div>
          <img class="expert-profile" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}">
          <div class="expert-info">
            <div class="expert-title"><i class="fas ${lvl.icon}"></i>${lvl.title}</div>
            <div class="expert-name-row">
              <div class="expert-name">${escapeHtml(item.name)}</div>
              <div class="expert-contact">
                ${tel ? `<a href="tel:${tel}" class="expert-contact-phone"><i class="fas fa-phone-alt"></i>撥打電話</a>` : ''}
                ${line ? `<a href="${escapeHtml(line)}" target="_blank" class="expert-contact-line"><i class="fab fa-line"></i>加 LINE</a>` : ''}
              </div>
            </div>
            <div class="expert-footer">證號：${escapeHtml(item.license)} ｜ ${escapeHtml(item.company)}</div>
            <div class="expert-level-mark">${lvl.mark}</div>
          </div>
        </div>
      </div>
    `;
    
    container.innerHTML = html;
    container.classList.add("loaded"); 

    const wrapper = container.querySelector(".expert-card-wrapper");
    if ('IntersectionObserver' in window) {
      const obs = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            wrapper.classList.remove('expert-card-hidden');
            wrapper.classList.add('expert-card-visible');
            obs.disconnect();
          }
        });
      }, { threshold: 0.1 });
      obs.observe(wrapper);
    } else {
      wrapper.classList.remove('expert-card-hidden');
      wrapper.classList.add('expert-card-visible');
    }
  }

  // =========================================================
  // 5. Init
  // =========================================================
  async function init() {
    const containers = document.querySelectorAll("#expert-container");
    if (containers.length === 0) return;

    if (!document.querySelector('link[href*="fontawesome"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css';
      document.head.appendChild(link);
    }

    injectStyles();
    injectFont(); // ✅ 確保注入字體

    containers.forEach(c => c.classList.add('expert-container-v4'));

    const data = await unifiedDataEngine();
    
    if (Array.isArray(data) && data.length > 0) {
      containers.forEach(c => renderCard(c, data));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window, document);
