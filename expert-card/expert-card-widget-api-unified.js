/**
 * Expert Card Widget V4.12 (Meta-First FIX - Ads-aligned)
 * ✅ 目標：讓 Expert Card 跟「廣告系統」一致，Cold 也不打 no-v
 *
 * 核心行為（你要的 network 形態）：
 * 1) 首次 / 清 localStorage：
 *    - 先打 meta=1 拿最新版本
 *    - 再打 full 用 v=latest（可 HIT 你 warm 的 edge v-key）
 *    => 不再出現 ?type=expert_card（no meta / no v）
 *
 * 2) TTL 內：0 request
 * 3) TTL 到：
 *    - 打 meta=1
 *    - 版本相同：只續命 timestamp（0 full）
 *    - 版本不同：打 v-full（HIT edge）
 *
 * 4) ?refresh（手動 debug）：
 *    - 仍走 refresh=1（完全 bypass，不讀不寫 edge）
 *    - 但流程仍先 meta 拿 latest（更一致）
 *
 * ✅ 保持不變：
 * - UI/CSS/DOM 行為
 * - A Rule：有 version 才帶 v
 * - meta fail cooldown、fallback cached
 */

(function (window, document) {
  'use strict';

  // =========================================================
  // 0) Config
  // =========================================================
  const API_URL = "https://daju-unified-route-api.dajuteam88.workers.dev/?type=expert_card";

  const LOCAL_CACHE_KEY = "daju_expert_cache";
  const LOCAL_CACHE_EXPIRY_MS = 15 * 60 * 1000;

  const FETCH_TIMEOUT_MS = 8000;
  const META_TIMEOUT_MS = 5000;
  const META_FAIL_COOLDOWN_MS = 60 * 1000;

  // =========================================================
  // 1) CSS (原樣保留)
  // =========================================================
  const WIDGET_CSS = `/*（你的 CSS 原封不動）*/` + `
    .expert-container-v4 { display: none; } 
    .expert-container-v4.loaded { display: block; } 
    .expert-card-hidden { 
        opacity: 0 !important; 
        visibility: hidden !important; 
        transform: translateY(30px) !important; 
        will-change: transform, opacity; 
        pointer-events: none !important; 
    }
    .expert-card-visible { 
        visibility: visible !important; 
        animation: expertFadeMoveUp 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards; 
    }
    @keyframes expertFadeMoveUp { 
        0% { opacity: 0; transform: translateY(30px); } 
        100% { transform: translateY(0); opacity: 1; } 
    }
    .expert-card-wrapper { position: relative; border-radius: 8px; overflow: hidden; width: 100%; max-width: 1000px; z-index: 0; line-height: 1.5; letter-spacing: 0; margin: 20px 0; isolation: isolate; }
    .expert-card-wrapper::before { content: ""; position: absolute; top: -3px; left: -3px; right: -3px; bottom: -3px; border-radius: inherit; background: linear-gradient(130deg, #fffaea, #eccb7d, #fff2d4, #f4c978, #ffedb1, #e6c079, #e7c57c); background-size: 400% 400%; animation: borderFlow 10s linear infinite; z-index: -2; box-shadow: 0 0 16px rgba(4, 255, 0, 0.715); pointer-events: none; }
    @keyframes borderFlow { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
    .expert-card { border-radius: 8px; padding: 10px 22px; position: relative; display: flex; align-items: center; flex-wrap: wrap; }
    .expert-badge { display: none; }
    .expert-card .expert-badge { background: radial-gradient(circle, #f5d770, #d1a106); }
    .expert-badge i { color: #fff; font-size: 1.8em; }
    @keyframes rotateBadge { 0% { transform: rotateY(0deg); } 100% { transform: rotateY(360deg); } }
    .expert-profile { width: 80px !important; height: 80px !important; border-radius: 12px; border: 3px solid #fff; object-fit: cover; margin-right: 15px !important; box-shadow: 0 2px 8px rgba(0, 0, 0, .1); display: block; aspect-ratio: 1/1; background-color: #f0f0f0; transform: translateZ(0); -webkit-transform: translateZ(0); }
    .expert-info { flex: 1; }
    .expert-title { font-size: 1.1rem; font-weight: 700; margin-bottom: 6px; }
    .expert-info .expert-title { color: #9f5f00; }
    .expert-name-row { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; margin-bottom: 10px; position: relative; z-index: 10; }
    .expert-name { font-size: 1.7rem; font-weight: bold; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .expert-contact-phone { background: linear-gradient(to right, #a45500, #ff9e36); }
    .expert-contact-line { background: linear-gradient(to right, #00a816, #67ca04); }
    .expert-contact { display: flex; gap: 15px; flex-wrap: wrap; }
    .expert-contact a { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; min-width: 40px; min-height: 40px; border-radius: 50%; padding: 0; font-size: 1.4rem; line-height: 1; text-decoration: none; transition: transform .2s ease, filter .2s ease, box-shadow .2s ease; outline: none; color: #fff; }
    .expert-contact a:hover { transform: translateY(-1px); filter: brightness(1.05); }
    .expert-contact a:active { transform: translateY(0); filter: brightness(.98); }
    .expert-contact a:focus-visible { box-shadow: 0 0 0 3px rgba(255, 255, 255, .9), 0 0 0 6px rgba(164, 85, 0, .35); }
    .expert-contact a i.fa-phone-alt { font-size: 1.3rem; }
    .expert-contact a i.fa-line { font-size: 1.5rem; }
    .expert-name-row .expert-contact a { color: #fff; }
    .expert-footer { display: none; position: relative; z-index: 3; font-size: .5rem; color: #af885c; }
    .expert-level-mark { position: absolute; right: 18px; top: 10px; font-family: "Shrikhand", serif; font-style: italic; font-size: 1.1rem; color: rgba(194, 145, 67, 0.5); opacity: 0; animation: fadeSlideIn .8s ease-out forwards; animation-delay: 1s; pointer-events: none; z-index: 2; text-shadow: 0 1px 1px rgba(255, 255, 255, .4); }
    @keyframes fadeSlideIn { 0% { transform: translate(0, 20px); opacity: 0; } 100% { transform: translate(0, 0); opacity: .9; } }
    .expert-contact a span { display: none; }
    .expert-title i { animation: rotateBadge 3s linear infinite; }
    @media (min-width:414px) { .expert-level-mark { font-size: 1.6rem; right: 10px; top: 6px; } }
    @media screen and (min-width:992px) { .expert-card-wrapper { border-radius: 15px; } .expert-card { border-radius: 15px; padding: 15px 28px; } .expert-title { font-size: 1.7rem; } .expert-title i { animation: none; } .expert-contact a { width: auto; height: auto; min-height: 44px; font-size: 1.4rem; padding: 8px 16px; gap: 8px; border-radius: 10px; letter-spacing: 1.1px; } .expert-contact a span { display: inline; } .expert-badge { width: 60px; height: 60px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 25px; flex-shrink: 0; box-shadow: 0 2px 8px rgba(0, 0, 0, .2); animation: rotateBadge 3s linear infinite; } .expert-profile { width: 120px !important; height: 120px !important; border-radius: 12px; border: 4px solid #fff; margin-right: 30px !important; box-shadow: 0 2px 5px #dcad6ccc; } .expert-name { font-size: 2.3rem; max-width: 40ch; } .expert-level-mark { right: -20px; top: 34px; font-size: 6.5rem; } .expert-footer { font-size: .85rem; } }
    @media (prefers-reduced-motion: reduce) { .expert-title i, .expert-badge, .expert-level-mark, .expert-card-visible { animation: none !important; transition: none !important; opacity: 1 !important; transform: none !important; } }
  `;

  // =========================================================
  // 2) Storage helpers
  // =========================================================
  function readCache() {
    try { return JSON.parse(localStorage.getItem(LOCAL_CACHE_KEY) || "null"); } catch { return null; }
  }
  function writeCache(obj) {
    try { localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(obj)); } catch {}
  }

  // =========================================================
  // 3) flags
  // =========================================================
  function isForceRefresh() {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.has("refresh"); // 手動 debug
    } catch {
      return false;
    }
  }
  function isDebug() {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.has("debug");
    } catch {
      return false;
    }
  }
  const DEBUG = isDebug();
  function dlog() { if (DEBUG && window.console) console.log.apply(console, arguments); }

  // =========================================================
  // 4) Safe fetch JSON（✅ ads 同款：先 text 再 parse，更穩）
  // =========================================================
  async function fetchJSON(url, { cacheMode }, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      dlog("[expert] fetch =>", url);

      const res = await fetch(url, {
        cache: cacheMode || "no-cache",
        signal: controller.signal,
        headers: { "Accept": "application/json" }
      });

      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = null; }

      dlog("[expert] resp <=", res.status, data && data.code ? ("code=" + data.code) : "");

      return { ok: res.ok, status: res.status, data };
    } catch (e) {
      return { ok: false, status: 0, data: null };
    } finally {
      clearTimeout(timer);
    }
  }

  // =========================================================
  // 5) URL builder (Unified Router safe)
  // =========================================================
  function buildUrl({ meta = false, v = "", refresh = false } = {}) {
    const u = new URL(API_URL);

    if (meta) u.searchParams.set("meta", "1");

    // ✅ A Rule：有 version 才帶 v
    if (!meta && v && String(v).trim() !== "") {
      u.searchParams.set("v", String(v));
    }

    // refresh=1（只給 ?refresh debug 用）
    if (refresh) u.searchParams.set("refresh", "1");

    return u.toString();
  }

  async function requestMeta() {
    const url = buildUrl({ meta: true });
    // meta 要最新：no-store 最乾淨（跟 ads 一致）
    return await fetchJSON(url, { cacheMode: "no-store" }, META_TIMEOUT_MS);
  }

  async function requestFull({ v, refresh }) {
    const url = buildUrl({ meta: false, v: v || "", refresh: !!refresh });
    const cacheMode = refresh ? "reload" : "no-cache";
    return await fetchJSON(url, { cacheMode }, FETCH_TIMEOUT_MS);
  }

  // =========================================================
  // 5.5) Payload extractor (保持)
  // =========================================================
  function extractList(payload) {
    if (!payload) return null;
    if (Array.isArray(payload.data)) return payload.data;
    if (payload.data && Array.isArray(payload.data.data)) return payload.data.data;
    if (Array.isArray(payload.list)) return payload.list;
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.result)) return payload.result;
    return null;
  }

  function extractVersion(payload) {
    if (!payload) return "";
    if (payload.version) return String(payload.version);
    if (payload.latest) return String(payload.latest);
    if (payload.ver) return String(payload.ver);
    return "";
  }

  // =========================================================
  // 6) Smart engine (Meta-First, Ads-aligned)
  // =========================================================
  async function getExpertSmart(forceRefresh) {
    const now = Date.now();
    const cached = readCache();

    const cachedVersion = cached && cached.version ? String(cached.version) : "";
    const cachedTs = cached && cached.timestamp ? Number(cached.timestamp) : 0;
    const cachedData = cached ? cached.data : null;
    const metaFailAt = cached && cached.metaFailAt ? Number(cached.metaFailAt) : 0;

    // -------------------------------------------------------
    // (A) ?refresh（手動 debug）：仍走 refresh=1 bypass
    //     但先 meta 拿 latest，讓你能指定最新版本（更一致）
    // -------------------------------------------------------
    if (forceRefresh) {
      const m = await requestMeta().catch(() => null);
      const latest = m && m.data && m.data.code === 200 && m.data.version ? String(m.data.version) : "";

      // refresh=1 會 bypass edge（debug 用）
      const r = await requestFull({ v: latest || cachedVersion || "", refresh: true }).catch(() => null);
      const payload = r && r.data;

      if (payload && payload.code === 200) {
        const list = extractList(payload);
        const ver = extractVersion(payload) || latest || cachedVersion || "0";
        if (Array.isArray(list)) {
          writeCache({ version: String(ver), data: list, timestamp: now, metaFailAt: 0 });
          return list;
        }
      }
      return cachedData || null;
    }

    // -------------------------------------------------------
    // (B) Cold / first load：✅ meta-first（不打 no-v）
    // -------------------------------------------------------
    if (!cached) {
      const m = await requestMeta().catch(() => null);
      const latest = m && m.data && m.data.code === 200 && m.data.version ? String(m.data.version) : "";

      if (latest) {
        const r = await requestFull({ v: latest, refresh: false }).catch(() => null);
        const payload = r && r.data;

        if (payload && payload.code === 200) {
          const list = extractList(payload);
          const ver = extractVersion(payload) || latest || "0";
          if (Array.isArray(list)) {
            writeCache({ version: String(ver), data: list, timestamp: now, metaFailAt: 0 });
            return list;
          }
        }
      }

      // meta 也拿不到：保守回 null（不打 no-v，符合你要的乾淨策略）
      // 若你想「meta 掛了仍可救援」再告訴我，我可加可選 fallback。
      return null;
    }

    // -------------------------------------------------------
    // (C) TTL 內：0 request
    // -------------------------------------------------------
    if (cachedTs && (now - cachedTs < LOCAL_CACHE_EXPIRY_MS)) {
      return cachedData;
    }

    // -------------------------------------------------------
    // (D) meta probe（含 cooldown）
    // -------------------------------------------------------
    let metaVersion = "";
    const canMeta = (!metaFailAt || (now - metaFailAt > META_FAIL_COOLDOWN_MS));

    if (canMeta) {
      const m = await requestMeta().catch(() => null);
      metaVersion = m && m.data && m.data.code === 200 && m.data.version ? String(m.data.version) : "";

      if (!metaVersion) {
        writeCache({ ...cached, metaFailAt: now }); // meta fail => cooldown
      }
    } else {
      dlog("[expert] meta cooldown active");
    }

    // (E) meta same => renew timestamp only
    if (metaVersion && cachedVersion && metaVersion === cachedVersion && cachedData) {
      writeCache({ ...cached, timestamp: now, metaFailAt: 0 });
      return cachedData;
    }

    // (F) meta changed => V-FULL (WITH v=latest)
    if (metaVersion && metaVersion !== cachedVersion) {
      const r = await requestFull({ v: metaVersion, refresh: false }).catch(() => null);
      const payload = r && r.data;

      if (payload && payload.code === 200) {
        const list = extractList(payload);
        const ver = extractVersion(payload) || metaVersion;

        if (Array.isArray(list)) {
          writeCache({ version: String(ver), data: list, timestamp: now, metaFailAt: 0 });
          return list;
        }
      }

      // v-full fail => fallback old
      writeCache({ ...cached, timestamp: now, metaFailAt: 0 });
      return cachedData;
    }

    // (G) meta 拿不到：保守用舊版本 v-full（維持 edge 命中）
    if (cachedVersion) {
      const r = await requestFull({ v: cachedVersion, refresh: false }).catch(() => null);
      const payload = r && r.data;

      if (payload && payload.code === 200) {
        const list = extractList(payload);
        const ver = extractVersion(payload) || cachedVersion;

        if (Array.isArray(list)) {
          writeCache({ version: String(ver), data: list, timestamp: now, metaFailAt: 0 });
          return list;
        }
      }
    }

    // 最後 fallback：續命舊資料
    writeCache({ ...cached, timestamp: now, metaFailAt: 0 });
    return cachedData;
  }

  // =========================================================
  // 7) UI System（原封不動）
  // =========================================================
  const ExpertCardSystem = {
    LEVELS: {
      "社區人氣王": { icon: "fa-fire", title: "【社區人氣王】", mark: "HOT" },
      "社區專家": { icon: "fa-trophy", title: "【社區專家】", mark: "PRO+" },
      "社區大師": { icon: "fa-crown", title: "【社區大師】", mark: "MASTER" }
    },
    getTaiwanTime() {
      try {
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        return new Date(utc + (8 * 3600000));
      } catch (error) { return new Date(); }
    },
    isInTimeRange(start, end) {
      try {
        const parseTW = (val) => {
          if (!val) return null;
          if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
          let s = String(val).trim().replace(/\//g, '-').replace(' ', 'T');
          if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00:00';
          if (!/[zZ]|[+\-]\d{2}:\d{2}$/.test(s)) s += '+08:00';
          const d = new Date(s);
          return isNaN(d.getTime()) ? null : d;
        };
        const now = this.getTaiwanTime();
        const s = parseTW(start);
        const e = parseTW(end);
        if (s && e) return now >= s && now <= e;
        if (s && !e) return now >= s;
        if (!s && e) return now <= e;
        return true;
      } catch (e) { return true; }
    },
    escapeHtml(str) {
      if (!str) return '';
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    },
    sanitizeTel(raw) { return raw ? String(raw).replace(/[^\d+]/g, '') : ''; },
    sanitizeHref(raw, allowLine = false) {
      if (!raw) return '';
      const s = String(raw).trim();
      if (/^https?:\/\//i.test(s)) return s;
      if (/^tel:/i.test(s)) return s;
      if (allowLine && /^https?:\/\/(line\.me|lin\.ee)\//i.test(s)) return s;
      return '';
    },
    generateCardHTML(opt) {
      const lvl = this.LEVELS[opt.level];
      if (!lvl) return '';
      const imageSrc = this.escapeHtml(opt.image);
      const telClean = this.sanitizeTel(opt.phone);
      const telHref = telClean ? `tel:${telClean}` : '';
      const lineHref = this.sanitizeHref(opt.line, true);

      return `<div class="expert-card-wrapper expert-platinum expert-card-hidden">
        <div class="expert-card expert-platinum">
          <div class="expert-badge"><i class="fas ${lvl.icon}"></i></div>
          <img alt="頭像" class="expert-profile" src="${imageSrc}" loading="eager" referrerpolicy="no-referrer" width="120" height="120" />
          <div class="expert-info">
            <div class="expert-title"><i class="fas ${lvl.icon}"></i>${lvl.title}</div>
            <div class="expert-name-row">
              <div class="expert-name">${this.escapeHtml(opt.name)}</div>
              <div class="expert-contact">
                ${telHref ? `<a class="expert-contact-phone" href="${telHref}"><i class="fas fa-phone-alt"></i><span>${this.escapeHtml(opt.phone)}</span></a>` : ''}
                ${lineHref ? `<a class="expert-contact-line" href="${lineHref}" target="_blank" rel="noopener noreferrer"><i class="fab fa-line"></i><span>LINE</span></a>` : ''}
              </div>
            </div>
            <div class="expert-footer">證號：${this.escapeHtml(opt.license || '')}｜經紀業：${this.escapeHtml(opt.company || '')}</div>
            <div class="expert-level-mark">${lvl.mark}&nbsp;</div>
          </div>
        </div>
      </div>`;
    },
    injectFont() {
      if (!document.querySelector('link[href*="Shrikhand"]')) {
        const fontLink = document.createElement('link');
        fontLink.rel = 'stylesheet';
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Shrikhand&display=swap';
        document.head.appendChild(fontLink);
      }
    },
    observeVisibility(element) {
      if (!('IntersectionObserver' in window)) {
        element.classList.remove('expert-card-hidden');
        element.classList.add('expert-card-visible');
        return;
      }
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            element.classList.remove('expert-card-hidden');
            element.classList.add('expert-card-visible');
            observer.unobserve(element);
          }
        });
      }, { threshold: 0.1 });
      observer.observe(element);
    },
    run(data) {
      const container = document.getElementById('expert-container');
      if (!container || !container.dataset.caseName) return;

      const caseName = String(container.dataset.caseName || "").trim();
      const list = Array.isArray(data) ? data : [];

      const matchingExperts = list.filter(e =>
        e && String(e.case_name || "").trim() === caseName && this.isInTimeRange(e.start, e.end)
      );

      if (matchingExperts.length === 0) return;

      const selected = matchingExperts[Math.floor(Math.random() * matchingExperts.length)];
      container.innerHTML = this.generateCardHTML(selected);

      requestAnimationFrame(() => {
        container.classList.add('loaded');
        const card = container.querySelector('.expert-card-wrapper');
        if (card) this.observeVisibility(card);
      });

      this.injectFont();
    }
  };

  function injectStyles() {
    if (document.getElementById('daju-expert-css-v4')) return;
    const style = document.createElement('style');
    style.id = 'daju-expert-css-v4';
    style.textContent = WIDGET_CSS;
    document.head.appendChild(style);
  }

  // =========================================================
  // 8) Main（保持）
  // =========================================================
  async function init() {
    const container = document.getElementById('expert-container');
    if (container) container.classList.add('expert-container-v4');

    injectStyles();

    const forceRefresh = isForceRefresh();
    const data = await getExpertSmart(forceRefresh);

    if (data) ExpertCardSystem.run(data);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window, document);
