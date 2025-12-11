/**
 * 房地產物件列表 Widget (Final Version)
 * 樣式：Mobile First (100%), Desktop (Max 1000px), Left Aligned
 * 功能：自動注入 CSS/Icons, 抓取 GAS 資料, 顯示更多按鈕
 */

(function() {
  // ============================================================
  // ⚡ 設定區：請務必將此處換成您部署後的 GAS Web App URL
  // ============================================================
  const API_URL = "https://script.google.com/macros/s/AKfycby_JwXX718xhd51sR5ZNl8AS3CSg5Q0e7XnNf4ddEByjUVuCH-XfEfDyxWSdysHM9ZEWA/exec"; 

  // 設定顯示上限 (超過此數量顯示按鈕)
  const MAX_VISIBLE_ITEMS = 5;


  // ==============================================
  // 1. 自動注入樣式 (CSS + Font Awesome)
  // ==============================================
  function injectStyles() {
    // 1.1 引入 Font Awesome (如果網頁原本沒有)
    if (!document.querySelector('link[href*="fontawesome"]')) {
      const faLink = document.createElement('link');
      faLink.rel = 'stylesheet';
      faLink.href = 'https://www.dajuteam.com.tw/js/fontawesome-free-5.15.1-web/css/all.min.css';
      document.head.appendChild(faLink);
    }

    // 1.2 注入您的客製化 CSS
    const style = document.createElement('style');
    style.innerHTML = `
      /* 1. 外層容器 */
      .case-list-container {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        
        /* 寬度設定：預設 100% (手機優先) */
        width: 100%;
        
        /* 對齊設定：靠左對齊 (上下20px, 左右0) */
        margin: 20px 0; 
        
        background: #fff;
        padding: 15px;
        box-sizing: border-box;
      }

      /* 2. 標題區 */
      .case-list-header {
        color: #eb6100;
        font-size: 22px;
        font-weight: bold;
        margin-bottom: 15px;
        padding-left: 5px;
        letter-spacing: 1px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      /* 數量標籤 */
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

      /* 4. 單個物件項目 (手機優先: 垂直排列) */
      .case-list-item {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        padding: 15px 10px;
        border-bottom: 1px solid #ffe6cc;
        transition: background-color 0.2s;
      }

      .case-list-item:last-child {
        border-bottom: none;
      }

      .case-list-item:hover {
        background-color: #fff9f2;
      }

      /* 隱藏模式 (JS控制) */
      .case-list-item.hidden-mode {
        display: none;
      }

      /* --- 左側連結區 --- */
      .case-list-link {
        text-decoration: none;
        color: #333;
        display: flex;
        align-items: flex-start; /* 手機版: 標題換行時靠上對齊 */
        width: 100%;
        margin-bottom: 8px;
        padding-right: 0;
      }

      /* Font Awesome 圖示 (::after) */
      .case-list-link::after {
        content: "\\f35d"; /* JS 字串中反斜線需要跳脫 */
        font-family: "Font Awesome 5 Free";    
        font-weight: 900; 
        font-size: 0.65em; 
        position: static; 
        color: #eb6100; 
        opacity: 0.7; 
        line-height: 1; 
        margin-left: 0.5em; 
        margin-top: 5px; /* 手機版微調高度 */
        transition: opacity 0.2s;
        flex-shrink: 0;
      }

      .case-list-link:hover::after {
        opacity: 1;
      }

      /* 橘色圓點 */
      .case-list-dot {
        color: #eb6100;
        font-size: 20px;
        margin-right: 10px;
        line-height: 1;
        margin-top: 3px;
        flex-shrink: 0;
      }

      /* 案名標題文字 */
      .case-list-title {
        font-size: 16px;
        color: #444;
        font-weight: 500;
        line-height: 1.5;
      }

      /* --- 右側價格區 --- */
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

      /* --- 查看更多按鈕 --- */
      .case-list-more-btn {
        display: block;
        width: 100%;
        text-align: center;
        padding: 12px 0;
        margin-top: 10px;
        background-color: #f9f9f9;
        color: #666;
        font-size: 15px;
        cursor: pointer;
        border: 1px dashed #ddd;
        transition: all 0.2s;
      }
      .case-list-more-btn:hover {
        background-color: #fff;
        color: #eb6100;
        border-color: #eb6100;
      }

      .case-list-message {
        text-align: center; color: #888; padding: 20px;
      }

      /* =========================================
         ★ 電腦版樣式覆蓋 (min-width: 992px) ★
         ========================================= */
      @media (min-width: 992px) {
        /* 電腦版限制最大寬度為 1000px */
        .case-list-container { max-width: 1000px; } 

        .case-list-item {
          flex-direction: row;        /* 改回橫向 */
          justify-content: space-between;
          align-items: center;        
        }

        .case-list-link {
          width: auto;                
          margin-bottom: 0;           
          padding-right: 20px;
          align-items: center;        /* 電腦版置中對齊 */
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
  // 2. 主程式邏輯
  // ==============================================
  async function initCaseList() {
    // 1. 找出所有掛載點
    const widgets = document.querySelectorAll('#case-list, .case-list-widget-target');
    if (widgets.length === 0) return;

    // 2. 注入 CSS
    injectStyles();

    // 3. 顯示載入中...
    widgets.forEach(w => w.innerHTML = '<div class="case-list-container"><div class="case-list-message">資料載入中...</div></div>');

    try {
      // 4. 抓取 GAS 資料 (只抓一次)
      const response = await fetch(API_URL);
      const allData = await response.json();

      // 5. 渲染每個 widget
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
    // 篩選出該建案的資料
    const filteredItems = data.filter(item => item.case_name === caseName);

    if (filteredItems.length === 0) {
      container.innerHTML = '<div class="case-list-container"><div class="case-list-message">目前尚無上架物件</div></div>';
      return;
    }

    // 價格排序 (由低到高)
    filteredItems.sort((a, b) => {
      const priceA = parseFloat(a.price.toString().replace(/,/g, '')) || 0;
      const priceB = parseFloat(b.price.toString().replace(/,/g, '')) || 0;
      return priceA - priceB;
    });

    // 組裝 HTML
    let html = `
      <div class="case-list-container">
        <div class="case-list-header">
          <span>《 正在銷售的物件 》</span>
          <span class="case-list-count">共 ${filteredItems.length} 筆</span>
        </div>
        <ul class="case-list-ul">
    `;

    // 迴圈生成列表
    filteredItems.forEach((item, index) => {
      let displayPrice = item.price;
      // 確保價格有"萬"字
      if (!displayPrice.toString().includes("萬") && displayPrice != 0) {
         displayPrice += "萬";
      }

      // 超過上限預設隱藏
      const isHidden = index >= MAX_VISIBLE_ITEMS ? 'hidden-mode' : '';

      html += `
        <li class="case-list-item ${isHidden}">
          <a href="${item.url}" target="_blank" class="case-list-link">
            <span class="case-list-dot">•</span>
            <span class="case-list-title">${item.title}</span>
          </a>
          <div class="case-list-price-box">
            <span class="case-list-price-num">${displayPrice.replace('萬', '')}</span>
            <span class="case-list-price-unit">萬</span>
          </div>
        </li>
      `;
    });

    html += `</ul>`;

    // 顯示更多按鈕
    if (filteredItems.length > MAX_VISIBLE_ITEMS) {
      const moreCount = filteredItems.length - MAX_VISIBLE_ITEMS;
      html += `
        <div class="case-list-more-btn" onclick="this.parentElement.querySelectorAll('.hidden-mode').forEach(e=>e.classList.remove('hidden-mode'));this.remove();">
          查看更多案件 (還有 ${moreCount} 筆) ▾
        </div>
      `;
    }

    html += `</div>`;
    container.innerHTML = html;
  }

  // 啟動腳本
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCaseList);
  } else {
    initCaseList();
  }

})();
