// 서비스 워커 — 설정/대상 보관, 앱으로 ingest POST, (실험적) 대상 리스트 배치 수집.
const DEFAULTS = { appOrigin: "", ingestSecret: "", targets: [], complexMap: {} };

async function getCfg() {
  const c = await chrome.storage.local.get(DEFAULTS);
  return { ...DEFAULTS, ...c };
}

async function ingest(apartmentId, complexNo, articles) {
  const cfg = await getCfg();
  if (!cfg.appOrigin) return { ok: false, error: "팝업에서 앱 주소(Origin)를 설정하세요" };
  // complexNo↔apartmentId 매핑 저장(배치 수집에 재사용)
  const complexMap = { ...cfg.complexMap, [apartmentId]: complexNo };
  await chrome.storage.local.set({ complexMap });
  const headers = { "Content-Type": "application/json" };
  if (cfg.ingestSecret) headers["Authorization"] = "Bearer " + cfg.ingestSecret;
  try {
    const res = await fetch(cfg.appOrigin.replace(/\/$/, "") + "/api/listings/ingest", {
      method: "POST",
      headers,
      body: JSON.stringify({ apartmentId, complexNo, articles }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: j.error || ("HTTP " + res.status) };
    return { ok: true, sale: j.sale, jeonse: j.jeonse, saved: j.saved };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

// 배치 수집(실험적): 저장된 complexMap 단지들을 백그라운드 탭으로 순회.
async function collectAll(sendProgress) {
  const cfg = await getCfg();
  const entries = Object.entries(cfg.complexMap);
  if (!entries.length) return { ok: false, error: "먼저 각 단지 네이버 페이지에서 1회 수집해 매핑을 만들어야 합니다." };
  let done = 0, saved = 0;
  for (const [apartmentId, complexNo] of entries) {
    let tab;
    try {
      tab = await chrome.tabs.create({ url: "https://new.land.naver.com/complexes/" + complexNo, active: false });
      const articles = await collectInTab(tab.id);
      const r = await ingest(apartmentId, complexNo, articles);
      if (r.ok) saved += r.saved || 0;
      sendProgress && sendProgress({ apartmentId, complexNo, ok: r.ok, error: r.error, saved: r.saved });
    } catch (e) {
      sendProgress && sendProgress({ apartmentId, complexNo, ok: false, error: String(e && e.message || e) });
    } finally {
      if (tab) { try { await chrome.tabs.remove(tab.id); } catch (e) {} }
      done++;
      await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
    }
  }
  return { ok: true, total: entries.length, saved };
}

// 백그라운드 탭의 content-naver에 수집 요청. 토큰 생성 위해 로드 후 잠시 대기.
function collectInTab(tabId) {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const attempt = () => {
      tries++;
      chrome.tabs.sendMessage(tabId, { cmd: "collectTab", targetArea: 84 }, (res) => {
        if (chrome.runtime.lastError || !res) {
          if (tries > 12) return reject(new Error("탭 준비 실패/토큰 미확보"));
          return setTimeout(attempt, 1500);
        }
        if (res.ok) return resolve(res.articles);
        if (/토큰/.test(res.error || "") && tries <= 12) return setTimeout(attempt, 1500);
        reject(new Error(res.error || "수집 실패"));
      });
    };
    setTimeout(attempt, 2500);
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg.cmd === "getTargets") { const c = await getCfg(); sendResponse({ targets: c.targets }); return; }
    if (msg.cmd === "setTargets") { await chrome.storage.local.set({ targets: msg.targets || [] }); sendResponse({ ok: true }); return; }
    if (msg.cmd === "getCfg") { sendResponse(await getCfg()); return; }
    if (msg.cmd === "setCfg") { await chrome.storage.local.set({ appOrigin: msg.appOrigin || "", ingestSecret: msg.ingestSecret || "" }); sendResponse({ ok: true }); return; }
    if (msg.cmd === "ingest") { sendResponse(await ingest(msg.apartmentId, msg.complexNo, msg.articles)); return; }
    if (msg.cmd === "collectAll") {
      const r = await collectAll((p) => { try { chrome.runtime.sendMessage({ cmd: "progress", ...p }); } catch (e) {} });
      sendResponse(r); return;
    }
  })();
  return true; // async sendResponse
});
