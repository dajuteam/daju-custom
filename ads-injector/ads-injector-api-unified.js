/**
 * 大橘廣告管理系統API版本 (V4.6 - Meta Stable + Auto Cache Bust) - Unified Router Edition
 * 核心：
 * - 15 分鐘 local TTL：0 request
 * - 過期後 meta=1 探針：版本不同 => refresh=1 拉 full
 * - ✅ 新增：自動把 version 加到 img/iframe/html 內的資源 URL（解「昨天看過今天不更新」）
 */

// ==========================================
//  0) 全域設定
// ==========================================
const ADS_GAS_URL = "https://daju-unified-route-api.dajuteam88.workers.dev/?type=ads_injector"; // ✅ 共用路由
const LOCAL_CACHE_KEY = "daju_ads_cache";
const LOCAL_CACHE_EXPIRY_MS = 15 * 60 * 1000; // 15 分鐘

// 🌐 fetch 超時保護
const FETCH_TIMEOUT_MS = 8000;

// ==========================================
//  1) CSS 注入 (僅保留廣告核心樣式)
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
//  2) localStorage helpers
// ==========================================
function readCache() {
  try { return JSON.parse(localStorage.getItem(LOCAL_CACHE_KEY) || "null"); } catch { return null; }
}
function writeCache(obj) {
  try { localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(obj)); } catch {}
}

// ==========================================
//  3) slotMap（一次掃描 DOM）
// ==========================================
function buildSlotMap() {
  const map = new Map();
  document.querySelectorAll(".ad-slot").forEach(el => {
    if (!el.dataset.baseClass) el.dataset.baseClass = el.className;
    const slotId = el.dataset.slotId;
    if (slotId) map.set(slotId, el);
  });
  return map;
}

// ==========================================
//  4) fetch JSON with timeout
// ==========================================
async function fetchJSON(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(options.headers || {}),
        "Accept": "application/json"
      }
    });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ==========================================
//  4.5) URL builder（避免兩個 ? / 拼參數錯）
// ==========================================
function buildAdsUrl({ version, meta, refresh } = {}) {
  const u = new URL(ADS_GAS_URL);

  if (meta) {
    u.searchParams.set("meta", "1");
    return u.toString();
  }

  // A Rule：有 version => PROBE（帶 v），無 version => FULL（不帶 v）
  if (version != null && String(version).trim() !== "") {
    u.searchParams.set("v", String(version));
  }

  if (refresh) {
    u.searchParams.set("refresh", "1");
  }

  return u.toString();
}

// ==========================================
//  4.6) Auto Cache Bust helpers（✅ 新增重點）
// ==========================================
function appendV(url, v) {
  if (!url || !v) return url;
  const s = String(url).trim();
  if (!s) return s;

  // 排除 javascript:, data: 之類（避免污染）
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
  const srcRe = /(\bsrc=["'])([^"']+)(["'])/gi;
  return String(html).replace(srcRe, (m, p1, url, p3) => p1 + appendV(url, v) + p3);
}

// ✅ 取得資料
async function fetchAdsByClientVersion(cachedVersion, bypassCache = false) {
  const url = buildAdsUrl({
    version: cachedVersion,
    meta: false,
    refresh: !!bypassCache
  });

  const fetchOptions = bypassCache ? { cache: "reload" } : {};
  return await fetchJSON(url, fetchOptions);
}

// ✅ meta 版本檢查（超輕量）
async function fetchMetaVersion() {
  const url = buildAdsUrl({ meta: true });
  return await fetchJSON(url, {}, 4000);
}

