/**
 * Project: Gold Agent Card System (V4.9.1 - Responsive Auto-Height)
 * Core Logic:
 * 1. 15-min Local TTL (Zero Request)
 * 2. 304 Not Modified (Keep Alive)
 * 3. 8s Timeout Circuit Breaker
 * 4. Auto Height (No min-height) + Smooth Entry Animation
 */

(function (window, document) {
  'use strict';

  // =========================================================
  // 0. Config
  // =========================================================
  const CONFIG = {
    API_URL: "https://daju-expert-card-api.dajuteam88.workers.dev",
    STORAGE_KEY: "daju_expert_cache_v4", 
    PROBE_INTERVAL_MS: 15 * 60 * 1000,   // 15 分鐘
    FETCH_TIMEOUT_MS: 8000,              // 8 秒熔斷
    FORCE_REFRESH_PARAM: "refresh"       // URL 參數 ?refresh=1 強制更新
  };

  // =========================================================
  // 1. CSS Styles (Auto Height + Gold Effects)
  // =========================================================
  const WIDGET_CSS = `
    /* Container Base: 移除 min-height，高度由內容決定 */
    .expert-container-v4 { display: none; width: 100%; max-width: 1000px; margin: 20px auto; } 
    .expert-container-v4.loaded { display: block; } 

    /* Animation States */
    .expert-card-hidden { opacity: 0; visibility: hidden; transform: translateY(30px); pointer-events: none; }
    .expert-card-visible { 
      visibility: visible; opacity: 1; transform: translateY(0); 
      transition: opacity 0.6s ease-out, transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }

    /* Card Design */
    .expert-card-wrapper { position: relative; border-radius: 12px; overflow: hidden; width: 100%; box-shadow: 0 4px 12px rgba(0,0,0,0.08); isolation: isolate; background: #fff; }
    
    /* Golden Fluid Border Animation */
    .expert-card-wrapper::before { content: ""; position: absolute; top: -3px; left: -3px; right: -3px; bottom: -3px; border-radius: inherit; background: linear-gradient(130deg, #fffaea, #eccb7d, #fff2d4, #f4c978, #ffedb1, #e6c079, #e7c57c); background-size: 300% 300%; animation: borderFlow 8s linear infinite; z-index: -2; pointer-events: none; }
    @keyframes borderFlow { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }

    .expert-card { padding: 15px 20px; display: flex; align-items: center; flex-wrap: wrap; background: #fff; border-radius: 10px; position: relative; }
    
    /* Badge & Icon */
    .expert-badge { display: none; } 
    .expert-badge i { color: #fff; font-size: 1.8em; }
    .expert-profile { width: 80px; height: 80px; border-radius: 50%; border: 3px solid #fff; object-fit: cover; margin-right: 15px; box-shadow: 0 4px 10px rgba(194, 145, 67, 0.3); background-color: #f0f0f0; flex-shrink: 0; }
    
    /* Info Area */
    .expert-info { flex: 1; min-width: 0; }
    .expert-title { font-size: 1rem; font-weight: 700; color: #9f5f00; margin-bottom: 4px; display: flex; align-items: center; gap: 6px; }
    .expert-title i { color: #d1a106; }
    .expert-name-row { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 8px; }
    .expert-name { font-size: 1.5rem; font-weight: bold; color: #333; line-height: 1.2; }
    
    /* Contact Buttons */
    .expert-contact { display: flex; gap: 10px; }
    .expert-contact a { display: inline-flex; align-items: center; justify-content: center; height: 36px; padding: 0 12px; border-radius: 18px; text-decoration: none; color: #fff; font-size: 0.9rem; transition: transform 0.2s, filter 0.2s; font-weight: 500; }
    .expert-contact a:hover { transform: translateY(-2px); filter: brightness(1.1); }
    .expert-contact-phone { background: linear-gradient(to right, #a45500, #ff9e36); }
    .expert-contact-line { background: linear-gradient(to right, #00a816, #67ca04); }
    .expert-contact a i { margin-right: 6px; }
    
    /* Footer & Watermark */
    .expert-footer { font-size: 0.75rem; color: #af885c; opacity: 0.8; }
    .expert-level-mark { position: absolute; right: 10px; top: 5px; font-family: sans-serif; font-weight: 900; font-style: italic; font-size: 1.5rem; color: rgba(194, 145, 67, 0.15); pointer-events: none; user-select: none; z-index: 0; }

    /* RWD */
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
  // 2. Helper Functions (Safe & Robust)
  // =========================================================
  function injectStyles() {
    if (document.getElementById('daju-expert-css-v49')) return;
    const style = document.createElement('style');
    style.id = 'daju-expert-css-v49';
    style.innerHTML = WIDGET_CSS;
    document.head.appendChild(style);
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
  // 3. Unified Data Engine (Standardized)
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
    const cachedStr = localStorage.getItem(CONFIG.STORAGE_KEY);
    const local = safeJSONParse(cachedStr, {});
    
    // Check Force Refresh URL Param
    const params = new URLSearchParams(window.location.search);
    const isForce = params.has(CONFIG.FORCE_REFRESH_PARAM);

    // 1. Local Cache Valid (15 min)
    if (!isForce && local.data && local.timestamp && (now - local.timestamp < CONFIG.PROBE_INTERVAL_MS)) {
      return local.data;
    }

    // 2. Fetch (Probe or Full)
    try {
      const v = (local.version && !isForce) ? local.version : "0";
      let url = `${CONFIG.API_URL}?v=${encodeURIComponent(v)}`;
      if (isForce) url += "&refresh=1";

      const res = await fetchJSON(url, {
        timeoutMs: CONFIG.FETCH_TIMEOUT_MS,
        cacheMode: isForce ? "reload" : "no-store"
      });

      // 304 Not Modified -> Renew Timestamp
      if (res.status === 304 || (res.data && res.data.code === 304)) {
        local.timestamp = now;
        safeSetItem(CONFIG.STORAGE_KEY, JSON.stringify(local));
        return local.data;
      }

      // 200 OK -> Update Data
      if (res.data && res.data.code === 200 && Array.isArray(res.data.data)) {
        const newData = {
          version: String(res.data.version),
          data: res.data.data,
          timestamp: now
        };
        safeSetItem(CONFIG.STORAGE_KEY, JSON.stringify(newData));
        return newData.data;
      }
    } catch (e) {
      console.warn("[Expert] Fetch error, using cache fallback.");
    }

    // Fallback
    return local.data || [];
  }

  // =========================================================
  // 4. Business Logic & Rendering
  // =========================================================
  const LEVELS = {
    "社區人氣王": { icon: "fa-fire", title: "社區人氣王", mark: "HOT" },
    "社區專家": { icon: "fa-trophy", title: "社區專家", mark: "PRO" },
    "社區大師": { icon: "fa-crown", title: "社區大師", mark: "MASTER" }
  };

  function isInTimeRange(start, end) {
    const now = getTaiwanTime();
    const s = start ? new Date(start) : null;
    const e = end ? new Date(end) : null;
    if (s && now < s) return false;
    if (e && now > e) return false;
    return true;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function(m) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
  }

  function renderCard(container, experts) {
    const caseName = (container.dataset.caseName || "").trim();
    if (!caseName) return;

    // Filter & Random Pick
    const validExperts = experts.filter(e => 
      e.case_name === caseName && isInTimeRange(e.start_date, e.end_date)
    );
    
    if (validExperts.length === 0) return;
    const item = validExperts[Math.floor(Math.random() * validExperts.length)];
    
    // Config Data
    const lvl = LEVELS[item.level] || LEVELS["社區專家"];
    const tel = (item.phone || "").replace(/[^\d+]/g, '');
    const line = item.line || "";

    // Template
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
    container.classList.add("loaded"); // Display block

    // Animation Trigger
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

    // Load Font Awesome
    if (!document.querySelector('link[href*="fontawesome"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css';
      document.head.appendChild(link);
    }

    injectStyles();

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
