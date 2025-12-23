/**
 * 大橘廣告管理系統API版本 (V4.7 - Meta Stable + BFCache Fix + Deferred Cache Write + YT Poster Click)
 * 核心：
 * - local TTL：0 request
 * - 過期後 meta=1 探針：版本不同 => refresh=1 拉 full
 * - 自動把 version 加到 img/html 內資源 URL（解「昨天看過今天不更新」）
 *
 * ✅ 本次必做優化（你指定）：
 * 1) pageshow/BFCache（不更新最關鍵）
 * 2) writeCache 延後寫入（手機卡頓最關鍵）
 * 3) bustHtmlUrls 先 check（超低成本高回報）
 * 4) readyState 啟動（首屏速度）
 * 5) fetchJSON 更穩（穩定性/例外成本）
 * 6) YouTube：縮圖 + 點擊後才載入 iframe（首屏體感最顯著）
 */

// ==========================================
//  0) 全域設定
// ==========================================
const ADS_GAS_URL = "https://daju-unified-route-api.dajuteam88.workers.dev/?type=ads_injector"; // ✅ 共用路由
const LOCAL_CACHE_KEY = "daju_ads_cache";
const LOCAL_CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 分鐘（你目前設定；未改參數，先保守）
const FETCH_TIMEOUT_MS = 8000;

// meta timeout（維持你原 4000，但統一成常數好管理）
const META_TIMEOUT_MS = 4000;

