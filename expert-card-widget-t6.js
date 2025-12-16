/**
 * Expert Card Widget Integrated v1.5 (Zero Latency Edition)
 * 整合：資料抓取 (GAS)、卡片渲染核心 (Widget)、樣式 (CSS)、外部字體
 * 優化：v1.4 基礎 + 「圖片背景預載機制」，實現照片秒開零延遲
 */

(function (window, document) {
  'use strict';

  // =========================================================================
  // 1. 設定區域 (Configuration)
  // =========================================================================
  const AGENT_GAS_URL = "https://script.google.com/macros/s/AKfycbz-sDaYGPoWDdx2_TrVxrVSIT1i0qVBvTSKiNebeARGRvwsLcXUUeSbMXSiomWNcl9Q/exec";

  // =========================================================================
  // 2. CSS 樣式 (Style)
  // =========================================================================
  const WIDGET_CSS = `
        /* 金牌業務卡片的CSS - 效能與預載優化版 */

        .expert-card-hidden {
            opacity: 0 !important;
            visibility: hidden !important;
            transform: translateY(30px) !important;
            will-change: transform, opacity;
            pointer-events: none !important;
        }

        .expert-card-visible {
            visibility: visible !important;
            animation: expertFadeMoveUp 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
        }

        @keyframes expertFadeMoveUp {
            0% { opacity: 0; transform: translateY(30px); }
            100% { opacity: 1; transform: translateY(0); }
        }

        .expert-card-wrapper {
            position: relative;
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
            top: -3px; left: -3px; right: -3px; bottom: -3px;
            border-radius: inherit;
            background: linear-gradient(130deg, #fffaea, #eccb7d, #fff2d4, #f4c978, #ffedb1, #e6c079, #e7c57c);
            background-size: 400% 400%;
            animation: borderFlow 10s linear infinite;
            z-index: -2;
            box-shadow: 0 0 16px rgba(4, 255, 0, 0.715);
            pointer-events: none;
        }

        @keyframes borderFlow {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }

        .expert-card {
            border-radius: 8px;
            padding: 10px 22px;
            position: relative;
            display: flex;
            align-items: center;
            flex-wrap: wrap;
        }

        .expert-badge { display: none; }
        .expert-card .expert-badge { background: radial-gradient(circle, #f5d770, #d1a106); }
        .expert-badge i { color: #fff; font-size: 1.8em; }

        @keyframes rotateBadge {
            0% { transform: rotateY(0deg); }
            100% { transform: rotateY(360deg); }
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
            /* 預載優化：給一個背景色，萬一真的還在載入，不會是透明的 */
            background-color: #f0f0f0; 
            transform: translateZ(0);
            -webkit-transform: translateZ(0);
        }

        .expert-info { flex: 1; }
        .expert-title { font-size: 1.1rem; font-weight: 700; margin-bottom: 6px; }
        .expert-info .expert-title { color: #9f5f00; }

        .expert-name-row {
            display: flex; flex-wrap: wrap; align-items: center;
            gap: 16px; margin-bottom: 10px; position: relative; z-index: 10;
        }

        .expert-name {
            font-size: 1.7rem; font-weight: bold; max-width: 100%;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        .expert-contact-phone { background: linear-gradient(to right, #a45500, #ff9e36); }
        .expert-contact-line { background: linear-gradient(to right, #00a816, #67ca04); }

        .expert-contact { display: flex; gap: 15px; flex-wrap: wrap; }

        .expert-contact a {
            display: inline-flex; align-items: center; justify-content: center;
            width: 40px; height: 40px; min-width: 40px; min-height: 40px;
            border-radius: 50%; padding: 0; font-size: 1.4rem; line-height: 1;
            text-decoration: none; transition: transform .2s ease, filter .2s ease, box-shadow .2s ease;
            outline: none; color: #fff;
        }

        .expert-contact a:hover { transform: translateY(-1px); filter: brightness(1.05); }
        .expert-contact a:active { transform: translateY(0); filter: brightness(.98); }
        .expert-contact a:focus-visible { box-shadow: 0 0 0 3px rgba(255, 255, 255, .9), 0 0 0 6px rgba(164, 85, 0, .35); }
        .expert-contact a i.fa-phone-alt { font-size: 1.3rem; }
        .expert-contact a i.fa-line { font-size: 1.5rem; }
        .expert-name-row .expert-contact a { color: #fff; }

        .expert-footer {
            display: none; position: relative; z-index: 3; font-size: .5rem; color: #af885c;
        }

        .expert-level-mark {
            position: absolute; right: 18px; top: 10px;
            font-family: "Shrikhand", serif; font-style: italic; font-size: 1.1rem;
            color: rgba(194, 145, 67, 0.5); opacity: 0;
            animation: fadeSlideIn .8s ease-out forwards; animation-delay: 1s;
            pointer-events: none; z-index: 2; text-shadow: 0 1px 1px rgba(255, 255, 255, .4);
        }

        @keyframes fadeSlideIn {
            0% { transform: translate(0, 20px); opacity: 0; }
            100% { transform: translate(0, 0); opacity: .9; }
        }

        .expert-contact a span { display: none; }
        .expert-title i { animation: rotateBadge 3s linear infinite; }

        @media (min-width:414px) {
            .expert-level-mark { font-size: 1.6rem; right: 10px; top: 6px; }
        }

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
                width: 60px; height: 60px; border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                margin-right: 25px; flex-shrink: 0;
                box-shadow: 0 2px 8px rgba(0, 0, 0, .2);
                animation: rotateBadge 3s linear infinite;
            }
            .expert-profile {
                width: 120px !important; height: 120px !important;
                border-radius: 12px; border: 4px solid #fff;
                margin-right: 30px !important;
                box-shadow: 0 2px 5px #dcad6ccc;
            }
            .expert-name { font-size: 2.3rem; max-width: 40ch; }
            .expert-level-mark { right: -20px; top: 34px; font-size: 6.5rem; }
            .expert-footer { font-size: .85rem; }
        }

        @media (prefers-reduced-motion: reduce) {
            .expert-title i, .expert-badge, .expert-level-mark, .expert-card-visible {
                animation: none !important; transition: none !important; opacity: 1 !important; transform: none !important;
            }
        }
  `;

  function injectStyles() {
    const style = document.createElement('style');
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
  // 3. 核心系統
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
      const parseTW = (val) => {
        if (!val) return null;
        if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
        let s = String(val).trim().replace(/\//g, '-').replace(' ', 'T');
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
      } catch (e) { return true; }
    },

    escapeHtml(str) {
      if (!str) return '';
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    },

    sanitizeTel(raw) { return raw ? String(raw).replace(/[^\d+]/g, '') : ''; },

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
        if (!lvl) return '';

        const imageSrc = this.escapeHtml(opt.image);
        const telClean = this.sanitizeTel(opt.phone);
        const telHref = telClean ? `tel:${telClean}` : '';
        const lineHref = this.sanitizeHref(opt.line, true);

        return `<div class="expert-card-wrapper expert-platinum expert-card-hidden">
  <div class="expert-card expert-platinum">
    <div class="expert-badge"><i class="fas ${lvl.icon}"></i></div>
    <img
      alt="頭像"
      class="expert-profile"
      src="${imageSrc}"
      loading="eager"
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
      } catch (e) { return ''; }
    },

    injectExpertCard(opt) {
      try {
        if (!opt || !opt.container || !opt.level || !opt.name) return false;
        const container = document.querySelector(opt.container);
        if (!container) return false;
        if (!this.isInTimeRange(opt.start, opt.end)) return false;

        const html = this.generateCardHTML(opt);
        if (html) {
          container.insertAdjacentHTML('beforeend', html);
          return true;
        }
        return false;
      } catch (e) { return false; }
    },

    observeAnimations() {
      if (!('IntersectionObserver' in window)) return;
      const targets = document.querySelectorAll('.expert-card-wrapper:not(.expert-observed)');
      if (!targets.length) return;

      const io = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          try {
            el.classList.remove('expert-card-hidden');
            el.classList.add('expert-card-visible');
          } catch (e) {
            el.style.opacity = '1';
            el.style.visibility = 'visible';
            el.style.transform = 'translateY(0)';
          } finally {
            io.unobserve(el);
          }
        });
      }, { threshold: 0, rootMargin: '100px' });

      targets.forEach(el => {
        el.classList.add('expert-observed');
        io.observe(el);
      });
      this.observers.push(io);
    },

    destroy() {
      this.observers.forEach(o => o && o.disconnect());
      this.observers = [];
    },

    init() {
      try {
        const list = window.expertCardList || [];
        if (!list.length) return;
        injectStyles();
        injectFont();
        list.forEach(cfg => this.injectExpertCard(cfg));
        this.observeAnimations();
      } catch (e) { console.error('ExpertCard: init failed', e); }
    }
  };

  window.ExpertCardSystem = ExpertCardSystem;
  window.addEventListener('beforeunload', () => ExpertCardSystem.destroy());

  // =========================================================================
  // 4. 主流程控制 (已加入預載機制)
  // =========================================================================
  async function initExpertCards() {
    const container = document.querySelector('[data-case-name]');
    if (!container || !container.id) return;

    const caseName = container.dataset.caseName;
    if (!caseName) return;

    let rows = [];
    try {
      const res = await fetch(AGENT_GAS_URL, { mode: 'cors' });
      if (!res.ok) throw new Error(`GAS API fetch error`);
      rows = await res.json();
    } catch (err) {
      console.error('[expert-gas] 載入失敗', err);
      return;
    }

    const matchingExperts = rows.filter(expert => expert.case_name === caseName);
    if (matchingExperts.length === 0) {
      container.style.display = 'none';
      return;
    }

    // 隨機選人
    const randomIndex = Math.floor(Math.random() * matchingExperts.length);
    const selectedExpert = matchingExperts[randomIndex];

    // -------------------------------------------------------------------
    // 【新】極限優化：JS 強制背景預載 (Preload Image)
    // 在注入 HTML 之前，先建立一個 Image 物件去請求圖片。
    // 這會強制瀏覽器將圖片存入快取 (Cache)。
    // -------------------------------------------------------------------
    if (selectedExpert && selectedExpert.image) {
        const preloadImg = new Image();
        preloadImg.src = selectedExpert.image;
        // 不需插入 DOM，只要指定 src，瀏覽器就會開始下載
    }
    // -------------------------------------------------------------------

    window.expertCardList = [{
      level: selectedExpert.level,
      name: selectedExpert.name,
      phone: selectedExpert.phone,
      line: selectedExpert.line,
      license: selectedExpert.license,
      company: selectedExpert.company,
      image: selectedExpert.image,
      start: selectedExpert.start,
      end: selectedExpert.end,
      container: "#" + container.id
    }];

    ExpertCardSystem.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initExpertCards);
  } else {
    initExpertCards();
  }

})(window, document);
