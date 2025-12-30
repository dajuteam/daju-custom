/**
 * 大橘廣告管理系統前端 JS（V5.0.0 - Global+Zones+MultiItems + Meta Stable + BFCache Fix + Deferred Cache Write + ✅ Edge HIT Friendly）
 * ----------------------------------------------------------------------------
 * ✅ 對齊你新的 GAS V5.0 輸出結構（data 內是 { global, zones }）
 *
 * GAS 回傳（data）：
 * {
 *   global: {
 *     "top-ad": { enabled: true, items: [ {type,img,link,video,html,class,alt,title}, ... ] },
 *     "building-ad": { enabled: false, items: [ ... ] }
 *   },
 *   zones: {
 *     "水湳經貿": { "building-ad": [ {..}, {..} ] },
 *     "13期重劃": { "building-ad": [ {..} ] }
 *   }
 * }
 *
 * ✅ 規則（你定的策略含義）：
 * - global[slotId].enabled === true  => 🔒 全站鎖死用 global（不允許 zone 覆蓋）
 * - global[slotId].enabled === false => 🧩 交給 zone（用 data-case-zone 找 zones[zone][slotId]）
 *
 * ✅ 輪播/隨機：
 * - 同 slotId 多筆 => items[] 或 zones[zone][slotId] 是 array
 * - 由 JS random 決定顯示哪一筆（2筆=50/50、3筆=33%）
 *
 * ✅ 維持你原本目標：
 * 1) localStorage TTL 內：0 request
 * 2) TTL 到期：打 meta=1 小包確認版本
 *    - 沒變：續命 timestamp（仍 0 full request）
 *    - 有變：打 full 用 ?v=最新版本（讓 Worker 用版本型快取，edge HIT）
 * 3) 首次 / 清 cookie：meta 拿 version，再用 v=version 拉 full（不走 refresh=1）
 * 4) 只有 URL 帶 ?refresh 才走 refresh=1（完全 bypass）
 * 5) BFCache pageshow persisted 修補
 * 6) localStorage 寫入延後（requestIdleCallback）
 */

// ==========================================
//  0) 全域設定
// ==========================================
const ADS_GAS_URL = "https://daju-unified-route-api.dajuteam88.workers.dev/?type=ads_injector";
const LOCAL_CACHE_KEY = "daju_ads_cache";

// ✅ localStorage 的有效時間（TTL 內完全 0 request）
const LOCAL_CACHE_EXPIRY_MS = 5 * 60 * 1000;

// ✅ fetch 超時保護
const FETCH_TIMEOUT_MS = 8000;
const META_TIMEOUT_MS  = 4000;

// ==========================================
//  0.5) defer（延後寫入 localStorage，避免卡主執行緒）
// ==========================================
function defer(fn) {
  try {
    if ("requestIdleCallback" in window) {
      requestIdleCallback(() => fn(), { timeout: 1200 });
    } else {
      setTimeout(fn, 0);
    }
  } catch {
    try { setTimeout(fn, 0); } catch {}
  }
}

// ==========================================
//  1) CSS 注入（保留原樣式）
// ==========================================
function injectStyles() {
  if (document.getElementById("daju-ad-manager-styles")) return;
  const style = document.createElement("style");
  style.id = "daju-ad-manager-styles";
  style.textContent = `
    .ad-slot { width: 100%; margin: 20px 0; display: none; overflow: hidden; }
    .ad-slot img { display: block; width: 100%; height: auto; object-fit: cover; }
    .ad-video-wrapper { position: relative; width: 100%; padding-bottom: 56.25%; background: #000; }
    .ad-video-wrapper iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; }
    .ad-fade-in { animation: adFadeIn 0.35s ease-in forwards; }
    @keyframes adFadeIn { from { opacity: 0; } to { opacity: 1; } }
  `;
  document.head.appendChild(style);
}

// ==========================================
//  2) localStorage helpers（延後寫入）
// ==========================================
function readCache() {
  try { return JSON.parse(localStorage.getItem(LOCAL_CACHE_KEY) || "null"); } catch { return null; }
}
function writeCache(obj) {
  defer(() => {
    try { localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(obj)); } catch {}
  });
}

