// MAIN world 주입 스크립트 — 네이버 페이지 컨텍스트에서 실행.
// (1) 페이지가 자기 요청에 붙이는 Authorization Bearer 토큰을 가로채 보관.
// (2) content script의 collect 요청을 받아 그 토큰으로 /api/articles를 same-origin 수집(CORS 없음).
// content script(ISOLATED)와는 window.postMessage로만 통신한다.
(() => {
  if (window.__RP_INJECTED__) return;
  window.__RP_INJECTED__ = true;

  let token = null;

  const OF = window.fetch;
  window.fetch = function (input, init) {
    try {
      const h = (init && init.headers) || {};
      const auth = h.authorization || h.Authorization || (h.get && h.get("authorization"));
      if (auth && /bearer/i.test(auth)) { token = auth; notifyToken(); }
    } catch (e) {}
    return OF.apply(this, arguments);
  };
  const OX = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    if (/^authorization$/i.test(k) && /bearer/i.test(v)) { token = v; notifyToken(); }
    return OX.apply(this, arguments);
  };

  function notifyToken() {
    window.postMessage({ source: "RP_PAGE", kind: "token", hasToken: !!token }, "*");
  }

  function areaOf(a) { // 전용면적 추출(area2 표준 → areaName 폴백)
    const d = Number(a.area2 || a.exclusiveArea || a.spc2 || 0);
    if (d > 0) return d;
    const nums = (String(a.areaName || "").match(/\d+(\.\d+)?/g) || []).map(Number).filter((n) => n >= 20 && n <= 400);
    return nums.length >= 2 ? Math.min.apply(null, nums) : (nums[0] || 0);
  }

  async function collect(complexNo, targetArea, areaTol) {
    if (!token) throw new Error("네이버 인증토큰 미확보 — 매물목록을 한 번 스크롤하거나 매매탭을 클릭하세요.");
    const ta = targetArea || 84, tol = areaTol || 6;
    const RET = "APT%3AABYG%3AJGC%3APRE"; // APT:ABYG:JGC:PRE
    const BASEQ = "&tag=%3A%3A%3A%3A%3A%3A%3A%3A&rentPriceMin=0&rentPriceMax=900000000&priceMin=0&priceMax=900000000&areaMin=0&areaMax=900000000&showArticle=false&sameAddressGroup=false&priceType=RETAIL&order=prc";
    const all = [];
    const seen = new Set();
    // 매매(A1)·전세(B1) 각각 확실히 수집 — 빈 tradeType가 전체를 반환한다는 보장이 없어 명시 순회.
    for (const tradeType of ["A1", "B1"]) {
      for (let page = 1; page <= 15; page++) {
        const url = "https://new.land.naver.com/api/articles/complex/" + complexNo +
          "?realEstateType=" + RET + "&tradeType=" + tradeType + BASEQ + "&page=" + page;
        const res = await OF(url, { headers: { authorization: token }, credentials: "include" });
        if (!res.ok) throw new Error("네이버 응답 HTTP " + res.status + (res.status === 429 ? " (요청제한)" : ""));
        const j = await res.json();
        const list = j.articleList || [];
        for (const a of list) {
          const area2 = areaOf(a);
          if (!area2 || Math.abs(area2 - ta) > tol) continue;
          const key = (a.articleNo || a.articleName + "_" + area2 + "_" + a.floorInfo) + "_" + tradeType;
          if (seen.has(key)) continue;
          seen.add(key);
          all.push(a);
        }
        if (!list.length || j.isMoreData === false) break;
        await new Promise((r) => setTimeout(r, 400 + Math.random() * 400));
      }
    }
    return all;
  }

  window.addEventListener("message", async (ev) => {
    const d = ev.data;
    if (!d || d.source !== "RP_EXT") return;
    if (d.cmd === "ping") { notifyToken(); return; }
    if (d.cmd === "collect") {
      try {
        const articles = await collect(d.complexNo, d.targetArea, d.areaTol);
        window.postMessage({ source: "RP_PAGE", kind: "result", reqId: d.reqId, ok: true, articles }, "*");
      } catch (e) {
        window.postMessage({ source: "RP_PAGE", kind: "result", reqId: d.reqId, ok: false, error: String(e && e.message || e) }, "*");
      }
    }
  });

  notifyToken();
})();
