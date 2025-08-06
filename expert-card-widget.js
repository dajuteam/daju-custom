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

  // ✅ 取得台灣時間（UTC+8）
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" }));

  // ✅ 若有 start/end，進行時間區間檢查
  if (start && end) {
    const startTime = new Date(start.replace(/-/g, "/") + " GMT+0800");
    const endTime = new Date(end.replace(/-/g, "/") + " GMT+0800");

    if (now < startTime || now > endTime) {
      console.log("目前不在顯示期間，卡片不顯示。");
      return;
    }
  }

  const levelData = levels[level];
  if (!levelData) {
    console.error("等級錯誤，請輸入：社區人氣王、社區專家、社區大師");
    return;
  }

  const wrapper = document.querySelector(container);
  if (!wrapper) {
    console.error("找不到容器：" + container);
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

  // ✅ 注入 HTML
  wrapper.insertAdjacentHTML("beforeend", html);

  // ✅ 強制觸發 before 邊框動畫
  const newCard = wrapper.lastElementChild;
  void newCard.offsetHeight;

  // ✅ 若 AOS 有載入，重新啟用動畫
  if (typeof AOS !== "undefined" && typeof AOS.refresh === "function") {
    AOS.refresh();
  }
}
