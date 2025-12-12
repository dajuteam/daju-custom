/**
 * 延伸閱讀 Widget (All-in-One Version)
 * 功能：
 * 1. 自動抓取 GAS 資料
 * 2. 依據 data-scope 進行關鍵字過濾 (支援 AND/OR 模式)
 * 3. 自動注入列表樣式 (CSS)
 * 4. 支援多個區塊渲染
 */

(function() {
  // ============================================================
  // ⚡ 設定區：您的 GAS 資料庫網址
  // ============================================================
  const RELATED_API_URL = "https://script.google.com/macros/s/AKfycbwpeFmayKWnvXxDTK1SiuHJbpW_DncOIXUB4WatDaUCtjIAj7G3NvNHl57U4DAr87Nf/exec";

  // ==============================================
  // 1. 自動注入樣式 (CSS)
  // ==============================================
  function injectStyles() {
    const styleId = 'related-posts-style';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
      /* --- 延伸閱讀列表樣式 --- */
      ul.rel-list {
        list-style: none; /* 移除預設圓點 */
        padding: 0;
        margin: 15px 0;
        border-top: 2px solid #eee; /* 上方分隔線 */
        border-bottom: 2px solid #eee; /* 下方分隔線 */
        background: #fff;
      }

      /* 載入中/無資料的狀態 */
      ul.rel-list.is-loading,
      ul.rel-list.is-empty {
        padding: 20px;
        text-align: center;
        color: #888;
        font-size: 0.9em;
      }

      /* 單個項目 */
      ul.rel-list li {
        border-bottom: 1px dashed #eee;
        transition: background-color 0.2s;
      }

      ul.rel-list li:last-child {
        border-bottom: none;
      }

      ul.rel-list li:hover {
        background-color: #f9f9f9;
      }

      /* 連結樣式 */
      ul.rel-list a {
        display: block;
        padding: 10px 5px;
        text-decoration: none;
        color: #333;
        font-size: 1rem;
        line-height: 1.5;
        position: relative;
        padding-left: 20px; /* 預留箭頭空間 */
      }

      /* 前方的小箭頭或圖示 */
      ul.rel-list a::before {
        content: "➤"; /* 或是可以用 "📄", "👉" */
        color: #eb6100; /* 配合您網站的主色調 */
        position: absolute;
        left: 0;
        top: 11px;
        font-size: 0.8em;
      }

      ul.rel-list a:hover {
        color: #eb6100;
      }
    `;
    document.head.appendChild(style);
  }

  // ==============================================
  // 2. 輔助函式
  // ==============================================
  function escapeHtml(s = '') {
    return s.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  // ==============================================
  // 3. 核心邏輯
  // ==============================================
  async function initRelatedPosts() {
    // 1. 找出頁面上所有帶有 data-scope 的 ul
    const targets = document.querySelectorAll('ul.rel-list[data-scope]');
    if (targets.length === 0) return;

    // 2. 注入 CSS
    injectStyles();

    // 3. 顯示載入中狀態
    targets.forEach(ul => {
      ul.classList.add('is-loading');
      ul.innerHTML = '資料讀取中...';
    });

    try {
      // 4. 抓取資料 (只抓一次)
      const res = await fetch(RELATED_API_URL, { mode: 'cors' });
      if (!res.ok) throw new Error(`GAS API Error: ${res.statusText}`);
      const allRows = await res.json();

      // 5. 資料排序 (優先權 > 日期 > 標題)
      allRows.sort((a, b) => {
        const p = (+(b.priority || 0)) - (+(a.priority || 0));
        if (p !== 0) return p;
        const d = (new Date(b.date || 0)) - (new Date(a.date || 0));
        if (d !== 0) return d;
        return (a.title || '').localeCompare(b.title || '', 'zh-Hant');
      });

      // 6. 分配資料給各個列表
      targets.forEach(ul => {
        renderList(ul, allRows);
      });

    } catch (err) {
      console.error('[RelatedWidget] Error:', err);
      targets.forEach(ul => {
        ul.classList.remove('is-loading');
        ul.innerHTML = '讀取失敗';
        ul.style.display = 'none'; // 失敗則隱藏
      });
    }
  }

  function renderList(ul, allData) {
    ul.classList.remove('is-loading');

    // 讀取設定參數
    const rawScope = ul.dataset.scope || '';
    const limit = parseInt(ul.dataset.limit || '10', 10);
    const mode = (ul.dataset.scopeMode || 'OR').toUpperCase(); // 'OR' | 'AND'

    // 切割關鍵字 (支援逗號、直線、空白分隔)
    const scopes = rawScope.split(/[,\|\s]+/).map(s => s.trim()).filter(Boolean);

    // 比對邏輯
    function matchRow(row) {
      const rowScope = String(row.scope || '');
      if (scopes.length === 0) return false;
      if (mode === 'AND') return scopes.every(s => rowScope.includes(s));
      return scopes.some(s => rowScope.includes(s)); // 預設 OR
    }

    // 過濾與切片
    const items = allData.filter(matchRow).slice(0, limit);

    // 若無資料
    if (items.length === 0) {
      ul.classList.add('is-empty');
      ul.style.display = 'none'; // 沒資料就隱藏，避免留白
      return;
    }

    // 產生 HTML
    ul.innerHTML = items.map(it => `
      <li>
        <a href="${escapeHtml(it.url || '#')}" target="_self">
          ${escapeHtml(it.title || '（未命名）')}
        </a>
      </li>
    `).join('');
  }

  // ==============================================
  // 4. 自動啟動
  // ==============================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRelatedPosts);
  } else {
    initRelatedPosts();
  }

})();