// ==========================================
//  5) render slot（✅ 加入 apiVersion 自動 bust）
// ==========================================
function renderSlot(slot, adData, apiVersion) {
  if (slot.dataset.baseClass != null) slot.className = slot.dataset.baseClass;

  if (!adData) {
    slot.style.display = "none";
    slot.innerHTML = "";
    return;
  }

  slot.innerHTML = "";

  if (adData.class) {
    String(adData.class).split(/\s+/).forEach(cls => {
      if (cls.trim()) slot.classList.add(cls.trim());
    });
  }

  let hasContent = false;

  if (adData.type === "image" && adData.img) {
    const a = document.createElement("a");
    a.href = adData.link || "#";
    a.target = "_blank";
    a.rel = "noopener noreferrer";

    const img = document.createElement("img");
    img.src = appendV(adData.img, apiVersion); // ✅ bust
    img.loading = "lazy";
    img.setAttribute("decoding", "async");
    img.alt = adData.alt || adData.title || "房產廣告";

    a.appendChild(img);
    slot.appendChild(a);
    hasContent = true;

  } else if (adData.type === "youtube" && adData.video) {
    const wrapper = document.createElement("div");
    wrapper.className = "ad-video-wrapper";

    const iframe = document.createElement("iframe");
    iframe.setAttribute("data-src", appendV(adData.video, apiVersion)); // ✅ bust
    iframe.allowFullscreen = true;
    iframe.title = adData.title || "video";

    wrapper.appendChild(iframe);
    slot.appendChild(wrapper);
    hasContent = true;

  } else if (adData.type === "html" && adData.html) {
    // ✅ bust html 內所有 src=
    slot.innerHTML = bustHtmlUrls(adData.html, apiVersion);
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
//  6) Smart cache logic (Meta Stable) ✅ 回傳 {data, version}
// ==========================================
async function getAdsSmart(forceRefresh) {
  const cached = readCache();

  // 首次/強制：1 次請求（不帶 v；若 forceRefresh 則 refresh=1）
  if (!cached || forceRefresh) {
    try {
      const full = await fetchAdsByClientVersion("", forceRefresh);
      if (full && full.code === 200 && full.data) {
        const v = String(full.version || "0");
        writeCache({ version: v, data: full.data, timestamp: Date.now() });
        return { data: full.data, version: v };
      }
    } catch (e) {
      console.error("Load failed:", e);
    }
    return cached ? { data: cached.data, version: String(cached.version || "0") } : null;
  }

  // 15 分鐘內：0 請求
  if (Date.now() - cached.timestamp < LOCAL_CACHE_EXPIRY_MS) {
    return { data: cached.data, version: String(cached.version || "0") };
  }

  // 15 分鐘後：先 meta 檢查
  try {
    const meta = await fetchMetaVersion();
    const latest = meta && meta.code === 200 ? String(meta.version || "0") : "";
    const oldV = String(cached.version || "0");

    // 版本沒變：續命 timestamp
    if (latest && oldV === latest) {
      writeCache({ ...cached, timestamp: Date.now() });
      return { data: cached.data, version: oldV };
    }

    // 版本有變：refresh=1 拉 full
    const full = await fetchAdsByClientVersion("", true);
    if (full && full.code === 200 && full.data) {
      const v = String(full.version || latest || "0");
      writeCache({ version: v, data: full.data, timestamp: Date.now() });
      return { data: full.data, version: v };
    }

    // 失敗：退回舊資料
    writeCache({ ...cached, timestamp: Date.now() });
    return { data: cached.data, version: oldV };

  } catch (err) {
    writeCache({ ...cached, timestamp: Date.now() });
    return { data: cached.data, version: String(cached.version || "0") };
  }
}

// ==========================================
//  7) YouTube lazy load
// ==========================================
function setupLazyIframes() {
  if (!("IntersectionObserver" in window)) {
    document.querySelectorAll("iframe[data-src]").forEach(f => {
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
  }, { rootMargin: "200px 0px" });

  document.querySelectorAll("iframe[data-src]").forEach(f => io.observe(f));
}

// ==========================================
//  8) Main
// ==========================================
async function insertAds() {
  injectStyles();

  const params = new URLSearchParams(window.location.search);
  const forceRefresh = params.has("refresh");

  const slotMap = buildSlotMap();
  if (!slotMap.size) return;

  const result = await getAdsSmart(forceRefresh);
  if (!result || !result.data) return;

  // ✅ 這裡把 version 帶進 renderSlot，讓影片/圖片/HTML 資源跟著版本更新
  slotMap.forEach((slot, slotId) => renderSlot(slot, result.data[slotId], result.version));
  setupLazyIframes();
}

document.addEventListener("DOMContentLoaded", insertAds);
