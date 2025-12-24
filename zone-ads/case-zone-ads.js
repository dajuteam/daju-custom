/**
 * Daju Zone Ads Widget V1.2
 * 針對 zone, case_name, Image_url 最佳化
 */

(function (window, document) {
  'use strict';

  // 1. Config
  const API_URL = "https://daju-unified-route-api.dajuteam88.workers.dev/?type=zone_ads";
  const LOCAL_CACHE_KEY = "daju_zone_ads_cache";
  const LOCAL_CACHE_EXPIRY_MS = 10 * 60 * 1000; // 10分鐘檢查一次版本

  // 2. Storage Helpers
  function readCache() {
    try { return JSON.parse(localStorage.getItem(LOCAL_CACHE_KEY) || "null"); } catch { return null; }
  }
  function writeCache(obj) {
    try { localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(obj)); } catch {}
  }

  // 3. Smart Fetch Data
  async function getAdsData() {
    const now = Date.now();
    const cached = readCache();

    // TTL 內直接返回
    if (cached && (now - cached.timestamp < LOCAL_CACHE_EXPIRY_MS)) {
      return cached.data;
    }

    try {
      // Step A: 檢查 Meta 版本
      const metaRes = await fetch(`${API_URL}&meta=1`).then(r => r.json());
      const latestVersion = metaRes.version;

      if (cached && cached.version === latestVersion) {
        cached.timestamp = now;
        writeCache(cached);
        return cached.data;
      }

      // Step B: 版本不符，下載全量資料 (帶版本號命中 Edge Cache)
      const fullRes = await fetch(`${API_URL}&v=${latestVersion}`).then(r => r.json());
      if (fullRes.code === 200 && Array.isArray(fullRes.data)) {
        writeCache({ version: latestVersion, data: fullRes.data, timestamp: now });
        return fullRes.data;
      }
    } catch (e) {
      console.warn("[Ads] Fetch failed, using fallback cache");
      return cached ? cached.data : null;
    }
  }

  // 4. UI Engine
  const ZoneAdsSystem = {
    render() {
      const container = document.getElementById('case-zone-ads');
      if (!container) return;

      const targetZone = container.getAttribute('data-case-zone'); // 抓取 "案件區域"
      if (!targetZone) return;

      getAdsData().then(allAds => {
        if (!allAds) return;

        // 篩選：找出所有匹配該區域的廣告
        const matchingAds = allAds.filter(ad => String(ad.zone).trim() === targetZone);
        
        if (matchingAds.length === 0) return;

        // 核心邏輯：平均隨機 (2張各50%, 3張各33.3%)
        const selected = matchingAds[Math.floor(Math.random() * matchingAds.length)];

        this.injectHtml(container, selected);
      });
    },

    injectHtml(container, ad) {
      // 容器樣式微調：保持與經紀人組件一致的精緻感
      const styleTag = `
        <style>
          .zone-ad-container { opacity: 0; transform: translateY(10px); transition: all 0.8s ease; width: 100%; margin: 20px 0; }
          .zone-ad-container.show { opacity: 1; transform: translateY(0); }
          .zone-ad-link { display: block; width: 100%; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
          .zone-ad-img { width: 100%; height: auto; display: block; border: none; }
        </style>
      `;
      
      const html = `
        ${styleTag}
        <div class="zone-ad-container" id="ad-inner-box">
          <a class="zone-ad-link" href="${ad.link_url || 'javascript:void(0)'}" target="_blank" rel="noopener noreferrer">
            <img class="zone-ad-img" src="${ad.Image_url}" alt="${ad.case_name}">
          </a>
        </div>
      `;

      container.innerHTML = html;
      
      // 觸發進場動畫
      requestAnimationFrame(() => {
        const inner = document.getElementById('ad-inner-box');
        if (inner) inner.classList.add('show');
      });
    }
  };

  // 啟動系統
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ZoneAdsSystem.render());
  } else {
    ZoneAdsSystem.render();
  }

})(window, document);
