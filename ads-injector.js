/**
 * Daju Ad Management System (V3.7 - Optimized)
 * 功能：極速首載、15分鐘快取、YouTube lazy、版本協議(meta/v)
 */

const ADS_GAS_URL = "https://script.google.com/macros/s/AKfycbzvA6Q69iJK4BCBmyhv2BLNClxqJw3Fk6i3KZqQwU5BSda1Ls4BSoFQDyC8ikL12HRJ/exec";
const LOCAL_CACHE_KEY = "daju_ads_cache";

// ✅ 15 分鐘本地快取 (減少對 GAS 的 Meta 請求)
const LOCAL_CACHE_EXPIRY_MS = 15 * 60 * 1000; 

// 1) 自動注入 CSS 樣式
function injectStyles() {
  if (document.getElementById("daju-ad-manager-styles")) return;
  const style = document.createElement("style");
  style.id = "daju-ad-manager-styles";
  style.textContent = `
    .ad-slot { width: 100%; margin: 20px 0; display: none; overflow: hidden; }
    .ad-slot img { display: block; width: 100%; height: auto; object-fit: cover; }
    .ad-video-wrapper {
      position: relative; width: 100%; height: 0;
      padding-bottom: 56.25%; overflow: hidden; background: #000;
    }
    .ad-video-wrapper iframe {
      position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;
    }
    .contact-btn { border-radius: 8px; transition: transform 0.2s; }
    .contact-btn:hover { transform: translateY(-2px); }
    .ad-fade-in { animation: adFadeIn 0.5s ease-in forwards; }
    @keyframes adFadeIn { from { opacity: 0; } to { opacity: 1; } }
  `;
  document.head.appendChild(style);
}

// 2) localStorage helpers
function readCache() {
  try { return JSON.parse(localStorage.getItem(LOCAL_CACHE_KEY) || "null"); } 
  catch { return null; }
}

function writeCache(obj) {
  try { localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(obj)); } catch {}
}

// 3) slotMap（一次掃描 DOM）
function buildSlotMap() {
  const nodes = document.querySelectorAll(".ad-slot");
  const map = new Map();
  nodes.forEach(el => {
    if (!el.dataset.baseClass) el.dataset.baseClass = el.className;
    const slotId = el.dataset.slotId;
    if (slotId) map.set(slotId, el);
  });
  return map;
}

// 4) 取得版本
async function fetchMetaVersion() {
  const res = await fetch(`${ADS_GAS_URL}?meta=1`, { cache: "no-store" });
  const json = await res.json();
  return json && json.version ? String(json.version) : "0";
}

// 5) 取得資料 (帶版本協議)
async function fetchAdsByClientVersion(cachedVersion) {
  const v = cachedVersion ? encodeURIComponent(String(cachedVersion)) : "";
  const res = await fetch(`${ADS_GAS_URL}?v=${v}`, { cache: "no-store" });
  return await res.json();
}

// 6) YouTube lazy
function setupLazyIframes() {
  const iframes = document.querySelectorAll("iframe[data-src]");
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const iframe = entry.target;
      iframe.src = iframe.getAttribute("data-src");
      iframe.removeAttribute("data-src");
      obs.unobserve(iframe);
    });
  }, { rootMargin: "200px 0px" });
  iframes.forEach(f => io.observe(f));
}

// 7) 渲染單一 slot
function renderSlot(slot, adData) {
  if (slot.dataset.baseClass != null) slot.className = slot.dataset.baseClass;
  if (!adData) { slot.style.display = "none"; return; }

  slot.replaceChildren();

  // 安全注入 Class
  if (adData.class) {
    adData.class.split(/\s+/).forEach(cls => {
      if (cls.trim()) slot.classList.add(cls.trim());
    });
  }

  let hasContent = false;
  // A) image
  if (adData.type === "image" && adData.img) {
    const a = document.createElement("a");
    a.href = adData.link || "#";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    const img = document.createElement("img");
    img.src = adData.img;
    img.alt = adData.alt || adData.title || "房產廣告";
    img.loading = "lazy";
    img.setAttribute("decoding", "async");
    a.appendChild(img);
    slot.appendChild(a);
    hasContent = true;
  }
  // B) youtube
  else if (adData.type === "youtube" && adData.video) {
    const wrapper = document.createElement("div");
    wrapper.className = "ad-video-wrapper";
    const iframe = document.createElement("iframe");
    iframe.setAttribute("data-src", adData.video);
    iframe.allowFullscreen = true;
    iframe.title = adData.title || "video";
    wrapper.appendChild(iframe);
    slot.appendChild(wrapper);
    hasContent = true;
  }
  // C) html
  else if (adData.type === "html" && adData.html) {
    slot.innerHTML = adData.html;
    hasContent = true;
  }

  if (hasContent) {
    slot.style.display = "block";
    slot.classList.add("ad-fade-in"); // 增加質感的淡入
  }
}

// 8) 智慧快取與請求 (關鍵優化區)
async function getAdsSmart(forceRefresh) {
  const cached = readCache();

  // 沒有快取：直接打一次拿全部 (首載優化)
  if (!cached || forceRefresh) {
    try {
      const full = await fetchAdsByClientVersion("");
      if (full && full.code === 200) {
        writeCache({ version: String(full.version), data: full.data, timestamp: Date.now() });
        return full.data;
      }
    } catch (e) { console.error("Initial load failed", e); }
    return cached ? cached.data : null;
  }

  // 15 分鐘內：秒開
  if (Date.now() - cached.timestamp < LOCAL_CACHE_EXPIRY_MS) {
    return cached.data;
  }

  // 快取過期：檢查版本
  try {
    const latestVersion = await fetchMetaVersion();
    if (String(cached.version) === String(latestVersion)) {
      writeCache({ ...cached, timestamp: Date.now() }); // 延長快取
      return cached.data;
    }
    // 版本不同：下載新資料
    const check = await fetchAdsByClientVersion(cached.version);
    if (check.code === 200) {
      writeCache({ version: String(check.version), data: check.data, timestamp: Date.now() });
      return check.data;
    }
    return cached.data; // 304 或失敗時回傳舊的
  } catch (err) {
    return cached.data;
  }
}

// 9) 主流程
async function insertAds() {
  injectStyles();
  const forceRefresh = new URLSearchParams(window.location.search).has("refresh");
  const slotMap = buildSlotMap();
  if (!slotMap.size) return;

  const ads = await getAdsSmart(forceRefresh);
  if (!ads) return;

  slotMap.forEach((slot, slotId) => {
    renderSlot(slot, ads[slotId]);
  });
  setupLazyIframes();
}

document.addEventListener("DOMContentLoaded", insertAds);
