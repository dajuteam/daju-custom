@charset "UTF-8";
/**
 * 房地產物件列表 Widget (V3.1 - Cache Enabled)
 * 更新日誌：
 * 1. 加入 Local Storage 快取機制 (預設 5 分鐘)
 * 2. 增加無痕模式/寫入失敗的自動備案
 */

(function() {
  // ⚡ 設定：請務必將此處換成您部署後的 GAS Web App URL
  const API_URL = "https://script.google.com/macros/s/AKfycbwm-nOkU0tZ3sGwEpODv13ljMZVxM30ommpfX-dtvfzAumy0DLi7fAPabElqMrrQSl_MQ/exec"; 

  // 設定顯示上限
  const MAX_VISIBLE_ITEMS = 3;

  // ==============================================
  // ★ 快取設定 (Cache Config)
  // ==============================================
  // 1. 獨立的 Cache Key，避免與金牌業務資料衝突
  const CACHE_KEY = "case_list_data_v1"; 

  // 2. 暫存時間 (TTL)，單位：分鐘。若要修改請改此處數字。
  const CACHE_TTL_MINUTES = 5; 

  // ==============================================
  // 1. 自動注入樣式 (CSS + Font Awesome) - 未更動
  // ==============================================
  function injectStyles() {
    // 1.1 引入 Font Awesome
    if (!document.querySelector('link[href*="fontawesome"]')) {
      const faLink = document.createElement('link');
      faLink.rel = 'stylesheet';
      faLink.href = 'https://www.dajuteam.com.tw/js/fontawesome-free-5.15.1-web/css/all.min.css';
      document.head.appendChild(faLink);
    }

    // 1.2 注入客製化 CSS (含動畫設定)
    const style = document.createElement('style');
    style.innerHTML = `
      /* 1. 外層容器 */
      .case-list-container {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        width: 100%;
        margin: 40px 0; 
        background: #fff;
        padding: 0px;
        box-sizing: border-box;
      }

      /* 2. 標題區 */
      .case-list-header {
        color: #eb6100;
        font-size: 1.6rem;
        font-weight: bold;
        margin-bottom: 15px;
        padding-left: 5px;
        letter-spacing: 1px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .case-list-count {
        font-size: 14px;
        font-weight: normal;
        background: #eb6100;
        color: #fff;
        padding: 2px 8px;
        border-radius: 12px;
      }

      /* 3. 列表容器 */
      .case-list-ul {
        list-style: none;
        padding: 0;
        margin: 0;
        border-top: 2px solid #eb6100;
      }

      /* 4. 單個物件項目 */
      .case-list-item {
        display: flex;
        flex-direction: column; /* 手機優先：垂直 */
        align-items: flex-start;
        padding: 15px 10px;
        border-bottom: 1px solid #ffe6cc;
        transition: background-color 0.2s;
      }

      /* 移除最後一個項目的底線 */
      .case-list-ul > .case-list-item:last-child,
      .case-list-overflow > .case-list-item:last-child {
        border-bottom: none;
      }

      .case-list-item:hover {
        background-color: #fff9f2;
      }

      /* --- 動畫收合區塊 (核心 CSS) --- */
      .case-list-overflow {
        max-height: 0;
        overflow: hidden;
        opacity: 0;
        transition: max-height 0.5s ease-in-out, opacity 0.4s ease-in-out;
      }

      /* 展開狀態 */
      .case-list-overflow.is-expanded {
        max-height: 2000px;
        opacity: 1;
      }

      /* --- 連結與內容 --- */
      .case-list-link {
        text-decoration: none;
        display: flex;
        align-items: flex-start;
        width: 100%;
        margin-bottom: 8px;
        padding-right: 0;
      }

      .case-list-link::after {
        content: "\\f35d";
        font-family: "Font Awesome 5 Free";     
        font-weight: 900; 
        font-size: 0.65em; 
        position: static; 
        color: #eb6100; 
        opacity: 0.7; 
        line-height: 1; 
        margin-left: 0.5em; 
        margin-top: 5px;
        transition: opacity 0.2s;
        flex-shrink: 0;
      }

      .case-list-link:hover::after { opacity: 1; }

      .case-list-dot {
        color: #eb6100;
        font-size: 20px;
        margin-right: 10px;
        line-height: 1;
        margin-top: 3px;
        flex-shrink: 0;
      }

      .case-list-title {
        font-size: 1.1rem;
        font-weight: 500;
        line-height: 1.5;
      }

      .case-list-price-box {
        width: 100%;
        text-align: right;
        padding-left: 25px;
        box-sizing: border-box;
        white-space: nowrap;
      }

      .case-list-price-num {
        color: #e62e2e;
        font-size: 20px;
        font-weight: bold;
        font-family: Arial, sans-serif;
      }

      .case-list-price-unit {
        color: #666;
        font-size: 14px;
        margin-left: 2px;
      }

      /* --- 按鈕樣式 (展開/收起) --- */
      .case-list-more-btn {
        display: block;
        width: 100%;
        text-align: center;
        padding: 12px 0;
        margin-top: 15px;
        background-color: #fff;
        color: #eb6110;
        font-size: 1em;
        cursor: pointer;
        border: 1px dashed #fedcba;
        transition: all 0.2s;
        user-select: none;
      }
      .case-list-more-btn:hover {
        background-color: #fff6ee;
        color: #eb6100;
        border-color: #eb6100;
      }
       
      /* 按鈕箭頭動畫 */
      .case-list-more-btn .arrow-icon {
        display: inline-block;
        transition: transform 0.3s;
        margin-left: 5px;
      }
      .case-list-more-btn.is-active .arrow-icon {
        transform: rotate(180deg);
      }

      .case-list-message {
        text-align: center; color: #888; padding: 20px;
      }

      /* =========================================
         ★ 電腦版樣式覆蓋 (min-width: 992px) ★
         ========================================= */
      @media (min-width: 992px) {
        .case-list-container { max-width: 1000px; } 

        .case-list-item {
          flex-direction: row;        
          justify-content: space-between;
          align-items: center;        
        }

        .case-list-link {
          width: auto;                
          margin-bottom: 0;           
          padding-right: 20px;
          align-items: center;        
          flex: 1;
        }

        .case-list-link::after { margin-top: 0; }
        .case-list-dot { margin-top: 0; }

        .case-list-price-box {
          width: auto;                
          text-align: right;
          padding-left: 0;            
        }
      }
    `;
    document.head.appendChild(style);
  }

  // ==============================================
  // ★ 新增：快取資料讀取函式 (Fetch with Cache)
  // ==============================================
  async function fetchDataWithCache() {
    const now = Date.now();
    const ttl = CACHE_TTL_MINUTES * 60 * 1000; // 轉換為毫秒

    // 1. 嘗試從 Local Storage 讀取
    try {
      const cachedRecord = localStorage.getItem(CACHE_KEY);
      if (cachedRecord) {
        const parsed = JSON.parse(cachedRecord);
        // 檢查是否過期
        if (now - parsed.timestamp < ttl) {
          // console.log("★ 使用快取資料，不請求 API"); // 除錯用，確認無誤後可拿掉
          return parsed.data;
        }
      }
    } catch (e) {
      // 讀取失敗 (例如 JSON 解析錯誤)，不做處理，直接跳去抓新資料
      console.warn("Cache read failed, fetching new data.");
    }

    // 2. 如果沒有快取或已過期，發送網路請求
    const response = await fetch(API_URL);
    const data = await response.json();

    // 3. 嘗試寫入 Local Storage (包含無痕模式的錯誤處理)
    try {
      const cacheData = {
        timestamp: now,
        data: data
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    } catch (e) {
      console.warn("Cache write failed (Local Storage disabled or full). Proceeding without cache.");
    }

    return data;
  }

  // ==============================================
  // 2. 主程式邏輯 (已修改為使用快取函式)
  // ==============================================
  async function initCaseList() {
    const widgets = document.querySelectorAll('#case-list, .case-list-widget-target');
    if (widgets.length === 0) return;

    injectStyles();

    widgets.forEach(w => w.innerHTML = '<div class="case-list-container"><div class="case-list-message">資料載入中...</div></div>');

    try {
      // ★ 修改處：將原本的 fetch 改為呼叫 fetchDataWithCache()
      const allData = await fetchDataWithCache();

      widgets.forEach(widget => {
        const targetCaseName = widget.dataset.caseName;
        renderWidget(widget, targetCaseName, allData);
      });

    } catch (error) {
      console.error("Widget Error:", error);
      widgets.forEach(w => w.innerHTML = '<div class="case-list-container"><div class="case-list-message">讀取失敗，請稍後再試。</div></div>');
    }
  }

  function renderWidget(container, caseName, data) {
    const filteredItems = data.filter(item => item.case_name === caseName);

    if (filteredItems.length === 0) {
      container.innerHTML = '<div class="case-list-container"><div class="case-list-message">目前尚無上架物件</div></div>';
      return;
    }

    filteredItems.sort((a, b) => {
      const priceA = parseFloat(a.price.toString().replace(/,/g, '')) || 0;
      const priceB = parseFloat(b.price.toString().replace(/,/g, '')) || 0;
      return priceA - priceB;
    });

    const linkTarget = window.innerWidth < 992 ? "_self" : "_blank";

    let html = `
      <div class="case-list-container">
        <div class="case-list-header">
          <span>《 最新上架物件 》</span>
          <span class="case-list-count">共 ${filteredItems.length} 筆</span>
        </div>
        <div class="case-list-ul">
    `;

    const generateItemHtml = (item) => {
      let displayPrice = item.price;
      if (!displayPrice.toString().includes("萬") && displayPrice != 0) {
         displayPrice += "萬";
      }
      return `
        <div class="case-list-item">
          <a href="${item.url}" target="${linkTarget}" class="case-list-link">
            <span class="case-list-dot">•</span>
            <span class="case-list-title">${item.title}</span>
          </a>
          <div class="case-list-price-box">
            <span class="case-list-price-num">${displayPrice.replace('萬', '')}</span>
            <span class="case-list-price-unit">萬</span>
          </div>
        </div>
      `;
    };

    const visibleItems = filteredItems.slice(0, MAX_VISIBLE_ITEMS);
    visibleItems.forEach(item => {
      html += generateItemHtml(item);
    });

    if (filteredItems.length > MAX_VISIBLE_ITEMS) {
      const hiddenItems = filteredItems.slice(MAX_VISIBLE_ITEMS);
       
      html += `<div class="case-list-overflow" id="overflow-${caseName}">`;
      hiddenItems.forEach(item => {
        html += generateItemHtml(item);
      });
      html += `</div>`; 

      const moreCount = hiddenItems.length;
      html += `
        <div class="case-list-more-btn" onclick="toggleEstateList(this, 'overflow-${caseName}')">
          <span class="btn-text">查看更多案件 (還有 ${moreCount} 筆)</span>
          <span class="arrow-icon">▾</span>
        </div>
      `;
    }

    html += `</div></div>`; 
    container.innerHTML = html;
  }

  // ★ 全域切換函式
  window.toggleEstateList = function(btn, overflowId) {
    const overflowDiv = document.getElementById(overflowId);
    const btnText = btn.querySelector('.btn-text');
    
    overflowDiv.classList.toggle('is-expanded');
    btn.classList.toggle('is-active');

    if (overflowDiv.classList.contains('is-expanded')) {
      btnText.textContent = "收起列表";
    } else {
      const count = overflowDiv.querySelectorAll('.case-list-item').length;
      btnText.textContent = `查看更多案件 (還有 ${count} 筆)`;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCaseList);
  } else {
    initCaseList();
  }

})();
