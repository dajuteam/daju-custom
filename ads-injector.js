const ADS_GAS_URL = "您的_GAS_網頁應用程式網址";
const LOCAL_CACHE_KEY = "daju_ads_cache";
const LOCAL_CACHE_EXPIRY = 6 * 60 * 60 * 1000; // 前端快取：6小時 (毫秒)

async function insertAds() {
    let ads = null;

    // 1. 嘗試從本地瀏覽器快取讀取
    const cachedData = localStorage.getItem(LOCAL_CACHE_KEY);
    if (cachedData) {
        const cacheObj = JSON.parse(cachedData);
        const now = new Date().getTime();
        
        // 檢查是否過期 (6小時)
        if (now - cacheObj.timestamp < LOCAL_CACHE_EXPIRY) {
            console.log("[Ads] 從本地快取載入資料");
            ads = cacheObj.data;
        }
    }

    // 2. 如果本地沒快取或已過期，才向 GAS 請求
    if (!ads) {
        try {
            console.log("[Ads] 本地無效，向伺服器請求...");
            const res = await fetch(ADS_GAS_URL);
            if (!res.ok) throw new Error("API 請求失敗");
            ads = await res.json();

            // 將結果存入本地快取，附帶當前時間戳
            const cacheToSave = {
                data: ads,
                timestamp: new Date().getTime()
            };
            localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(cacheToSave));
            
        } catch (err) {
            console.error("[Ads] 伺服器載入失敗:", err);
            // 這裡可以選擇：失敗時要不要暫時用舊的快取墊一下 (即便過期)
            if (cachedData) {
                ads = JSON.parse(cachedData).data;
                console.warn("[Ads] API 失敗，降級使用過期快取墊檔");
            }
        }
    }

    // 3. 渲染邏輯 (與之前相同)
    if (!ads) return;

    document.querySelectorAll('.ad-slot').forEach(function (slot) {
        const slotId = slot.dataset.slotId;
        const adData = ads[slotId];

        if (!adData) {
            slot.style.display = 'none';
            return;
        }

        slot.textContent = '';
        if (adData.class) {
            adData.class.split(' ').forEach(cls => { if(cls) slot.classList.add(cls); });
        }

        // --- 根據 type 渲染 (image/youtube/html) ---
        // (此處保留您之前的渲染邏輯，代碼同上一個回覆)
        renderElement(slot, adData); 
    });
}

// 輔助函式：您可以將原本的 createElement 邏輯包在這裡
function renderElement(slot, adData) {
    if (adData.type === "image" && adData.img) {
        const link = document.createElement('a');
        link.href = adData.link || '#';
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        const img = document.createElement('img');
        img.src = adData.img;
        img.alt = adData.alt || "廣告圖片";
        link.appendChild(img);
        slot.appendChild(link);
        slot.style.display = 'block';
    } else if (adData.type === "youtube" && adData.video) {
        const iframe = document.createElement('iframe');
        iframe.className = "youtube-video-iframe";
        iframe.src = adData.video;
        iframe.title = adData.title || "video";
        iframe.frameBorder = "0";
        iframe.allowFullscreen = true;
        slot.appendChild(iframe);
        slot.style.display = 'block';
    } else if (adData.type === "html" && adData.html) {
        slot.innerHTML = adData.html;
        slot.style.display = 'block';
    }
}