// ==========================================
//  0.5) 小工具：排程/延後（避免手機 main thread 瞬間卡）
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
//  1) CSS 注入 (僅保留廣告核心樣式)
//  - ✅ 新增：YT poster button/overlay 基本樣式（不影響既有 slot class 邏輯）
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

    /* ✅ YouTube Poster (縮圖點擊才載入 iframe) */
    .ad-yt-poster {
      position: absolute; inset: 0;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; user-select: none;
      background: #000;
    }
    .ad-yt-poster img {
      width: 100%; height: 100%;
      object-fit: cover;
      opacity: 0.92;
    }
    .ad-yt-play {
      position: absolute;
      width: 68px; height: 48px;
      border-radius: 12px;
      background: rgba(0,0,0,0.65);
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 8px 24px rgba(0,0,0,0.35);
    }
    .ad-yt-play:before {
      content: "";
      display: block;
      margin-left: 4px;
      width: 0; height: 0;
      border-left: 16px solid #fff;
      border-top: 10px solid transparent;
      border-bottom: 10px solid transparent;
    }
    .ad-yt-poster:focus { outline: none; }
    .ad-yt-poster:focus-visible { box-shadow: 0 0 0 3px rgba(255,255,255,0.85) inset; }
  `;
  document.head.appendChild(style);
}

// ==========================================
//  2) localStorage helpers
//  - ✅ writeCache 延後寫入：避免手機同步 setItem 大字串卡頓
// ==========================================
function readCache() {
  try { return JSON.parse(localStorage.getItem(LOCAL_CACHE_KEY) || "null"); } catch { return null; }
}
function writeCache(obj) {
  // ✅ 重要：延後到 idle/下一輪 event loop（避免主執行緒瞬間凍結）
  defer(() => {
    try { localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(obj)); } catch {}
  });
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
//  4) fetch JSON with timeout (✅ 更穩)
//  - ✅ 防：非 JSON / 502 HTML / 0 byte / abort
//  - ✅ 回傳 null 而不是丟例外，降低例外成本
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

    // 盡量避免 res.json() 丟例外打爆流程
    let data = null;
    try { data = await res.json(); } catch { data = null; }

    return data;
  } catch (e) {
    // 任何 fetch/abort/network error：回 null，交給上層 fallback
    return null;
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

// ✅ bustHtmlUrls 先 check（超低成本高回報）
function bustHtmlUrls(html, v) {
  if (!html || !v) return html;

  const s = String(html);
  // ✅ 低成本快檢：沒有 src= 就不用 regex replace
  if (s.indexOf("src=") === -1 && s.indexOf("SRC=") === -1) return s;

  const srcRe = /(\bsrc=["'])([^"']+)(["'])/gi;
  return s.replace(srcRe, (m, p1, url, p3) => p1 + appendV(url, v) + p3);
}

// ✅ 取得資料
async function fetchAdsByClientVersion(cachedVersion, bypassCache = false) {
  const url = buildAdsUrl({
    version: cachedVersion,
    meta: false,
    refresh: !!bypassCache
  });

  const fetchOptions = bypassCache ? { cache: "reload" } : { cache: "no-cache" };
  return await fetchJSON(url, fetchOptions, FETCH_TIMEOUT_MS);
}

// ✅ meta 版本檢查（超輕量）
async function fetchMetaVersion() {
  const url = buildAdsUrl({ meta: true });
  return await fetchJSON(url, { cache: "no-cache" }, META_TIMEOUT_MS);
}

// ==========================================
//  4.7) YouTube helpers（✅ 新增）
//  - 把 embed URL 轉成影片 id，再組縮圖
// ==========================================
function getYouTubeIdFromUrl(u) {
  try {
    const s = String(u || "").trim();
    if (!s) return "";

    // 1) https://www.youtube.com/embed/VIDEO_ID
    let m = s.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/i);
    if (m && m[1]) return m[1];

    // 2) https://youtu.be/VIDEO_ID
    m = s.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/i);
    if (m && m[1]) return m[1];

    // 3) watch?v=VIDEO_ID
    const url = new URL(s, location.href);
    const v = url.searchParams.get("v");
    if (v) return v;

    return "";
  } catch {
    return "";
  }
}

function buildYouTubeThumbUrl(videoUrl) {
  const id = getYouTubeIdFromUrl(videoUrl);
  if (!id) return "";
  // 先用 hqdefault（最穩）；maxresdefault 有時不存在會 404
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

// ==========================================
//  5) render slot（✅ 加入 apiVersion 自動 bust）
//  - ✅ YouTube：改為「縮圖 + 點擊後才載入 iframe」
// ==========================================
function renderSlot(slot, adData, apiVersion) {
  // ✅ 1. 永遠回到「乾淨基礎狀態」
  if (slot.dataset.baseClass != null) {
    slot.className = slot.dataset.baseClass;
  } else {
    slot.className = "";
  }

  // 清內容
  slot.innerHTML = "";
  slot.style.display = "none";

  // ✅ 2. 沒資料 = 乾淨空 slot
  if (!adData) return;

  // ✅ 3. 本次 render 才決定要不要加 class
  if (adData.class) {
    String(adData.class)
      .split(/\s+/)
      .map(c => c.trim())
      .filter(Boolean)
      .forEach(c => slot.classList.add(c));
  }

  let hasContent = false;

if (adData.type === "image" && adData.img) {
  const img = document.createElement("img");
  img.src = appendV(adData.img, apiVersion); // ✅ bust
  img.loading = "lazy";
  img.setAttribute("decoding", "async");
  img.alt = adData.alt || adData.title || "房產廣告";

  const link = (adData.link != null) ? String(adData.link).trim() : "";

  // ✅ 只有 link 有值才包 <a>，否則純圖片
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
}else if (adData.type === "youtube" && adData.video) {
    // =========================================================
    // ✅✅✅ YouTube 重大改動：縮圖 + 點擊後才載入 iframe
    // =========================================================
    const wrapper = document.createElement("div");
    wrapper.className = "ad-video-wrapper";

    const embedUrl = appendV(adData.video, apiVersion); // ✅ bust
    const thumb = buildYouTubeThumbUrl(adData.video);

    // Poster（可 focus，無障礙）
    const posterBtn = document.createElement("button");
    posterBtn.type = "button";
    posterBtn.className = "ad-yt-poster";
    posterBtn.setAttribute("aria-label", "播放影片");
    posterBtn.style.border = "0";
    posterBtn.style.padding = "0";

    // 縮圖
    if (thumb) {
      const img = document.createElement("img");
      img.src = thumb;               // ✅ 先載入縮圖，超快
      img.alt = adData.title || "YouTube";
      img.loading = "lazy";
      img.setAttribute("decoding", "async");
      posterBtn.appendChild(img);
    }

    // Play Icon
    const play = document.createElement("div");
    play.className = "ad-yt-play";
    posterBtn.appendChild(play);

    // 點擊後才建立 iframe（避免首屏被 YouTube 拖慢）
    posterBtn.addEventListener("click", () => {
      // 防重複建立
      if (wrapper.querySelector("iframe")) return;

      const iframe = document.createElement("iframe");
      iframe.src = embedUrl; // ✅ 這裡才真正載入 YouTube
      iframe.allowFullscreen = true;
      iframe.title = adData.title || "video";
      iframe.setAttribute("loading", "lazy");
      iframe.referrerPolicy = "strict-origin-when-cross-origin";

      // 取代 poster
      wrapper.innerHTML = "";
      wrapper.appendChild(iframe);
    }, { passive: true });

    wrapper.appendChild(posterBtn);
    slot.appendChild(wrapper);
    hasContent = true;

    // ✅ 如果你未來想「回到原本預設 lazy iframe」：
    // 1) 把這個 youtube 區塊整段改回「建立 iframe + data-src」
    // 2) 然後保留 setupLazyIframes()（下方還留著，供你切回）
    // ---------------------------------------------------------

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
//  - ✅ writeCache 已延後（避免手機卡）
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

  // TTL 內：0 請求
  if (cached.timestamp && (Date.now() - cached.timestamp < LOCAL_CACHE_EXPIRY_MS)) {
    return { data: cached.data, version: String(cached.version || "0") };
  }

  // TTL 後：先 meta 檢查
  try {
    const meta = await fetchMetaVersion();
    const latest = meta && meta.code === 200 ? String(meta.version || "0") : "";
    const oldV = String(cached.version || "0");

    // 版本沒變：續命 timestamp（延後寫入）
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
//  7) YouTube lazy load（保留：給你切回「原本預設方法」用）
//  - ✅ 目前 YouTube 已改成「點擊才建立 iframe」
//  - 如果你切回 data-src 版本，這段才需要保留呼叫
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
//  - ✅ readyState 啟動（首屏速度）
//  - ✅ pageshow/BFCache：從快取返回也會重跑（不更新最關鍵）
// ==========================================
async function insertAds() {
  injectStyles();

  const params = new URLSearchParams(window.location.search);
  const forceRefresh = params.has("refresh");

  const slotMap = buildSlotMap();
  if (!slotMap.size) return;

  const result = await getAdsSmart(forceRefresh);
  if (!result || !result.data) return;

  // ✅ 這裡把 version 帶進 renderSlot，讓圖片/HTML/YouTube embed 版本更新
  slotMap.forEach((slot, slotId) => {
    try {
      renderSlot(slot, result.data[slotId], result.version);
    } catch (e) {
      // 單一 slot 壞掉不該拖垮整頁
      console.error("renderSlot failed:", slotId, e);
    }
  });

  // ✅ 注意：目前 YouTube 已改成「點擊才建立 iframe」，所以 setupLazyIframes() 不再必要
  // 但我保留這行（安全）：只有 data-src iframe 才會被掃到，現在通常為 0 個
  setupLazyIframes();
}

// ✅ readyState：能更早啟動（若 DOM 已 ready 就不等）
function bootAds() {
  try { insertAds(); } catch (e) { console.error(e); }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootAds, { once: true });
} else {
  bootAds();
}

// ✅ pageshow/BFCache：從上一頁返回時，DOMContentLoaded 不會再跑
// - persisted=true 代表 BFCache 恢復
window.addEventListener("pageshow", (ev) => {
  if (ev && ev.persisted) {
    // 重要：回來時重新執行一次，以便拿到最新版本並刷新畫面
    bootAds();
  }
});
