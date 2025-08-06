function injectExpertCard(options) {
  const levels = {
    "社區人氣王": {
      icon: "fa-fire",
      title: "【社區人氣王】",
      mark: "POP",
      class: "expert-pop"
    },
    "社區專家": {
      icon: "fa-trophy",
      title: "【社區專家】",
      mark: "PRO+",
      class: "expert-pro"
    },
    "社區大師": {
      icon: "fa-crown",
      title: "【社區大師】",
      mark: "MASTER",
      class: "expert-master"
    }
  };

  const {
    level,
    name,
    phone,
    line,
    license,
    company,
    image,
    container,
    start,
    end
  } = options;

  // ✅ 時間判斷（台灣時區）
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  if (start && end) {
    const startTime = new Date(start.replace(/-/g, "/") + " GMT+0800");
    const endTime = new Date(end.replace(/-/g, "/") + " GMT+0800");
    if (now < startTime || now > endTime) {
      console.log("⏰ 不在顯示期間內，卡片不顯示");
      return;
    }
  }

  const levelData = levels[level];
  if (!levelData) {
    console.error("❌ 等級錯誤，請使用：社區人氣王、社區專家、社區大師");
    return;
  }

  const wrapper = document.querySelector(container);
  if (!wrapper) {
    console.error("❌ 找不到容器：" + container);
    return;
  }

  const html = `
    <div class="expert-card-wrapper expert-platinum" data-aos="flip-left" data-aos-duration="1000">
      <div class="expert-card expert-platinum">
        <div class="expert-pin expert-pin-tl"></div>
        <div class="expert-pin expert-pin-tr"></div>
        <div class="expert-pin expert-pin-bl"></div>
        <div class="expert-pin expert-pin-br"></div>

        <div class="expert-badge"><i class="fas ${levelData.icon}"></i></div>
        <img alt="頭像" class="expert-profile" data-aos="zoom-in-left" data-aos-delay="300" src="${image}" />

        <div class="expert-info">
          <div class="expert-title"><i class="fas ${levelData.icon}"></i>${levelData.title}</div>

          <div class="expert-name-row">
            <div class="expert-name">${name}</div>
            <div class="expert-contact">
              <a class="expert-contact-phone" href="tel:${phone}">
                <i class="fas fa-phone-alt"></i><span>${phone}</span>
              </a>
              <a class="expert-contact-line" href="${line}" target="_blank">
                <i class="fab fa-line"></i><span>LINE</span>
              </a>
            </div>
          </div>

          <div class="expert-footer">證號：${license}｜經紀業：${company}</div>
          <div class="expert-level-mark">${levelData.mark}&nbsp;</div>
        </div>
      </div>
    </div>
  `;

  wrapper.insertAdjacentHTML("beforeend", html);
  const newCard = wrapper.lastElementChild;
  void newCard.offsetHeight;

  // ✅ 智慧處理 AOS：載入、init、refresh
  ensureAOSReady(() => {
    try {
      if (!AOS._inited) {
        AOS.init({ once: true });
      }
      AOS.refresh();
    } catch (err) {
      console.warn("AOS 動畫初始化錯誤", err);
    }
  });
}

// ✅ 等待 AOS 載入完成後執行 callback
function ensureAOSReady(callback, timeout = 5000) {
  const start = Date.now();
  (function check() {
    if (typeof AOS !== "undefined" && typeof AOS.init === "function") {
      callback();
    } else if (Date.now() - start < timeout) {
      setTimeout(check, 50);
    } else {
      console.warn("⚠️ AOS 尚未載入，動畫初始化失敗");
    }
  })();
}

// ✅ 自動偵測 global config 並注入
(function autoInjectCard() {
  const configList = window.expertCardList || (window.expertCardConfig ? [window.expertCardConfig] : []);
  if (!configList.length) return;

  function whenReady(callback) {
    if (document.readyState === "complete" || document.readyState === "interactive") {
      callback();
    } else {
      document.addEventListener("DOMContentLoaded", callback);
    }
  }

  function waitForInject(callback, timeout = 5000) {
    const start = Date.now();
    (function check() {
      if (typeof injectExpertCard === "function") {
        callback();
      } else if (Date.now() - start < timeout) {
        setTimeout(check, 50);
      } else {
        console.warn("❌ injectExpertCard 尚未定義");
      }
    })();
  }

  whenReady(() => {
    waitForInject(() => {
      const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
      // 篩選出在時間範圍內的卡片
      const validCard = configList.find(cfg => {
        const startTime = new Date(cfg.start.replace(/-/g, "/") + " GMT+0800");
        const endTime = new Date(cfg.end.replace(/-/g, "/") + " GMT+0800");
        return now >= startTime && now <= endTime;
      });

      if (validCard) {
        injectExpertCard(validCard);
      } else {
        console.log("⏰ 目前無符合時間的卡片可顯示");
      }
    });
  });
})();

