// ISOLATED content script — 리얼티프라이스 앱 페이지에서 실행.
// 앱 ↔ 확장 브리지: 앱이 window.postMessage로 대상목록/수집요청을 보내면 background로 전달.
// 앱은 이 스크립트 존재로 확장 설치 여부를 감지한다(REALTY_EXT ready).
(() => {
  // 앱에 "확장 설치됨" 알림 — 앱 버튼 활성화용
  const announce = () => window.postMessage({ source: "REALTY_EXT", kind: "ready" }, "*");
  announce();

  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.source !== "REALTY_APP") return;

    if (d.kind === "ping") { announce(); return; }

    if (d.kind === "targets" && Array.isArray(d.targets)) {
      chrome.runtime.sendMessage({ cmd: "setTargets", targets: d.targets }, () => {});
      return;
    }

    if (d.kind === "collectAll") {
      chrome.runtime.sendMessage({ cmd: "collectAll" }, (res) => {
        window.postMessage({ source: "REALTY_EXT", kind: "collectAllDone", result: res }, "*");
      });
      return;
    }
  });

  // background 진행상황을 앱으로 중계
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.cmd === "progress") {
      window.postMessage({ source: "REALTY_EXT", kind: "progress", ...msg }, "*");
    }
  });
})();
