const $ = (id) => document.getElementById(id);
const st = (m) => { $("st").textContent = m; };

chrome.runtime.sendMessage({ cmd: "getCfg" }, (c) => {
  if (!c) return;
  $("origin").value = c.appOrigin || "";
  $("secret").value = c.ingestSecret || "";
  const n = Object.keys(c.complexMap || {}).length;
  st(`대상 매핑 ${n}개 · 대상목록 ${(c.targets || []).length}개`);
});

$("save").onclick = () => {
  chrome.runtime.sendMessage(
    { cmd: "setCfg", appOrigin: $("origin").value.trim(), ingestSecret: $("secret").value.trim() },
    () => st("저장됨")
  );
};

$("all").onclick = () => {
  st("배치 수집 중… (백그라운드 탭이 잠깐씩 열립니다)");
  chrome.runtime.sendMessage({ cmd: "collectAll" }, (res) => {
    if (!res) return st("응답 없음");
    if (!res.ok) return st("실패: " + res.error);
    st(`완료 · ${res.total}개 단지 · 저장 ${res.saved}건`);
  });
};

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.cmd === "progress") {
    const line = `${msg.complexNo}: ${msg.ok ? "저장 " + (msg.saved || 0) : "실패 " + (msg.error || "")}`;
    $("st").textContent = (line + "\n" + $("st").textContent).split("\n").slice(0, 8).join("\n");
  }
});
