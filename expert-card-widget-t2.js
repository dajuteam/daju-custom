/**
 * Expert Card Widget Integrated v2.1 (Quality & Performance)
 * 優化：
 * 1. 移除 Animate.css 依賴，改用原生 CSS Transition 實現「微上浮」質感。
 * 2. 加入 min-height 預先佔位，解決資料載入時的版面跳動。
 * 3. 針對 iOS Safari 極致優化渲染效能。
 */

(function (window, document) {
  'use strict';

  // =========================================================================
  // 1. 設定區域
  // =========================================================================
  const AGENT_GAS_URL = "https://script.google.com/macros/s/AKfycbz-sDaYGPoWDdx2_TrVxrVSIT1i0qVBvTSKiNebeARGRvwsLcXUUeSbMXSiomWNcl9Q/exec";

  // =========================================================================
  // 2. CSS 樣式 (Style) - 質感微調版
  // =========================================================================
  const WIDGET_CSS = `
        /* ------ 容器與動畫核心設定 ------ */
        .expert-card-wrapper {
            position: relative;
            border-radius: 8px;
            overflow: hidden;
            width: 100%;
            max-width: 1000px;
            z-index: 0;
            line-height: 1.5;
            margin: 20px 0;
            isolation: isolate;

            /* [關鍵優化 1] 預先佔位：避免資料還沒回來時高度為0 */
            min-height: 180px; 
            /* 給一個淡淡的背景色，讓使用者知道這裡有區塊 */
            background-color: rgba(255, 250, 234, 0.3); 

            /* [關鍵優化 2] 初始狀態：隱藏 + 往下位移 */
            opacity: 0;
            /* 這裡控制上浮距離，30px 是微上浮，很有質感 */
            transform: translateY(30px); 

            /* [關鍵優化 3] 轉場設定：0.8秒，使用優雅的緩動曲線 */
            transition: opacity 0.8s ease-out, transform 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94);
            will-change: opacity, transform;
        }

        /* 當 JS 加上這個 class 時，恢復原狀 (顯示 + 回到原位) */
        .expert-card-wrapper.is-visible {
            opacity: 1;
            transform: translateY(0);
        }

        /* 流光背景特效 */
        .expert-card-wrapper::before {
            content: "";
            position: absolute;
            top: -3px; left: -3px; right: -3px; bottom: -3px;
            border-radius: inherit;
            background: linear-gradient(130deg, #fffaea, #eccb7d, #fff2d4, #f4c978, #ffedb1, #e6c079, #e7c57c);
            background-size: 400% 400%;
            animation: borderFlow 10s linear infinite;
            z-index: -2;
            box-shadow: 0 0 16px rgba(4, 255, 0, 0.715);
            pointer-events: none;
            /* iOS 效能優化 */
            transform: translateZ(0); 
        }

        @keyframes borderFlow {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }

        /* ------ 卡片本體 ------ */
        .expert-card {
            border-radius: 8px;
            padding: 10px 22px;
            position: relative;
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            background: #fff; /* 確保內容有白底 */
            height: 100%; /* 配合 min-height */
        }

        /* 徽章與頭像 */
        .expert-badge { display: none; }
        .expert-card .expert-badge { background: radial-gradient(circle, #f5d770, #d1a106); }
        .expert-badge i { color: #fff; font-size: 1.8em; }

        @keyframes rotateBadge {
            0% { transform: rotateY(0deg); }
            100% { transform: rotateY(360deg); }
        }

        .expert-profile {
            width: 80px !important; height: 80px !important;
            border-radius: 12px; border: 3px solid #fff;
            object-fit: cover; margin-right: 15px !important;
            box-shadow: 0 2px 8px rgba(0, 0, 0, .1);
            display: block; aspect-ratio: 1/1;
            transform: translateZ(0); /* iOS 優化 */
        }

        /* 文字資訊 */
        .expert-info { flex: 1; }
        .expert-title { font-size: 1.1rem; font-weight: 700; margin-bottom: 6px; }
        .expert-info .expert-title { color: #9f5f00; }
        .expert-title i { animation: rotateBadge 3s linear infinite; }

        .expert-name-row { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; margin-bottom: 10px; position: relative; z-index: 10; }
        .expert-name { font-size: 1.7rem; font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        /* 聯絡按鈕 */
        .expert-contact-phone { background: linear-gradient(to right, #a45500, #ff9e36); }
        .expert-contact-line { background: linear-gradient(to right, #00a816, #67ca04); }
        .expert-contact { display: flex; gap: 15px; flex-wrap: wrap; }
        
        .expert-contact a {
            display: inline-flex; align-items: center; justify-content: center;
            width: 40px; height: 40px; min-width: 40px; min-height: 40px;
            border-radius: 50%; color: #fff; text-decoration: none; font-size: 1.4rem;
            transition: transform .2s ease, filter .2s ease;
        }
        .expert-contact a:hover { transform: translateY(-1px); filter: brightness(1.05); }
        .expert-contact a span { display: none; }

        .expert-name-row .expert-contact a { color: #fff; }

        /* 浮水印與RWD */
        .expert-footer { display: none; position: relative; z-index: 3; font-size: .5rem; color: #af885c; }
        .expert-level-mark {
            position: absolute; right: 18px; top: 10px;
            font-family: "Shrikhand", serif; font-style: italic; font-size: 1.1rem;
            color: rgba(194, 145, 67, 0.5); pointer-events: none; z-index: 2;
        }

        /* 電腦版調整 */
        @media screen and (min-width:992px) {
            .expert-card-wrapper { border-radius: 15px; }
            .expert-card { border-radius: 15px; padding: 15px 28px; }
            .expert-title { font-size: 1.7rem; }
            .expert-title i { animation: none; }
            .expert-contact a {
                width: auto; height: auto; min-height: 44px;
                font-size: 1.4rem; padding: 8px 16px; gap: 8px;
                border-radius: 10px; letter-spacing: 1.1px;
            }
            .expert-contact a span { display: inline; }
            .expert-badge {
                display: flex; width: 60px; height: 60px; border-radius: 50%;
                align-items: center; justify-content: center;
                margin-right: 25px; flex-shrink: 0;
                box-shadow: 0 2px 8px rgba(0, 0, 0, .2);
                animation: rotateBadge 3s linear infinite;
            }
            .expert-profile {
                width: 120px !important; height: 120px !important;
                border: 4px solid #fff; margin-right: 30px !important;
                box-shadow: 0 2px 5px #dcad6ccc;
            }
            .expert-name { font-size: 2.3rem; max-width: 40ch; }
            .expert-level-mark { right: -20px; top: 34px; font-size: 6.5rem; }
            .expert-footer { display: block; font-size: .85rem; }
        }
        
        @media (prefers-reduced-motion: reduce) {
            .expert-card-wrapper { transition: none !important; opacity: 1 !important; transform: none !important; }
            .expert-title i, .expert-badge { animation: none !important; }
        }
  `;

  function injectStyles() {
    if(document.getElementById('expert-card-css')) return;
    const style = document.createElement('style');
    style.id = 'expert-card-css';
    style.textContent = WIDGET_CSS;
    document.head.appendChild(style);
  }

  function injectFont() {
    if (!document.querySelector('link[href*="Shrikhand"]')) {
      const fontLink = document.createElement('link');
      fontLink.rel = 'stylesheet';
      fontLink.href = 'https://fonts.googleapis.com/css2?family=Shrikhand&display=swap';
      document.head.appendChild(fontLink);
    }
  }

  // =========================================================================
  // 3. 核心系統 (Expert Card System)
  // =========================================================================
  const ExpertCardSystem = {
    observers: [],

    LEVELS: {
      "社區人氣王": { icon: "fa-fire", title: "【社區人氣王】", mark: "HOT" },
      "社區專家": { icon: "fa-trophy", title: "【社區專家】", mark: "PRO+" },
      "社區大師": { icon: "fa-crown", title: "【社區大師】", mark: "MASTER" }
    },

    getTaiwanTime() {
      try {
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        return new Date(utc + (8 * 3600000));
      } catch (error) { return new Date(); }
    },

    isInTimeRange(start, end) {
      // 簡單判斷：若無時間限制則顯示
      if (!start && !end) return true;
      try {
        const now = this.getTaiwanTime();
        const s = start ? new Date(start) : null;
        const e = end ? new Date(end) : null;
        if (s && e) return now >= s && now <= e;
        if (s) return now >= s;
        if (e) return now <= e;
        return true;
      } catch (error) { return true; }
    },

    escapeHtml(str) {
      if (!str) return '';
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    },

    generateCardHTML(opt) {
       const lvl = this.LEVELS[opt.level] || this.LEVELS["社區專家"];
       // 注意：這裡不再需要 expert-card-hidden 或 data-animate
       // 初始樣式已經寫在 CSS 的 .expert-card-wrapper 裡 (opacity: 0, translateY: 30px)
       return `
        <div class="expert-card-wrapper">
          <div class="expert-card">
            <div class="expert-badge"><i class="fas ${lvl.icon}"></i></div>
            <img alt="${this.escapeHtml(opt.name)}" class="expert-profile" src="${opt.image}" loading="eager" decoding="sync" />
            <div class="expert-info">
              <div class="expert-title"><i class="fas ${lvl.icon}"></i>${lvl.title}</div>
              <div class="expert-name-row">
                <div class="expert-name">${this.escapeHtml(opt.name)}</div>
                <div class="expert-contact">
                  ${opt.phone ? `<a class="expert-contact-phone" href="tel:${opt.phone}"><i class="fas fa-phone-alt"></i><span>${opt.phone}</span></a>` : ''}
                  ${opt.line ? `<a class="expert-contact-line" href="${opt.line}" target="_blank"><i class="fab fa-line"></i><span>LINE</span></a>` : ''}
                </div>
              </div>
              <div class="expert-footer">證號：${this.escapeHtml(opt.license)}｜經紀業：${this.escapeHtml(opt.company)}</div>
              <div class="expert-level-mark">${lvl.mark}</div>
            </div>
          </div>
        </div>`;
    },

    injectExpertCard(opt) {
      if (!opt || !opt.container) return false;
      const container = document.querySelector(opt.container);
      if (!container) return false;
      if (!this.isInTimeRange(opt.start, opt.end)) return false;

      const html = this.generateCardHTML(opt);
      container.insertAdjacentHTML('beforeend', html);
      return true;
    },

    // 核心動畫偵測器 (修復語法錯誤版)
    observeAnimations() {
      if (!('IntersectionObserver' in window)) {
         // 如果瀏覽器不支援，直接顯示
         document.querySelectorAll('.expert-card-wrapper').forEach(el => el.classList.add('is-visible'));
         return;
      }

      const targets = document.querySelectorAll('.expert-card-wrapper:not(.is-visible)');
      if (!targets.length) return;

      const io = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          // 只要碰到一點點 (或快要碰到)
          if (entry.isIntersecting) {
            const el = entry.target;
            // 加入 class 觸發 CSS transition
            el.classList.add('is-visible');
            // 動畫只跑一次，跑完就解除觀察
            io.unobserve(el);
          }
        });
      }, { 
          threshold: 0,      // 0 = 碰到邊緣就觸發
          rootMargin: '100px' // 快滑到前 100px 就觸發 (老闆滑再快都不怕)
      }); 

      targets.forEach(el => io.observe(el));
      this.observers.push(io);
    },

    destroy() {
      this.observers.forEach(o => o && o.disconnect());
      this.observers = [];
    },

    init() {
      const list = window.expertCardList || [];
      if (!list.length) return;
      injectStyles();
      injectFont();
      list.forEach(cfg => this.injectExpertCard(cfg));
      
      // 資料注入後，立刻啟動偵測
      // 因為有 min-height，就算資料還沒載入完，容器也在那裡等著被偵測了
      setTimeout(() => this.observeAnimations(), 50); 
    }
  };

  window.ExpertCardSystem = ExpertCardSystem;
  window.addEventListener('beforeunload', () => ExpertCardSystem.destroy());

  // =========================================================================
  // 4. 主流程控制
  // =========================================================================

  async function initExpertCards() {
    const container = document.querySelector('[data-case-name]');
    if (!container || !container.id) return;

    // 先注入 CSS，讓 min-height 生效，把位子佔出來
    injectStyles(); 
    injectFont();

    const caseName = container.dataset.caseName;
    
    try {
      const res = await fetch(AGENT_GAS_URL);
      if (!res.ok) throw new Error('API Error');
      const rows = await res.json();

      const matchingExperts = rows.filter(expert => expert.case_name === caseName);
      if (matchingExperts.length === 0) {
        container.style.display = 'none';
        return;
      }

      const randomExpert = matchingExperts[Math.floor(Math.random() * matchingExperts.length)];
      
      window.expertCardList = [{
        ...randomExpert,
        container: "#" + container.id
      }];

      ExpertCardSystem.init();

    } catch (err) {
      console.error(err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initExpertCards);
  } else {
    initExpertCards();
  }

})(window, document);
