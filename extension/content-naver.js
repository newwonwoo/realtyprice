// ISOLATED content script — new.land.naver.com 에서 실행.
// injected.js(MAIN)를 주입해 토큰캡처+수집을 맡기고, UI 패널을 띄워
// 사용자가 "앱으로 전송"을 누르면 결과를 background로 넘겨 앱 DB에 저장한다.
(() => {
  // 1) MAIN world 주입
  const s = document.createElement("script");
  s.src = chrome.runtime.getURL("injected.js");
  s.onload = () => s.remove();
  (document.head || document.documentElement).appendChild(s);

  const complexNo = (location.pathname.match(/complexes\/(\d+)/) || [])[1];
  let hasToken = false;
  const pending = new Map();

  window.addEventListener("message", (ev) => {
    const d = ev.data;
    if (!d || d.source !== "RP_PAGE") return;
    if (d.kind === "token") { hasToken = d.hasToken; updateStatus(); }
    if (d.kind === "result" && pending.has(d.reqId)) {
      const { resolve, reject } = pending.get(d.reqId);
      pending.delete(d.reqId);
      d.ok ? resolve(d.articles) : reject(new Error(d.error));
    }
  });

  function collectViaPage(targetArea) {
    return new Promise((resolve, reject) => {
      const reqId = "r" + Date.now() + Math.random();
      pending.set(reqId, { resolve, reject });
      window.postMessage({ source: "RP_EXT", cmd: "collect", complexNo, targetArea, reqId }, "*");
      setTimeout(() => { if (pending.has(reqId)) { pending.delete(reqId); reject(new Error("타임아웃")); } }, 40000);
    });
  }

  // 배치 수집(background가 백그라운드 탭에서 호출) — 이 탭의 단지를 수집해 반환.
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.cmd === "collectTab" && complexNo) {
      collectViaPage(msg.targetArea || 84)
        .then((articles) => sendResponse({ ok: true, articles }))
        .catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
      return true; // async
    }
  });

  if (!complexNo) return; // 단지 상세가 아니면 패널 미표시

  // 2) UI 패널
  const panel = document.createElement("div");
  panel.style.cssText =
    "position:fixed;top:12px;right:12px;z-index:2147483647;width:320px;background:#fff;border:1px solid #ccc;" +
    "border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.25);font:12px/1.5 -apple-system,sans-serif;color:#222;padding:12px";
  panel.innerHTML =
    '<b>리얼티 실호가 수집기</b>' +
    '<div id="rp-st" style="color:#666;margin:6px 0">준비 중…</div>' +
    '<select id="rp-sel" style="width:100%;padding:6px;margin-bottom:6px"></select>' +
    '<button id="rp-send" style="width:100%;padding:8px;background:#03c75a;color:#fff;border:0;border-radius:6px;font-weight:bold;cursor:pointer">이 단지 84㎡ 호가 앱으로 전송</button>' +
    '<div id="rp-res" style="margin-top:6px;color:#0a7"></div>';
  document.body.appendChild(panel);
  const $ = (id) => panel.querySelector(id);

  function updateStatus() {
    $("#rp-st").textContent = hasToken
      ? "토큰 확보 ✓ · 단지 " + complexNo
      : "토큰 대기 — 매물목록 스크롤/매매탭 클릭";
  }
  updateStatus();

  // 대상 리스트 로드(앱에서 동기화됨)
  chrome.runtime.sendMessage({ cmd: "getTargets" }, (res) => {
    const targets = (res && res.targets) || [];
    const sel = $("#rp-sel");
    if (!targets.length) {
      sel.innerHTML = '<option value="">앱에서 대상 목록을 못 받음 — 앱을 한 번 열어주세요</option>';
      return;
    }
    // 페이지 제목 기반 이름으로 best match 추정
    const title = (document.title || "").replace(/\s/g, "");
    sel.innerHTML = targets
      .map((t) => `<option value="${t.apartmentId}">${t.name} (${t.region || ""})</option>`)
      .join("");
    const best = targets.find((t) => title.includes((t.name || "").replace(/\s/g, "")));
    if (best) sel.value = best.apartmentId;
  });

  $("#rp-send").onclick = async () => {
    const apartmentId = $("#rp-sel").value;
    if (!apartmentId) { $("#rp-res").textContent = "대상 단지를 선택하세요."; return; }
    $("#rp-res").style.color = "#666";
    $("#rp-res").textContent = "수집 중…";
    try {
      const articles = await collectViaPage(84);
      chrome.runtime.sendMessage(
        { cmd: "ingest", apartmentId, complexNo, articles },
        (res) => {
          if (res && res.ok) {
            $("#rp-res").style.color = "#0a7";
            const moiTxt = res.moi ? ` · MOI ${res.moi}개월` : "";
            $("#rp-res").textContent = `저장됨: 매매 ${res.sale}건 · 전세 ${res.jeonse}건 · 활성매물 ${res.activeListings ?? res.sale}${moiTxt}`;
          } else {
            $("#rp-res").style.color = "#c00";
            $("#rp-res").textContent = "저장 실패: " + ((res && res.error) || "앱 설정(팝업)에서 앱 주소 확인");
          }
        }
      );
    } catch (e) {
      $("#rp-res").style.color = "#c00";
      $("#rp-res").textContent = String(e.message || e);
    }
  };
})();