// ==========================================
//  3) slotMap（一次掃描 DOM，支援同 slotId 多個元素）
// ==========================================
function buildSlotMap() {
  // Map<slotId, HTMLElement[]>
  const map = new Map();
  document.querySelectorAll(".ad-slot").forEach(el => {
    // 記錄「初始 class」，避免每次 render class 累積
    if (!el.dataset.baseClass) el.dataset.baseClass = el.className;

    const slotId = (el.dataset.slotId || "").trim();
    if (!slotId) return;

    if (!map.has(slotId)) map.set(slotId, []);
    map.get(slotId).push(el);
  });
  return map;
}

// ==========================================
//  4) fetch JSON with timeout（✅ 穩定版：先讀 text 再 JSON.parse）
// ==========================================
async function fetchJSON(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { ...(options.headers || {}), "Accept": "application/json" }
    });

    const text = await res.text();
    if (!text) return null;

    try { return JSON.parse(text); } catch { return null; }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ==========================================
//  4.5) URL builder
// ==========================================
function buildAdsUrl({ version, meta, refresh } = {}) {
  const u = new URL(ADS_GAS_URL);

  if (meta) {
    u.searchParams.set("meta", "1");
    return u.toString();
  }

  if (version != null && String(version).trim() !== "") {
    u.searchParams.set("v", String(version));
  }

  if (refresh) {
    u.searchParams.set("refresh", "1");
  }

  return u.toString();
}

// ==========================================
//  4.6) Auto Cache Bust（確保素材也跟著版本更新）
// ==========================================
function appendV(url, v) {
  if (!url || !v) return url;
  const s = String(url).trim();
  if (!s) return s;
  if (/^(javascript:|data:|blob:)/i.test(s)) return s;

  try {
    const u = new URL(s, location.href);
    u.searchParams.set("v", String(v));
    return u.toString();
  } catch {
    const sep = s.includes("?") ? "&" : "?";
    return s + sep + "v=" + encodeURIComponent(String(v));
  }
}

function bustHtmlUrls(html, v) {
  if (!html || !v) return html;
  const s = String(html);
  if (s.indexOf("src=") === -1 && s.indexOf("SRC=") === -1) return s;

  const srcRe = /(\bsrc=["'])([^"']+)(["'])/gi;
  return s.replace(srcRe, (m, p1, url, p3) => p1 + appendV(url, v) + p3);
}

// ==========================================
//  4.7) API calls
// ==========================================
async function fetchAdsByClientVersion(version, bypassCache = false) {
  const url = buildAdsUrl({ version, meta: false, refresh: !!bypassCache });
  const fetchOptions = bypassCache ? { cache: "reload" } : { cache: "default" };
  return await fetchJSON(url, fetchOptions, FETCH_TIMEOUT_MS);
}

async function fetchMetaVersion() {
  const url = buildAdsUrl({ meta: true });
  return await fetchJSON(url, { cache: "no-store" }, META_TIMEOUT_MS);
}

// ==========================================
//  5) pick helpers（隨機選一筆）
// ==========================================
function pickRandom(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  if (arr.length === 1) return arr[0];
  return arr[Math.floor(Math.random() * arr.length)];
}

// ==========================================
//  5.1) 取得 slot 的 zone（slot 自己 > 往上找 data-case-zone）
//  - 支援你要的：zone 放在 <article class="cases" data-case-zone="...">
// ==========================================
function getSlotZone(slotEl) {
  const own = (slotEl.dataset.caseZone || "").trim();
  if (own) return own;

  const host = slotEl.closest("[data-case-zone]");
  const z = host ? String(host.dataset.caseZone || "").trim() : "";
  return z;
}

