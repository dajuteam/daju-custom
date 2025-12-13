   /**
         * Expert Card Injection System - 改進版本（強化：時間區間、連結/電話淨化、IO 降級補圖、圖片優化 不 lazy load（用 src 取代 data-src））20250817v5
         */
     (function (window, document) {
  'use strict';

  if (window.ExpertCardSystem) return;

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
        return `
<div class="expert-card-wrapper expert-platinum expert-card-hidden" data-animate="flipInY">
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

        list.forEach(cfg => this.injectExpertCard(cfg));
        this.observeAnimations(); // ✅ 保留動畫觸發（不影響圖片載入）

      } catch (error) {
        console.error('ExpertCard: 初始化失敗', error);
      }
    }
  };

  window.ExpertCardSystem = ExpertCardSystem;
  window.addEventListener('beforeunload', () => {
    ExpertCardSystem.destroy();
  });

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', () => ExpertCardSystem.init())
    : ExpertCardSystem.init();

})(window, document);
