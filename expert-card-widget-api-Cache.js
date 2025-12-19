/**
 * Expert Card Widget V4.7 (Animation Fix)
 * Features: SWR, Zero CLS, Original Float-Up Animation Restored
 */
(function (window, document) {
  'use strict';

  const CONFIG = {
    API_URL: "https://script.google.com/macros/s/AKfycbz-sDaYGPoWDdx2_TrVxrVSIT1i0qVBvTSKiNebeARGRvwsLcXUUeSbMXSiomWNcl9Q/exec",
    CACHE_KEY: 'daju_expert_v4_store',
    TTL: 15 * 60 * 1000,     // 15分鐘
    FETCH_TIMEOUT_MS: 8000   // 8秒熔斷
  };

  // =========================================================
  // CSS (修正動畫衝突)
  // =========================================================
  const WIDGET_CSS = `
    /* Zero CLS 控制：外層只負責佔位與顯示，不搶戲 */
    .expert-container-v4 { display: none; } 
    .expert-container-v4.loaded { display: block; } /* 移除這裡的 animation，讓卡片自己演 */

    /* 您的原始動畫 (保留) */
    .expert-card-hidden { opacity: 0 !important; visibility: hidden !important; transform: translateY(30px) !important; will-change: transform, opacity; pointer-events: none !important; }
    
    /* 這裡稍微加強動畫持續時間與曲線，讓浮出感更明顯 */
    .expert-card-visible { 
        visibility: visible !important; 
        animation: expertFadeMoveUp 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards; 
    }
    
    @keyframes expertFadeMoveUp { 
        0% { opacity: 0; transform: translateY(30px); } 
        100% { opacity: 1; transform: translateY(0); } 
    }

    /* 以下完全保留原樣 */
    .expert-card-wrapper { position: relative; border-radius: 8px; overflow: hidden; width: 100%; max-width: 1000px; z-index: 0; line-height: 1.5; letter-spacing: 0; margin: 20px 0; isolation: isolate; }
    .expert-card-wrapper::before { content: ""; position: absolute; top: -3px; left: -3px; right: -3px; bottom: -3px; border-radius: inherit; background: linear-gradient(130deg, #fffaea, #eccb7d, #fff2d4, #f4c978, #ffedb1, #e6c079, #e7c57c); background-size: 400% 400%; animation: borderFlow 10s linear infinite; z-index: -2; box-shadow: 0 0 16px rgba(4, 255, 0, 0.715); pointer-events: none; }
    @keyframes borderFlow { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
    .expert-card { border-radius: 8px; padding: 10px 22px; position: relative; display: flex; align-items: center; flex-wrap: wrap; }
    .expert-badge { display: none; }
    .expert-card .expert-badge { background: radial-gradient(circle, #f5d770, #d1a106); }
    .expert-badge i { color: #fff; font-size: 1.8em; }
    @keyframes rotateBadge { 0% { transform: rotateY(0deg); } 100% { transform: rotateY(360deg); } }
    .expert-profile { width: 80px !important; height: 80px !important; border-radius: 12px; border: 3px solid #fff; object-fit: cover; margin-right: 15px !important; box-shadow: 0 2px 8px rgba(0, 0, 0, .1); display: block; aspect-ratio: 1/1; background-color: #f0f0f0; transform: translateZ(0); -webkit-transform: translateZ(0); }
    .expert-info { flex: 1; }
    .expert-title { font-size: 1.1rem; font-weight: 700; margin-bottom: 6px; }
    .expert-info .expert-title { color: #9f5f00; }
    .expert-name-row { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; margin-bottom: 10px; position: relative; z-index: 10; }
    .expert-name { font-size: 1.7rem; font-weight: bold; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .expert-contact-phone { background: linear-gradient(to right, #a45500, #ff9e36); }
    .expert-contact-line { background: linear-gradient(to right, #00a816, #67ca04); }
    .expert-contact { display: flex; gap: 15px; flex-wrap: wrap; }
    .expert-contact a { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; min-width: 40px; min-height: 40px; border-radius: 50%; padding: 0; font-size: 1.4rem; line-height: 1; text-decoration: none; transition: transform .2s ease, filter .2s ease, box-shadow .2s ease; outline: none; color: #fff; }
    .expert-contact a:hover { transform: translateY(-1px); filter: brightness(1.05); }
    .expert-contact a:active { transform: translateY(0); filter: brightness(.98); }
    .expert-contact a:focus-visible { box-shadow: 0 0 0 3px rgba(255, 255, 255, .9), 0 0 0 6px rgba(164, 85, 0, .35); }
    .expert-contact a i.fa-phone-alt { font-size: 1.3rem; }
    .expert-contact a i.fa-line { font-size: 1.5rem; }
    .expert-name-row .expert-contact a { color: #fff; }
    .expert-footer { display: none; position: relative; z-index: 3; font-size: .5rem; color: #af885c; }
    .expert-level-mark { position: absolute; right: 18px; top: 10px; font-family: "Shrikhand", serif; font-style: italic; font-size: 1.1rem; color: rgba(194, 145, 67, 0.5); opacity: 0; animation: fadeSlideIn .8s ease-out forwards; animation-delay: 1s; pointer-events: none; z-index: 2; text-shadow: 0 1px 1px rgba(255, 255, 255, .4); }
    @keyframes fadeSlideIn { 0% { transform: translate(0, 20px); opacity: 0; } 100% { transform: translate(0, 0); opacity: .9; } }
    .expert-contact a span { display: none; }
    .expert-title i { animation: rotateBadge 3s linear infinite; }
    @media (min-width:414px) { .expert-level-mark { font-size: 1.6rem; right: 10px; top: 6px; } }
    @media screen and (min-width:992px) { .expert-card-wrapper { border-radius: 15px; } .expert-card { border-radius: 15px; padding: 15px 28px; } .expert-title { font-size: 1.7rem; } .expert-title i { animation: none; } .expert-contact a { width: auto; height: auto; min-height: 44px; font-size: 1.4rem; padding: 8px 16px; gap: 8px; border-radius: 10px; letter-spacing: 1.1px; } .expert-contact a span { display: inline; } .expert-badge { width: 60px; height: 60px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 25px; flex-shrink: 0; box-shadow: 0 2px 8px rgba(0, 0, 0, .2); animation: rotateBadge 3s linear infinite; } .expert-profile { width: 120px !important; height: 120px !important; border-radius: 12px; border: 4px solid #fff; margin-right: 30px !important; box-shadow: 0 2px 5px #dcad6ccc; } .expert-name { font-size: 2.3rem; max-width: 40ch; } .expert-level-mark { right: -20px; top: 34px; font-size: 6.5rem; } .expert-footer { font-size: .85rem; } }
    @media (prefers-reduced-motion: reduce) { .expert-title i, .expert-badge, .expert-level-mark, .expert-card-visible { animation: none !important; transition: none !important; opacity: 1 !important; transform: none !important; } }
  `;

  // =========================================================
  // V4 Data Engine
  // =========================================================
  async function fetchExpertData() {
    const now = Date.now();
    let cache = null;
    try { cache = JSON.parse(localStorage.getItem(CONFIG.CACHE_KEY)); } catch(e) {}

    // A. Local Hit
    if (cache && cache.data && (now - cache.timestamp < CONFIG.TTL)) {
      console.log('[Expert V4] Local Hit');
      return cache.data;
    }

    // B. SWR Mode
    if (cache && cache.data) {
      console.log('[Expert V4] SWR Mode');
      fetchFromNetwork(cache.version).then(newData => {
         if (newData) console.log('[Expert V4] Background updated');
      });
      return cache.data; 
    }

    // C. Cold Start
    return await fetchFromNetwork();
  }

  async function fetchFromNetwork(currentVersion = '') {
    const url = `${CONFIG.API_URL}?v=${currentVersion}`;
    
    // Timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(url, { 
          signal: controller.signal,
          cache: "no-cache" 
      });
      
      clearTimeout(timeoutId);

      const json = await res.json();

      if (json.code === 304) {
        console.log('[Expert V4] 304 Not Modified');
        const raw = localStorage.getItem(CONFIG.CACHE_KEY);
        if (raw) {
           const c = JSON.parse(raw);
           c.timestamp = Date.now();
           localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify(c));
        }
        return null;
      }

      if (json.code === 200 && json.data) {
        localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({
          version: json.version,
          timestamp: Date.now(),
          data: json.data
        }));
        return json.data;
      }

    } catch (err) {
      clearTimeout(timeoutId);
      console.error('[Expert V4] Network Error:', err);
    }
    return null;
  }

  // =========================================================
  // UI Logic
  // =========================================================
  const ExpertCardSystem = {
    LEVELS: {
      "社區人氣王": { icon: "fa-fire", title: "【社區人氣王】", mark: "HOT" },
      "社區專家": { icon: "fa-trophy", title: "【社區專家】", mark: "PRO+" },
      "社區大師": { icon: "fa-crown", title: "【社區大師】", mark: "MASTER" }
    },
    getTaiwanTime() { try { const now = new Date(); const utc = now.getTime() + (now.getTimezoneOffset() * 60000); return new Date(utc + (8 * 3600000)); } catch (error) { return new Date(); } },
    isInTimeRange(start, end) { try { const parseTW = (val) => { if (!val) return null; if (val instanceof Date) return isNaN(val.getTime()) ? null : val; let s = String(val).trim().replace(/\//g, '-').replace(' ', 'T'); if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00:00'; if (!/[zZ]|[+\-]\d{2}:\d{2}$/.test(s)) s += '+08:00'; const d = new Date(s); return isNaN(d.getTime()) ? null : d; }; const now = this.getTaiwanTime(); const s = parseTW(start); const e = parseTW(end); if (s && e) return now >= s && now <= e; if (s && !e) return now >= s; if (!s && e) return now <= e; return true; } catch (e) { return true; } },
    escapeHtml(str) { if (!str) return ''; const div = document.createElement('div'); div.textContent = str; return div.innerHTML; },
    sanitizeTel(raw) { return raw ? String(raw).replace(/[^\d+]/g, '') : ''; },
    sanitizeHref(raw, allowLine = false) { if (!raw) return ''; const s = String(raw).trim(); if (/^https?:\/\//i.test(s)) return s; if (/^tel:/i.test(s)) return s; if (allowLine && /^https?:\/\/(line\.me|lin\.ee)\//i.test(s)) return s; return ''; },
    
    generateCardHTML(opt) {
       const lvl = this.LEVELS[opt.level];
       if (!lvl) return '';
       const imageSrc = this.escapeHtml(opt.image);
       const telClean = this.sanitizeTel(opt.phone);
       const telHref = telClean ? `tel:${telClean}` : '';
       const lineHref = this.sanitizeHref(opt.line, true);
       return `<div class="expert-card-wrapper expert-platinum expert-card-hidden">
         <div class="expert-card expert-platinum">
           <div class="expert-badge"><i class="fas ${lvl.icon}"></i></div>
           <img alt="頭像" class="expert-profile" src="${imageSrc}" loading="eager" referrerpolicy="no-referrer" width="120" height="120" />
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
    },

    injectFont() {
      if (!document.querySelector('link[href*="Shrikhand"]')) {
        const fontLink = document.createElement('link');
        fontLink.rel = 'stylesheet';
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Shrikhand&display=swap';
        document.head.appendChild(fontLink);
      }
    },

    run(data) {
       const container = document.getElementById('expert-container');
       if (!container || !container.dataset.caseName) return;
       const caseName = container.dataset.caseName;
       
       const matchingExperts = data.filter(e => e.case_name === caseName && this.isInTimeRange(e.start, e.end));
       
       if (matchingExperts.length === 0) {
         return; 
       }

       const selected = matchingExperts[Math.floor(Math.random() * matchingExperts.length)];
       container.innerHTML = this.generateCardHTML(selected);
       
       // UI: 顯示 (先讓外框出來，再讓裡面的卡片浮出來)
       requestAnimationFrame(() => {
          container.classList.add('loaded'); // 外框瞬間出現 (無動畫)
          
          const card = container.querySelector('.expert-card-wrapper');
          if(card) {
             // 稍微延遲一下下，確保外框已經 display: block 了，卡片才開始跑動畫
             setTimeout(() => {
                card.classList.remove('expert-card-hidden');
                card.classList.add('expert-card-visible');
             }, 50);
          }
       });
       this.injectFont();
    }
  };

  function injectStyles() {
    if (document.getElementById('daju-expert-css-v4')) return;
    const style = document.createElement('style');
    style.id = 'daju-expert-css-v4';
    style.textContent = WIDGET_CSS;
    document.head.appendChild(style);
  }

  // =========================================================
  // Main Entry
  // =========================================================
  async function init() {
    // 1. Zero CLS 初始化
    const container = document.getElementById('expert-container');
    if (container) container.classList.add('expert-container-v4');

    injectStyles();
    
    const data = await fetchExpertData();
    if (data) ExpertCardSystem.run(data);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window, document);