// ==========================================
//  5.2) 根據規則挑選要渲染的 ad item
//  - global.enabled=true  => 鎖死用 global.items random
//  - global.enabled=false => 交給 zone：zones[zone][slotId] random
//  - 若 global 不存在：保守策略 => 允許 zone（不然會很容易空）
// ==========================================
function resolveAdForSlot(slotId, slotEl, data) {
  const g = data && data.global ? data.global[slotId] : null;
  const zones = data && data.zones ? data.zones : null;

  // 1) global 存在且 enabled=true => 鎖死 global
  if (g && g.enabled === true) {
    return pickRandom(g.items);
  }

  // 2) global 存在且 enabled=false => 交給 zone
  // 3) global 不存在 => 允許 zone（更容錯）
  const zoneName = getSlotZone(slotEl);
  if (!zoneName || !zones || !zones[zoneName]) return null;

  const zArr = zones[zoneName][slotId];
  return pickRandom(zArr);
}

// ==========================================
//  6) render slot（渲染到畫面）
//  - 這裡吃的是「單一 ad item」：{type,img,link,video,html,class,alt,title}
// ==========================================
function renderSlot(slot, adItem, apiVersion) {
  // 還原初始 class（避免累積造成 CSS 變怪）
  if (slot.dataset.baseClass != null) slot.className = slot.dataset.baseClass;
  else slot.className = "";

  slot.innerHTML = "";
  slot.style.display = "none";
  if (!adItem) return;

  // 追加 class（由資料決定）
  if (adItem.class) {
    String(adItem.class)
      .split(/\s+/)
      .map(s => s.trim())
      .filter(Boolean)
      .forEach(c => slot.classList.add(c));
  }

  let hasContent = false;

  // IMAGE
  if (adItem.type === "image" && adItem.img) {
    const img = document.createElement("img");
    img.src = appendV(adItem.img, apiVersion);
    img.loading = "lazy";
    img.setAttribute("decoding", "async");

    const altText =
      (adItem.alt != null && String(adItem.alt).trim() !== "")
        ? String(adItem.alt).trim()
        : ((adItem.title != null && String(adItem.title).trim() !== "")
            ? String(adItem.title).trim()
            : "房產廣告");
    img.alt = altText;

    const titleText = (adItem.title != null) ? String(adItem.title).trim() : "";
    if (titleText) img.title = titleText;

    const link = (adItem.link != null) ? String(adItem.link).trim() : "";
    if (link) {
      const a = document.createElement("a");
      a.href = link;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.appendChild(img);
      slot.appendChild(a);
    } else {
      slot.appendChild(img);
    }
    hasContent = true;

  // YOUTUBE（預設用 data-src + IntersectionObserver lazy）
  } else if (adItem.type === "youtube" && adItem.video) {
    const wrapper = document.createElement("div");
    wrapper.className = "ad-video-wrapper";

    const iframe = document.createElement("iframe");
    iframe.setAttribute("data-src", appendV(adItem.video, apiVersion));
    iframe.allowFullscreen = true;
    iframe.title = adItem.title || "video";
    iframe.setAttribute("loading", "lazy");
    iframe.referrerPolicy = "strict-origin-when-cross-origin";

    wrapper.appendChild(iframe);
    slot.appendChild(wrapper);
    hasContent = true;

  // HTML
  } else if (adItem.type === "html" && adItem.html) {
    slot.innerHTML = bustHtmlUrls(adItem.html, apiVersion);
    hasContent = true;
  }

  if (hasContent) {
    slot.style.display = "block";
    slot.classList.add("ad-fade-in");
  } else {
    slot.style.display = "none";
  }
}

