(function () {
  // === 設定區 ===
  const CONFIG = {
    GAS_API_URL: "https://script.google.com/macros/s/AKfycbyDIqujGayWOIOy8lvq8SB-y4Zf6VLVUq2v9pNcrh-pr9Bhv7WKxLW0lmGtoaSglq7s/exec",
    STORAGE_KEY: "real_price_local_v3", // 改個版號，避免跟舊的混到
    EXPIRE_HOURS: 24
  };

  // === 1. CSS 樣式注入 (加防重複) ===
  const injectStyles = () => {
    if (document.getElementById("real-price-style-v3")) return;

    const css = `
      /* === 實價登錄區塊設計 (Mobile First) === */
      .real-price-section {
        max-width: 100%;
        margin: 20px auto;
        border-radius: 12px;
        border: 2px dotted #ffda56;
        background: linear-gradient(to right, #fffaf0, #fff);
        box-sizing: border-box;
        font-family: sans-serif;
      }

      .real-price-body {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 20px;
        gap: 20px;
      }

      /* 左側內容 */
      .real-price-left {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
      }

      img.real-price-icon {
        width: 50px !important;
        height: auto;
        margin-right: 10px;
        margin-bottom: 10px;
        display: block;
      }

      .real-price-text {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
      }

      .real-price-title {
        font-size: 1.4rem;
        font-weight: bold;
        margin: 0;
        letter-spacing: 1px;
        color: #333;
        line-height: 1.4;
      }

      .real-price-subtext {
        font-size: 0.85rem;
        color: gray;
      }

      /* 按鈕樣式 (正常狀態) */
      .real-price-button {
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: #ffc107;
        color: black;
        font-size: 1.1rem;
        padding: 12px 20px;
        border-radius: 10px;
        text-decoration: none;
        transition: background-color 0.3s ease, transform 0.2s;
        gap: 10px;
        white-space: nowrap;
        font-weight: 500;
        cursor: pointer;
      }

      .real-price-button:hover {
        background-color: #ffb326;
        color: black;
        transform: translateY(-1px);
      }
      
      /* === 新增：無效按鈕樣式 (灰色/不可點) === */
      .real-price-button.disabled {
        background-color: #e0e0e0 !important;
        color: #999 !important;
        cursor: default;
        pointer-events: none;
        transform: none !important;
        box-shadow: none !important;
      }

      /* === 電腦版 (min-width: 992px) === */
      @media screen and (min-width: 992px) {
        .real-price-body {
          flex-direction: row;
          justify-content: space-between;
          align-items: center;
          padding: 20px 30px;
        }

        .real-price-left {
          flex-direction: row;
          align-items: center;
          text-align: left;
        }

        img.real-price-icon {
          margin-bottom: 0;
          margin-right: 15px;
          width: 50px;
        }

        .real-price-text {
          align-items: flex-start;
          text-align: left;
        }

        .real-price-title {
          font-size: 1.5rem;
        }

        .real-price-button {
          font-size: 1.3rem;
          padding: 15px 25px;
        }
      }
    `;

    const styleSheet = document.createElement("style");
    styleSheet.id = "real-price-style-v3";
    styleSheet.innerText = css;
    document.head.appendChild(styleSheet);
  };

  // === 2. 資料獲取邏輯 (不動：讀取單一 Key + timestamp) ===
  const getData = async () => {
    const now = Date.now();
    const rawData = localStorage.getItem(CONFIG.STORAGE_KEY);

    let cache = null;

    if (rawData) {
      try {
        cache = JSON.parse(rawData);
      } catch (e) {
        console.warn("快取格式錯誤，將重新抓取");
        localStorage.removeItem(CONFIG.STORAGE_KEY);
      }
    }

    if (cache && cache.timestamp && (now - cache.timestamp < CONFIG.EXPIRE_HOURS * 60 * 60 * 1000)) {
      return cache.data;
    }

    try {
      const response = await fetch(CONFIG.GAS_API_URL);
      if (!response.ok) throw new Error("API Error");
      const data = await response.json();

      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({ timestamp: now, data }));
      return data;
    } catch (error) {
      console.error("實價登錄讀取失敗:", error);
      if (cache && cache.data) return cache.data;
      return null;
    }
  };

  // === 3. 渲染邏輯：改成「塞進指定 container」 ===
  const renderInto = (container, url) => {
    if (!container) return;

    const hasUrl = !!url;
    const titleText = hasUrl ? "查看本案最新實價登錄" : "查看本案最新實價登錄(更新中)";
    const btnClass = hasUrl ? "real-price-button" : "real-price-button disabled";
    const btnHref = hasUrl ? `href="${url}" target="_blank"` : 'href="javascript:void(0)"';
    const btnIcon = hasUrl
      ? '<i class="fas fa-external-link-alt" aria-hidden="true"></i>'
      : '<i class="fas fa-tools" aria-hidden="true"></i>';

    container.innerHTML = `
      <div class="real-price-section">
        <div class="real-price-body">
          <div class="real-price-left">
            <img alt="實價登錄圖示" class="real-price-icon"
              src="https://www.dajuteam.com.tw/upload/web/images/assets/real-price-pic.png"
              onerror="this.style.display='none'"/>
            <div class="real-price-text">
              <h5 class="real-price-title">${titleText}</h5>
              <p class="real-price-subtext">您將前往樂居網站，本資料由樂居網站提供。</p>
            </div>
          </div>
          <a class="${btnClass}" ${btnHref} rel="noopener noreferrer" aria-label="前往樂居網站">
            ${btnIcon}
            前往樂居網站
          </a>
        </div>
      </div>
    `;
  };

  // === 主程式：改成抓取所有 data-real-price ===
  const init = async () => {
    const containers = document.querySelectorAll("[data-real-price]");
    if (!containers.length) return;

    injectStyles();
    const allData = await getData();

    containers.forEach((container) => {
      const caseName = (container.dataset.caseName || "").trim();
      if (!caseName) {
        console.warn("實價登錄區塊未設定 data-case-name", container);
        renderInto(container, null);
        return;
      }

      const targetUrl = (allData && allData[caseName]) ? allData[caseName] : null;
      renderInto(container, targetUrl);
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
