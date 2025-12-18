/**
 * Daju Ad Management System (V3.6) - GAS Version Protocol + DOM Wait
 * 功能：修快取(ms)、版本協議(meta/v)、slotMap、YouTube lazy、DOM 延遲出現也能注入
 */

const ADS_GAS_URL = "https://script.google.com/macros/s/AKfycbzvA6Q69iJK4BCBmyhv2BLNClxqJw3Fk6i3KZqQwU5BSda1Ls4BSoFQDyC8ikL12HRJ/exec";
const LOCAL_CACHE_KEY = "daju_ads_cache";
const LOCAL_CACHE_EXPIRY_MS = 60 * 60 * 1000; // 1 小時（你可調整）

// 1) CSS 注入
function injectStyles() {
  if (document.getElementById("daju-ad-manager-styles")) return;
  const style = document.createElement("style");
  style.id = "daju-ad-manager-styles";
  style.textContent = `
    .ad-slot { width: 100%; margin: 20px 0; display: none; }
    .ad-slot img { display: block; width: 100%; height: auto; object-fit: cover; }

    .ad-video-wrapper { position: relative; width: 100%; height: 0; padding-bottom: 56.25%; overflow: hidden; }
    .ad-video-wrapper iframe { position: absolute; top:0; left:0; width:100%; height:100%; border:0; }

    .contact-btn { border-radius: 8px; transition: transform 0.2s; }
    .contact-btn:hover { transform: translateY(-2px); }
  `;
  document.head.appendChild(style);
}

// 2) localStorage
function readCache() {
  try { return JSON.parse(localStorage.getItem(LOCAL_CACHE_KEY) || "null"); }
  catch { return null; }
}
function writeCache(obj) {
  try { localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(obj)); } catch {}
}

// 3) GAS 版本協議
async function fetchMetaVersion() {
  const res = await fetch(`${ADS_GAS_URL}?meta=1`, { cache: "no-store" });
  const json = await res.json();
  return json && json.version ? String(json.version) : "0";
}
async function fetchAdsByClientVersion(cachedVersion) {
  const v = cachedVersion ? encodeURIComponent(String(cachedVersion)) : "";
  const res = await fetch(`${ADS_GAS_URL}?v=${v}`, { cache: "no-store" });
  return await res.json();
}

// 4) YouTube lazy
function setupLazyIframes(root = document) {
  const iframes = root.querySelectorAll("iframe[data-src]");
  if (!iframes.length) return;

  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const iframe = entry.target;
      const src = iframe.getAttribute("data-src");
      if (src) iframe.setAttribute("src", src);
      iframe.removeAttribute("data-src");
      obs.unobserve(iframe);
    });
  }, { rootMargin: "200px 0px" });

  iframes.forEach(f => io.observe(f));
}

// 5) 渲染
function renderSlot(slot, adData) {
  if (!adData) { slot.style.display = "none"; return; }

  slot.replaceChildren();

  if (adData.class) {
    adData.class.split(" ").forEach(cls => {
      const c = (cls || "").trim();
      if (c) slot.classList.add(c);
    });
  }

  let hasContent = false;

  if (adData.type === "image" && adData.img) {
    const a = document.createElement("a");
    a.href = adData.link || "#";
    a.target = "_blank";
    a.rel = "noopener noreferrer";

    const img = document.createElement("img");
    img.src = adData.img;
    img.alt = adData.alt || "廣告圖片";
    img.loading = "lazy";
    img.decoding = "async";

    a.appendChild(img);
    slot.appendChild(a);
    hasContent = true;
  }
  else if (adData.type === "youtube" && adData.video) {
    const wrapper = document.createElement("div");
    wrapper.className = "ad-video-wrapper";

    const iframe = document.createElement("iframe");
    iframe.setAttribute("data-src", adData.video); // lazy
    iframe.allowFullscreen = true;
    iframe.title = adData.title || "video";

    wrapper.appendChild(iframe);
    slot.appendChild(wrapper);
    hasContent = true;

    // lazy 啟動（只針對這個 slot）
    setupLazyIframes(slot);
  }
  else if (adData.type === "html" && adData.html) {
    slot.innerHTML = adData.html; // 你原本就這樣
    hasContent = true;

    // 若 html 裡也有 iframe[data-src]，一起 lazy
    setupLazyIframes(slot);
  }

  slot.style.display = hasContent ? "block" : "none";
}

function renderAllAds(ads) {
  const nodes = document.querySelectorAll(".ad-slot");
  if (!nodes.length) return false;

  // slotMap（一次掃描）
  const slotMap = new Map();
  nodes.forEach(el => {
    const slotId = el.dataset.slotId;
    if (slotId) slotMap.set(slotId, el);
  });

  slotMap.forEach((slot, slotId) => {
    renderSlot(slot, ads ? ads[slotId] : null);
  });

  return true;
}

// 6) 取得 ads（版本協議 + 本地快取）
async function getAdsSmart(forceRefresh) {
  const cached = readCache(); // {version, data, timestamp}

  if (forceRefresh) {
    const full = await fetchAdsByClientVersion("");
    if (full && full.code === 200 && full.data) {
      writeCache({ version: String(full.version || "0"), data: full.data, timestamp: Date.now() });
      return full.data;
    }
    return cached && cached.data ? cached.data : null;
  }

  // 快取仍有效 → 直接用
  if (cached && cached.data && cached.timestamp && (Date.now() - cached.timestamp < LOCAL_CACHE_EXPIRY_MS)) {
    return cached.data;
  }

  // 先拿最新版本（小封包）
  let latestVersion = "0";
  try {
    latestVersion = await fetchMetaVersion();
  } catch (_) {
    return cached && cached.data ? cached.data : null;
  }

  // 版本一致 → 續命
  if (cached && cached.data && String(cached.version) === String(latestVersion)) {
    writeCache({ version: String(cached.version), data: cached.data, timestamp: Date.now() });
    return cached.data;
  }

  // 版本不同 → 用 v=舊版本拿更新（或 304）
  try {
    const check = await fetchAdsByClientVersion(cached && cached.version ? cached.version : "");
    if (check && check.code === 304 && cached && cached.data) {
      writeCache({ version: String(check.version || latestVersion), data: cached.data, timestamp: Date.now() });
      return cached.data;
    }
    if (check && check.code === 200 && check.data) {
      writeCache({ version: String(check.version || latestVersion), data: check.data, timestamp: Date.now() });
      return check.data;
    }
  } catch (_) {
    return cached && cached.data ? cached.data : null;
  }

  return cached && cached.data ? cached.data : null;
}

// 7) 主流程：先抓資料/寫快取，再等待 slot 出現
async function insertAds() {
  injectStyles();

  const forceRefresh = new URLSearchParams(location.search).has("refresh");

  // ✅ 先把資料抓到（就算 slot 尚未出現，也會先寫 localStorage）
  const ads = await getAdsSmart(forceRefresh);
  if (!ads) return;

  // 先嘗試立刻渲染
  if (renderAllAds(ads)) return;

  // 若 slot 尚未出現：監聽 DOM，出現就渲染（避免你遇到的「什麼都沒發生」）
  const observer = new MutationObserver(() => {
    if (renderAllAds(ads)) observer.disconnect();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  // 保險：10 秒後關掉 observer（避免極端頁面一直跑）
  setTimeout(() => observer.disconnect(), 10000);
}

document.addEventListener("DOMContentLoaded", insertAds);