// ==========================================
//  7) Smart cache logic（Meta Stable）
// ==========================================
async function getAdsSmart(forceRefresh) {
  const cached = readCache();

  // (A) 強制刷新（只有 ?refresh 才走）
  if (forceRefresh) {
    const meta = await fetchMetaVersion();
    const latest = meta && meta.code === 200 ? String(meta.version || "0") : "";

    const full = await fetchAdsByClientVersion(latest, true); // refresh=1
    if (full && full.code === 200 && full.data) {
      const v = String(full.version || latest || "0");
      writeCache({ version: v, data: full.data, timestamp: Date.now() });
      return { data: full.data, version: v };
    }

    return cached ? { data: cached.data, version: String(cached.version || "0") } : null;
  }

  // (B) 首次/清 localStorage：沒有 cache
  if (!cached) {
    const meta = await fetchMetaVersion();
    const latest = meta && meta.code === 200 ? String(meta.version || "0") : "";

    const full = await fetchAdsByClientVersion(latest, false);
    if (full && full.code === 200 && full.data) {
      const v = String(full.version || latest || "0");
      writeCache({ version: v, data: full.data, timestamp: Date.now() });
      return { data: full.data, version: v };
    }
    return null;
  }

  // (C) TTL 內：0 request
  if (cached.timestamp && (Date.now() - cached.timestamp < LOCAL_CACHE_EXPIRY_MS)) {
    return { data: cached.data, version: String(cached.version || "0") };
  }

  // (D) TTL 到：meta 檢查版本
  const meta = await fetchMetaVersion();
  const latest = meta && meta.code === 200 ? String(meta.version || "0") : "";
  const oldV = String(cached.version || "0");

  // 沒變：只續命，不拉 full
  if (latest && oldV === latest) {
    writeCache({ ...cached, timestamp: Date.now() });
    return { data: cached.data, version: oldV };
  }

  // 有變：拉新版 full（用 v=latest）
  const full = await fetchAdsByClientVersion(latest, false);
  if (full && full.code === 200 && full.data) {
    const v = String(full.version || latest || "0");
    writeCache({ version: v, data: full.data, timestamp: Date.now() });
    return { data: full.data, version: v };
  }

  // fail => fallback 舊 cache（避免畫面空）
  writeCache({ ...cached, timestamp: Date.now() });
  return { data: cached.data, version: oldV };
}

// ==========================================
//  8) YouTube lazy load
// ==========================================
function setupLazyIframes() {
  const frames = document.querySelectorAll("iframe[data-src]");
  if (!frames.length) return;

  if (!("IntersectionObserver" in window)) {
    frames.forEach(f => {
      f.src = f.getAttribute("data-src");
      f.removeAttribute("data-src");
    });
    return;
  }

  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const f = entry.target;
      f.src = f.getAttribute("data-src");
      f.removeAttribute("data-src");
      obs.unobserve(f);
    });
  }, { rootMargin: "800px 0px" });

  frames.forEach(f => io.observe(f));
}

// ==========================================
//  9) Main（readyState + BFCache）
// ==========================================
async function insertAds() {
  injectStyles();

  // ✅ 只有頁面網址帶 ?refresh 才強制直通
  const params = new URLSearchParams(window.location.search);
  const forceRefresh = params.has("refresh");

  const slotMap = buildSlotMap();
  if (!slotMap.size) return;

  const result = await getAdsSmart(forceRefresh);
  if (!result || !result.data) return;

  // ✅ 防呆：確保符合新結構
  const data = result.data;
  const hasNewShape = data && (data.global || data.zones);
  if (!hasNewShape) {
    // 若不小心還拿到舊版（slotId->ad），就用舊渲染方式保底
    slotMap.forEach((els, slotId) => {
      const el = els[0];
      try { renderSlot(el, data[slotId], result.version); } catch {}
    });
    setupLazyIframes();
    return;
  }

  // 新版渲染：同 slotId 可能多個元素
  slotMap.forEach((els, slotId) => {
    els.forEach(slotEl => {
      try {
        const adItem = resolveAdForSlot(slotId, slotEl, data);
        renderSlot(slotEl, adItem, result.version);
      } catch (e) {
        console.error("render failed:", slotId, e);
      }
    });
  });

  setupLazyIframes();
}

function bootAds() {
  try { insertAds(); } catch (e) { console.error(e); }
}

// ✅ readyState 啟動
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootAds, { once: true });
} else {
  bootAds();
}

// ✅ BFCache 修補（返回頁也會重新跑）
window.addEventListener("pageshow", (ev) => {
  if (ev && ev.persisted) bootAds();
});
