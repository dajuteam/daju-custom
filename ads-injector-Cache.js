/**
 * Daju Ad Management System (V4.1 - Toggle Version)
 * 核心：全域 UI 開關、零 CLS 跳動、智慧快取
 */

// ==========================================
//  0) 全域設定與開關
// ==========================================
const ADS_GAS_URL = "https://daju-ads-injector-api.dajuteam88.workers.dev";
//const ADS_GAS_URL = "https://script.google.com/macros/s/AKfycbzvA6Q69iJK4BCBmyhv2BLNClxqJw3Fk6i3KZqQwU5BSda1Ls4BSoFQDyC8ikL12HRJ/exec";
const LOCAL_CACHE_KEY = "daju_ads_cache";
const LOCAL_CACHE_EXPIRY_MS = 15 * 60 * 1000; 

// 🚀 [快速開關] 想看提示設為 true，想隱藏設為 false
const SHOW_LOADING_UI = false; 

// 1) CSS 注入
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

    .daju-ads-loading {
      position: fixed; right: 12px; bottom: 12px; z-index: 99999;
      display: flex; align-items: center; gap: 8px; padding: 8px 10px;
      border-radius: 10px; background: rgba(0,0,0,0.62); color: #fff;
      font-size: 12px; line-height: 1; opacity: 0; transform: translateY(6px);
      transition: opacity .18s ease, transform .18s ease; pointer-events: none;
      -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);
    }
    .daju-ads-loading.show { opacity: 1; transform: translateY(0); }
    .daju-ads-loading .spinner {
      width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.35);
      border-top-color: rgba(255,255,255,0.95); border-radius: 50%;
      animation: dajuAdsSpin .8s linear infinite; flex: 0 0 auto;
    }
    @keyframes dajuAdsSpin { to { transform: rotate(360deg); } }
  `;
  document.head.appendChild(style);
}

// 2) 輔助功能
function readCache() { try { return JSON.parse(localStorage.getItem(LOCAL_CACHE_KEY) || "null"); } catch { return null; } }
function writeCache(obj) { try { localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(obj)); } catch {} }

function showGlobalLoading() {
  if (!SHOW_LOADING_UI) return; // ✅ 開關檢查
  if (document.getElementById("daju-ads-loading")) return;
  const el = document.createElement("div");
  el.id = "daju-ads-loading"; el.className = "daju-ads-loading";
  el.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>資料載入中…</span>`;
  (document.body || document.documentElement).appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
}

function hideGlobalLoading() {
  if (!SHOW_LOADING_UI) return; // ✅ 開關檢查
  const el = document.getElementById("daju-ads-loading");
  if (!el) return;
  el.classList.remove("show");
  setTimeout(() => { try { el.remove(); } catch {} }, 220);
}

function buildSlotMap() {
  const map = new Map();
  document.querySelectorAll(".ad-slot").forEach(el => {
    if (!el.dataset.baseClass) el.dataset.baseClass = el.className;
    const slotId = el.dataset.slotId;
    if (slotId) map.set(slotId, el);
  });
  return map;
}

async function fetchAdsByClientVersion(cachedVersion) {
  const hasV = cachedVersion != null && String(cachedVersion).trim() !== "";
  const url = hasV ? `${ADS_GAS_URL}?v=${encodeURIComponent(String(cachedVersion))}` : ADS_GAS_URL;
  const res = await fetch(url, { cache: "no-store" });
  return await res.json();
}

function renderSlot(slot, adData) {
  if (slot.dataset.baseClass != null) slot.className = slot.dataset.baseClass;
  if (!adData) { slot.style.display = "none"; slot.innerHTML = ""; return; }
  slot.innerHTML = "";
  if (adData.class) {
    String(adData.class).split(/\s+/).forEach(cls => { if (cls.trim()) slot.classList.add(cls.trim()); });
  }
  let hasContent = false;
  if (adData.type === "image" && adData.img) {
    const a = document.createElement("a");
    a.href = adData.link || "#"; a.target = "_blank"; a.rel = "noopener noreferrer";
    const img = document.createElement("img");
    img.src = adData.img; img.loading = "lazy"; img.setAttribute("decoding", "async");
    a.appendChild(img); slot.appendChild(a); hasContent = true;
  } else if (adData.type === "youtube" && adData.video) {
    const wrapper = document.createElement("div");
    wrapper.className = "ad-video-wrapper";
    const iframe = document.createElement("iframe");
    iframe.setAttribute("data-src", adData.video);
    iframe.allowFullscreen = true;
    wrapper.appendChild(iframe); slot.appendChild(wrapper); hasContent = true;
  } else if (adData.type === "html" && adData.html) {
    slot.innerHTML = adData.html; hasContent = true;
  }
  if (hasContent) {
    slot.style.display = "block";
    slot.classList.add("ad-fade-in");
  } else {
    slot.style.display = "none";
  }
}

async function getAdsSmart(forceRefresh) {
  const cached = readCache();
  if (!cached || forceRefresh) {
    try {
      const full = await fetchAdsByClientVersion("");
      if (full && full.code === 200 && full.data) {
        writeCache({ version: String(full.version || "0"), data: full.data, timestamp: Date.now() });
        return full.data;
      }
    } catch (e) { console.error("Load failed", e); }
    return cached ? cached.data : null;
  }
  if (Date.now() - cached.timestamp < LOCAL_CACHE_EXPIRY_MS) return cached.data;
  try {
    const check = await fetchAdsByClientVersion(cached.version);
    if (check && (check.code === 304 || check.notModified)) {
      writeCache({ ...cached, timestamp: Date.now() });
      return cached.data;
    }
    if (check && check.code === 200 && check.data) {
      writeCache({ version: String(check.version || "0"), data: check.data, timestamp: Date.now() });
      return check.data;
    }
    return cached.data;
  } catch (err) { return cached.data; }
}

async function insertAds() {
  injectStyles();
  const forceRefresh = new URLSearchParams(window.location.search).has("refresh");
  const slotMap = buildSlotMap();
  if (!slotMap.size) return;

  const cached = readCache();
  const likelyFetch = forceRefresh || !cached || (cached && (Date.now() - cached.timestamp >= LOCAL_CACHE_EXPIRY_MS));

  if (likelyFetch) showGlobalLoading();
  const ads = await getAdsSmart(forceRefresh);
  if (likelyFetch) hideGlobalLoading();

  if (!ads) return;
  slotMap.forEach((slot, slotId) => { renderSlot(slot, ads[slotId]); });

  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const f = entry.target; f.src = f.getAttribute("data-src");
      f.removeAttribute("data-src"); obs.unobserve(f);
    });
  }, { rootMargin: "200px 0px" });
  document.querySelectorAll("iframe[data-src]").forEach(f => io.observe(f));
}

document.addEventListener("DOMContentLoaded", insertAds);
