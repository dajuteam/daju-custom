/**
 * Expert Card Widget Integrated v1.2
 * 整合：資料抓取 (GAS)、卡片渲染核心 (Widget)、樣式 (CSS)、外部字體 (Google Fonts - 優化載入判定)
 */

(function (window, document) {
  'use strict';

  // =========================================================================
  // 1. 設定區域 (Configuration)
  // =========================================================================

  // !!【新】請貼上您在 Step 3 取得的「經紀人」 GAS 網址 !!
  const AGENT_GAS_URL = "https://script.google.com/macros/s/AKfycbyNJDANOuoqxNeLDl0ygGuWt73R8MrfobTaKHWmRc9yxrIF-Om40uYdR2aqSNwfedIt/exec";

  // =========================================================================
  // 2. CSS 樣式 (Style) - 完全保留原樣式與註解
  // =========================================================================
  const WIDGET_CSS = `
        /* 金牌業務卡片的CSS */

        /* 隱藏狀態 - 完全隱藏，不佔據空間 */
        .expert-card-hidden {
            opacity: 0 !important;
            visibility: hidden !important;
            transform: scale(0.8) !important;
            transition: none !important;
            pointer-events: none !important;
            will-change: transform, opacity;
        }

        .expert-card-fallback {
            opacity: 1 !important;
            visibility: visible !important;
            transform: scale(1) translateY(0) !important;
            transition: all .6s cubic-bezier(.4, 0, .2, 1) !important;
            will-change: transform, opacity;
        }

        /* 金牌經紀人容器 */
        .expert-card-wrapper {
            position: relative;
            /* 外框效果由padding控制 */
            /* padding: 3px;    */
            border-radius: 8px;
            overflow: hidden;
            width: 100%;
            max-width: 1000px;
            z-index: 0;
            line-height: 1.5;
            letter-spacing: 0;
            margin: 20px 0;
            isolation: isolate;
        }

        .expert-card-wrapper::before {
            content: "";
            position: absolute;
            top: -3px;
            left: -3px;
            right: -3px;
            bottom: -3px;
            border-radius: inherit;
            /* 與外層一致的圓角 */
            background: linear-gradient(130deg, #fffaea, #eccb7d, #fff2d4, #f4c978, #ffedb1, #e6c079, #e7c57c);
            background-size: 400% 400%;
            animation: borderFlow 10s linear infinite;
            z-index: -2;
            box-shadow: 0 0 16px rgba(4, 255, 0, 0.715);
            pointer-events: none;
            /* 不擋內部互動 */
        }

        @keyframes borderFlow {
            0% {
                background-position: 0% 50%;
            }

            50% {
                background-position: 100% 50%;
            }

            100% {
                background-position: 0% 50%;
            }
        }

        .expert-card {
            border-radius: 8px;
            padding: 10px 22px;
            position: relative;
            display: flex;
            align-items: center;
            flex-wrap: wrap;
        }


        /* 卡片金色漸層底內層-固定不動 跟陰影 */
        .expert-platinum {
            /* background: linear-gradient(120deg, rgb(255, 227, 126) 0%, #ffe68d 5%, #fff8d2 15%, #fffbec 20%, #ffe68d 55%, #fff7e0 75%, #fcd36c 100%); */
            /* box-shadow: 0 0 2px #996a1a; */
        }

        .expert-badge {
            display: none;
        }

        .expert-card .expert-badge {
            background: radial-gradient(circle, #f5d770, #d1a106);
        }

        .expert-badge i {
            color: #fff;
            font-size: 1.8em;
        }

        @keyframes rotateBadge {
            0% {
                transform: rotateY(0deg);
            }

            100% {
                transform: rotateY(360deg);
            }
        }

        .expert-profile {
            width: 80px !important;
            height: 80px !important;
            border-radius: 12px;
            border: 3px solid #fff;
            object-fit: cover;
            margin-right: 15px !important;
            box-shadow: 0 2px 8px rgba(0, 0, 0, .1);
            display: block;
            aspect-ratio: 1/1;
            /* 穩定佈局比例 */
        }

        .expert-info {
            flex: 1;
        }

        .expert-title {
            font-size: 1.1rem;
            font-weight: 700;
            margin-bottom: 6px;
        }

        .expert-info .expert-title {
            color: #9f5f00;
        }

        .expert-name-row {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 16px;
            margin-bottom: 10px;
            position: relative;
            z-index: 10;
        }

        .expert-name {
            font-size: 1.7rem;
            font-weight: bold;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .expert-contact-phone {
            background: linear-gradient(to right, #a45500, #ff9e36);
        }

        .expert-contact-line {
            background: linear-gradient(to right, #00a816, #67ca04);
        }

        .expert-contact {
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
        }

        .expert-contact a {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 40px;
            height: 40px;
            min-width: 40px;
            min-height: 40px;
            border-radius: 50%;
            padding: 0;
            font-size: 1.4rem;
            line-height: 1;
            text-decoration: none;
            transition: transform .2s ease, filter .2s ease, box-shadow .2s ease;
            outline: none;
            color: #fff;
        }

        .expert-contact a:hover {
            transform: translateY(-1px);
            filter: brightness(1.05);
        }

        .expert-contact a:active {
            transform: translateY(0);
            filter: brightness(.98);
        }

        .expert-contact a:focus-visible {
            box-shadow: 0 0 0 3px rgba(255, 255, 255, .9), 0 0 0 6px rgba(164, 85, 0, .35);
        }

        .expert-contact a i.fa-phone-alt {
            font-size: 1.3rem;
        }

        .expert-contact a i.fa-line {
            font-size: 1.5rem;
        }


        .expert-name-row .expert-contact a {
            color: #fff;
        }

        .expert-footer {
            /* 證號經紀人隱藏 */
            display: none;
            position: relative;
            z-index: 3;
            font-size: .5rem;
            color: #af885c;
        }

        .expert-level-mark {
            position: absolute;
            right: 18px;
            top: 10px;
            font-family: "Shrikhand", serif;
            font-style: italic;
            font-size: 1.1rem;
            color: rgba(194, 145, 67, 0.5);
            opacity: 0;
            animation: fadeSlideIn .8s ease-out forwards;
            animation-delay: 1s;
            pointer-events: none;
            z-index: 2;
            text-shadow: 0 1px 1px rgba(255, 255, 255, .4);
            /* 微提可讀性 */
        }

        @keyframes fadeSlideIn {
            0% {
                transform: translate(0, 20px);
                opacity: 0;
            }

            100% {
                transform: translate(0, 0);
                opacity: .9;
            }
        }

        .expert-contact a span {
            display: none;
        }

        .expert-title i {
            animation: rotateBadge 3s linear infinite;
        }

        .expert-opacity-0 {
            opacity: 0;
            pointer-events: none;
            visibility: hidden;
            transition: opacity .2s ease;
        }

        /* Small-plus 微調 */
        @media (min-width:414px) {
            .expert-level-mark {
                font-size: 1.6rem;
                right: 10px;
                top: 6px;
            }
        }

        /* ------電腦版調整------- */
        @media screen and (min-width:992px) {
            .expert-card-wrapper {
                /* padding: 6px; */
                border-radius: 15px;
            }

            .expert-card-wrapper::before {
                /* box-shadow: 0 0 16px rgba(106, 70, 19, .715); */
            }

            .expert-card {
                border-radius: 15px;
                padding: 15px 28px;
            }

            .expert-title {
                font-size: 1.7rem;
            }

            .expert-title i {
                animation: none;
            }

            /* 確實關閉桌機旋轉 */

            .expert-platinum {
                /* box-shadow: 0 0 3px #996a1a; */
            }

            .expert-name-row {
                gap: 30px;
            }

            .expert-contact a {
                width: auto;
                height: auto;
                min-height: 44px;
                /* 桌機/平板更舒適的點擊區 */
                font-size: 1.4rem;
                padding: 8px 16px;
                gap: 8px;
                border-radius: 10px;
                letter-spacing: 1.1px;
            }

            .expert-contact a span {
                display: inline;
            }

            .expert-badge {
                width: 60px;
                height: 60px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-right: 25px;
                flex-shrink: 0;
                box-shadow: 0 2px 8px rgba(0, 0, 0, .2);
                animation: rotateBadge 3s linear infinite;
            }

            .expert-profile {
                width: 120px !important;
                height: 120px !important;
                border-radius: 12px;
                border: 4px solid #fff;
                margin-right: 30px !important;
                box-shadow: 0 2px 5px #dcad6ccc;
            }

            .expert-name {
                font-size: 2.3rem;
                max-width: 40ch;
                /* 避免超長姓名撐版 */
            }

            .expert-level-mark {
                right: -20px;
                top: 34px;
                font-size: 6.5rem;
            }

            .expert-footer {
                font-size: .85rem;
            }
        }

        /* 無動畫偏好：尊重系統設定 */
        @media (prefers-reduced-motion: reduce) {

            .expert-title i,
            .expert-badge,
            .expert-card-wrapper[data-animate],
            .expert-level-mark {
                animation: none !important;
                transition: none !important;
            }
        }
  `;

  // 注入 CSS 樣式
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = WIDGET_CSS;
    document.head.appendChild(style);
  }

  // 注入外部字體 (採用模糊比對，避免重複載入)
  function injectFont() {
    // 檢查頁面中任何 link href 屬性是否包含 'Shrikhand'
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
  /**
   * Expert Card Injection System - 改進版本（強化：時間區間、連結/電話淨化、IO 降級補圖、圖片優化 不 lazy load（用 src 取代 data-src））20250817v5
   */
  const ExpertCardSystem = {
    observers: [],
    imageSeq: 0,

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
      } catch (error) {
        console.warn('ExpertCard: 時間計算錯誤', error);
        return new Date();
      }
    },

    isInTimeRange(start, end) {
      const parseTW = (val) => {
        if (!val) return null;
        if (val instanceof Date) return isNaN(val.getTime()) ? null : val;

        let s = String(val).trim();
        s = s.replace(/\//g, '-');
        if (s.includes(' ') && !s.includes('T')) s = s.replace(' ', 'T');
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00:00';
        if (!/[zZ]|[+\-]\d{2}:\d{2}$/.test(s)) s += '+08:00';
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
      };

      try {
        const now = this.getTaiwanTime();
        const s = parseTW(start);
        const e = parseTW(end);
        if (s && e) return now >= s && now <= e;
        if (s && !e) return now >= s;
        if (!s && e) return now <= e;
        return true;
      } catch (error) {
        console.warn('ExpertCard: 時間範圍檢查錯誤', error);
        return true;
      }
    },

    escapeHtml(str) {
      if (!str) return '';
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    },

    sanitizeTel(raw) {
      return raw ? String(raw).replace(/[^\d+]/g, '') : '';
    },

    sanitizeHref(raw, allowLine = false) {
      if (!raw) return '';
      const s = String(raw).trim();
      if (/^https?:\/\//i.test(s)) return s;
      if (/^tel:/i.test(s)) return s;
      if (allowLine && /^https?:\/\/(line\.me|lin\.ee)\//i.test(s)) return s;
      return '';
    },

    generateCardHTML(opt) {
      try {
        const lvl = this.LEVELS[opt.level];
        if (!lvl) {
          console.warn('ExpertCard: 未知等級', opt.level);
          return '';
        }

        const imageSrc = this.escapeHtml(opt.image);
        const telClean = this.sanitizeTel(opt.phone);
        const telHref = telClean ? `tel:${telClean}` : '';
        const lineHref = this.sanitizeHref(opt.line, true);

        // ✅ 單卡片優化：直接使用 src 載入圖片，不使用 lazy loading
        return `<div class="expert-card-wrapper expert-platinum expert-card-hidden" data-animate="flipInY">
  <div class="expert-card expert-platinum">
    <div class="expert-badge"><i class="fas ${lvl.icon}"></i></div>
    <img
      alt="頭像"
      class="expert-profile"
      src="${imageSrc}"
      loading="eager"
      decoding="async"
      fetchpriority="high"
      referrerpolicy="no-referrer"
      width="120" height="120"
    />
    <div class="expert-info">
      <div class="expert-title"><i class="fas ${lvl.icon}"></i>${lvl.title}</div>
      <div class="expert-name-row">
        <div class="expert-name">${this.escapeHtml(opt.name)}</div>
        <div class="expert-contact">
          ${telHref ? `<a class="expert-contact-phone" href="${telHref}"><i class="fas fa-phone-alt"></i><span>${this.escapeHtml(opt.phone)}</span></a>` : ''}
          ${lineHref ? `<a class="expert-contact-line" href="${lineHref}" target="_blank" rel="noopener noreferrer"><i class="fab fa-line"></i><span>LINE</span></a>` : ''}
        </div>
      </div>
      <div class="expert-footer">證號：${this.escapeHtml(opt.license || '')}｜經紀業：${this.escapeHtml(opt.company || '')}</div>
      <div class="expert-level-mark">${lvl.mark}&nbsp;</div>
    </div>
  </div>
</div>`;
      } catch (error) {
        console.error('ExpertCard: HTML生成失敗', error);
        return '';
      }
    },

    injectExpertCard(opt) {
      try {
        if (!opt || !opt.container || !opt.level || !opt.name) {
          console.warn('ExpertCard: 配置不完整', opt);
          return false;
        }

        const container = document.querySelector(opt.container);
        if (!container) {
          console.warn('ExpertCard: 找不到容器', opt.container);
          return false;
        }

        if (!this.isInTimeRange(opt.start, opt.end)) return false;

        const html = this.generateCardHTML(opt);
        if (html) {
          container.insertAdjacentHTML('beforeend', html);

          // ✅ 單卡片：提前預載圖片至記憶體，加快首次顯示速度
          if (opt.image) {
            const preload = new Image();
            preload.src = opt.image;
            if (preload.decode) preload.decode().catch(() => {});
          }

          return true;
        }
        return false;
      } catch (error) {
        console.error('ExpertCard: 卡片注入失敗', error);
        return false;
      }
    },

    observeAnimations() {
      if (!('IntersectionObserver' in window)) return;

      const targets = document.querySelectorAll('.expert-card-wrapper[data-animate]:not(.expert-observed)');
      if (!targets.length) return;

      const io = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const el = entry.target;

          try {
            el.classList.remove('expert-card-hidden');

            const raw = (el.dataset.animate || 'flipInY').trim();
            const tokens = raw.split(/\s+/).filter(Boolean).map(t => t.replace(/^animate__/, ''));
            if (!el.classList.contains('animated')) el.classList.add('animated');
            if (tokens.length) el.classList.add(...tokens);
            el.style.animationDuration = '1.5s';

          } catch (err) {
            console.error('ExpertCard: 動畫觸發失敗', err);
            el.classList.remove('expert-card-hidden');
          } finally {
            io.unobserve(el);
          }
        });
      }, { threshold: 0.3, rootMargin: '20px' });

      targets.forEach(el => {
        el.classList.add('expert-observed');
        io.observe(el);
      });

      this.observers.push(io);
    },

    // ✅ lazyLoadImages 不再使用，已改為立即載入圖片，因此可移除或保留備份用

    destroy() {
      this.observers.forEach(observer => {
        if (observer && typeof observer.disconnect === 'function') {
          observer.disconnect();
        }
      });
      this.observers = [];
    },

    init() {
      try {
        const list = window.expertCardList || [];
        if (!list.length) {
          console.warn('ExpertCard: 沒有找到 expertCardList');
          return;
        }

        // 注入 CSS 與 字體 (已修正為優化版判定)
        injectStyles();
        injectFont(); 

        list.forEach(cfg => this.injectExpertCard(cfg));
        this.observeAnimations(); // ✅ 保留動畫觸發（不影響圖片載入）

      } catch (error) {
        console.error('ExpertCard: 初始化失敗', error);
      }
    }
  };

  // 將 System 掛載到 window (若有其他用途可呼叫，但在此整合版主要由內部呼叫)
  window.ExpertCardSystem = ExpertCardSystem;

  window.addEventListener('beforeunload', () => {
    ExpertCardSystem.destroy();
  });


  // =========================================================================
  // 4. 主流程控制 (Controller)
  // =========================================================================

  async function initExpertCards() {
    // 1. 找出頁面上的經紀人卡片容器
    const container = document.querySelector('[data-case-name]');
    if (!container || !container.id) {
      return; // 這頁沒有經紀人卡片，或沒有 id
    }

    // 2. 取得這個頁面對應的案名
    const caseName = container.dataset.caseName;
    if (!caseName) return;

    let rows = [];
    try {
      // 3. 抓取所有經紀人資料
      const res = await fetch(AGENT_GAS_URL, { mode: 'cors' });
      if (!res.ok) throw new Error(`GAS API fetch error: ${res.statusText}`);
      rows = await res.json();
    } catch (err) {
      console.error('[expert-gas] 經紀人 GAS 載入失敗：', err);
      return;
    }

    // 4. 過濾資料，只找出 case_name 符合的經紀人
    const matchingExperts = rows.filter(expert => expert.case_name === caseName);

    if (matchingExperts.length === 0) {
      container.style.display = 'none'; // 沒人則隱藏區塊
      return;
    }

    // ===========================================================
    // ★ 修改區塊：決定要顯示哪些人 (隨機抽籤 vs 全部顯示)
    // ===========================================================
    
    // 這裡宣告一個變數來裝「最後要顯示的名單」
    let finalDisplayList = [];

    // ---【目前模式】：隨機輪播 (自動計算人數平均機率) ---
    const randomIndex = Math.floor(Math.random() * matchingExperts.length);
    finalDisplayList = [ matchingExperts[randomIndex] ]; 

    // ---【備用模式】：顯示全部 (未來想改回來請用這個) ---
    // 如果以後想改回顯示所有人，請把上面兩行刪掉或註解，並把下面這行打開：
    // finalDisplayList = matchingExperts;

    // ===========================================================
    // ★ 修改結束
    // ===========================================================


    // 5. 【關鍵】建立舊腳本 (widget) 需要的資料格式
    // 注意：這裡改用我們過濾好的 finalDisplayList 來跑 map
    window.expertCardList = finalDisplayList.map(expert => {
      return {
        level: expert.level,
        name: expert.name,
        phone: expert.phone,
        line: expert.line,
        license: expert.license,
        company: expert.company,
        image: expert.image,
        start: expert.start,
        end: expert.end,
        container: "#" + container.id // 動態填入容器 ID
      };
    });

    // 6. 【關鍵】直接執行核心系統 (取代舊有的 loadScript)
    ExpertCardSystem.init();
  }

  // 程式入口點
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initExpertCards);
  } else {
    initExpertCards();
  }

})(window, document);
