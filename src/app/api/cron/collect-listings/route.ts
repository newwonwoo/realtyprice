import { NextRequest, NextResponse } from "next/server";
import { sql, initDb } from "@/lib/db";
import { normalizeToBGrade } from "@/lib/grade";
import { generateSearchCandidates } from "@/lib/aptNameSearch";
import { findSggCode } from "@/data/regionCodes";
import type { Listing, InventorySignal } from "@/types/listing";
import type { Transaction } from "@/types/transaction";

// Vercel Cron 인증 — CRON_SECRET env로 보호
function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // 미설정이면 개발 환경으로 간주
  return auth === `Bearer ${secret}`;
}

const ZB_BASE = "https://apis.zigbang.com";
const ZB_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Origin": "https://www.zigbang.com",
  "Referer": "https://www.zigbang.com/",
};
const KB_BASE = "https://api.kbland.kr";
const KB_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Referer": "https://kbland.kr/",
  "Origin": "https://kbland.kr",
  "webService": "1",
};

async function zbFetch(url: string): Promise<{ ok: boolean; status: number; data: unknown }> {
  try {
    const res = await fetch(url, { headers: ZB_HEADERS, signal: AbortSignal.timeout(10000) });
    let data: unknown = null;
    try { data = await res.json(); } catch { data = null; }
    return { ok: res.ok, status: res.status, data };
  } catch { return { ok: false, status: 0, data: null }; }
}

async function kbFetch(url: string): Promise<{ ok: boolean; data: unknown }> {
  try {
    const res = await fetch(url, { headers: KB_HEADERS, signal: AbortSignal.timeout(10000) });
    let data: unknown = null;
    try { data = await res.json(); } catch { data = null; }
    return { ok: res.ok, data };
  } catch { return { ok: false, data: null }; }
}

function zbParseComplexes(data: unknown): { complexId: string; name: string }[] {
  const items = ((data as Record<string, unknown>)?.items ?? (data as Record<string, unknown>)?.data ?? []) as Record<string, unknown>[];
  return items
    .filter((x) => x.itemType === "complex" || x.type === "complex" || x.complex_id || x.complexId)
    .map((x) => ({ complexId: String(x.complex_id ?? x.complexId ?? x.id ?? ""), name: String(x.name ?? x.complexName ?? "") }))
    .filter((c) => c.complexId);
}

type ZbItem = { itemId: string; tradeType: string; price: number; area: number; floor: number; description: string };
function zbParseListings(data: unknown, tradeType: string): ZbItem[] {
  const items = ((data as Record<string, unknown>)?.items ?? (data as Record<string, unknown>)?.data ?? []) as Record<string, unknown>[];
  return items.map((a) => ({
    itemId: String(a.itemId ?? a.id ?? ""),
    tradeType,
    price: Number(a.price ?? 0),
    area: Number(a.area ?? 0),
    floor: Number(a.floor ?? 0),
    description: String(a.description ?? ""),
  }));
}

type AptRow = { id: string; name: string; data: Record<string, unknown> };

async function collectOne(apt: AptRow, today: string): Promise<{ listings: Listing[]; log: string }> {
  const listings: Listing[] = [];
  const aptName: string = (apt.data.zigbangSearchQuery as string) || apt.name;
  const region: string = (apt.data.region as string) || "";
  const defaultArea: number = (apt.data.defaultArea as number) || 0;

  // ── 직방 ──
  const candidates = generateSearchCandidates(aptName, region);
  let zbComplexId = "";
  for (const candidate of candidates) {
    const zbQ = encodeURIComponent(candidate).replace(/%2D/gi, "-");
    const s = await zbFetch(`${ZB_BASE}/v2/search?serviceType=아파트&q=${zbQ}`);
    if (!s.ok) break;
    const list = zbParseComplexes(s.data);
    if (list.length >= 1) { zbComplexId = list[0].complexId; break; }
  }

  if (zbComplexId) {
    const [saleR, jeonseR] = await Promise.all([
      zbFetch(`${ZB_BASE}/v2/complex/${zbComplexId}/items?tradeType=${encodeURIComponent("매매")}&serviceType=아파트`),
      zbFetch(`${ZB_BASE}/v2/complex/${zbComplexId}/items?tradeType=${encodeURIComponent("전세")}&serviceType=아파트`),
    ]);
    const sale = saleR.ok ? zbParseListings(saleR.data, "매매") : [];
    const jeonse = jeonseR.ok ? zbParseListings(jeonseR.data, "전세") : [];
    for (const l of [...sale, ...jeonse]) {
      const type = l.tradeType === "매매" ? "sale" : "jeonse";
      listings.push({ id: `listing_zb_${apt.id}_${l.itemId}`, apartmentId: apt.id, listingType: type, exclusiveArea: l.area, askingPrice: l.price, floor: l.floor || undefined, grade: "B", adjustedAskingPrice: normalizeToBGrade(l.price, "B"), source: "manual", listingKey: `zb_${apt.id}_${l.itemId}`, capturedAt: today, status: "active", memo: l.description || undefined });
    }
  }

  // ── KB 시세 ──
  const kbQuery: string = (apt.data.kbSearchQuery as string) || apt.name;
  const kbCandidates = generateSearchCandidates(kbQuery, region);
  kbLoop: for (const candidate of kbCandidates) {
    const s = await kbFetch(`${KB_BASE}/land-complex/serch/intgraSerch?검색설정명=SRC_NTOTAL&검색키워드=${encodeURIComponent(candidate)}&출력갯수=50&페이지설정값=1`);
    if (!s.ok) break;
    const items = ((s.data as Record<string, unknown>)?.dataBody as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    const rows = ((items?.data as Record<string, unknown>)?.HSCM as Record<string, unknown>)?.data as Record<string, unknown>[] ?? [];
    const complexList = rows.map((x) => ({ complexNo: String(x.COMPLEX_NO ?? "") })).filter((c) => c.complexNo);
    if (!complexList.length) continue;

    const complexNo = complexList[0].complexNo;
    const aR = await kbFetch(`${KB_BASE}/land-complex/complex/mpriByType?단지기본일련번호=${complexNo}`);
    if (!aR.ok) break;
    const aItems = ((aR.data as Record<string, unknown>)?.dataBody as Record<string, unknown>)?.data as Record<string, unknown>[] ?? [];
    const allAreas = aItems.map((x) => ({ areaNo: String(x.면적일련번호 ?? ""), exclusiveArea: Number(x.전용면적 ?? 0), hasPrice: String(x.시세제공여부 ?? "") === "1" })).filter((a) => a.areaNo);
    const priced = allAreas.filter((a) => a.hasPrice);
    const candidateAreas = priced.length ? priced : allAreas;
    const selected = defaultArea ? [candidateAreas.reduce((b, a) => Math.abs(a.exclusiveArea - defaultArea) < Math.abs(b.exclusiveArea - defaultArea) ? a : b)] : candidateAreas;

    for (const area of selected) {
      const pR = await kbFetch(`${KB_BASE}/land-price/price/BasePrcInfoNew?단지기본일련번호=${complexNo}&면적일련번호=${area.areaNo}`);
      if (!pR.ok) continue;
      const series = ((pR.data as Record<string, unknown>)?.dataBody as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
      const r = (series?.시세 as Record<string, unknown>[]) ?? [];
      if (!r.length) continue;
      const latest = r[0];
      const saleGeneral = Number(latest.매매일반거래가 ?? 0);
      const jeonseGeneral = Number(latest.전세일반거래가 ?? 0);
      const baseDate = String(latest.시세기준년월일 ?? latest.기준년월일 ?? "");
      if (saleGeneral > 0) listings.push({ id: `listing_kb_${apt.id}_${area.areaNo}_sale`, apartmentId: apt.id, listingType: "sale", exclusiveArea: area.exclusiveArea, askingPrice: saleGeneral, grade: "B", adjustedAskingPrice: normalizeToBGrade(saleGeneral, "B"), source: "kb", listingKey: `kb_${apt.id}_${area.areaNo}_sale_${today}`, capturedAt: today, status: "active", memo: `KB시세 ${baseDate}` });
      if (jeonseGeneral > 0) listings.push({ id: `listing_kb_${apt.id}_${area.areaNo}_jeonse`, apartmentId: apt.id, listingType: "jeonse", exclusiveArea: area.exclusiveArea, askingPrice: jeonseGeneral, grade: "B", adjustedAskingPrice: normalizeToBGrade(jeonseGeneral, "B"), source: "kb", listingKey: `kb_${apt.id}_${area.areaNo}_jeonse_${today}`, capturedAt: today, status: "active", memo: `KB전세시세 ${baseDate}` });
    }
    break kbLoop;
  }

  return { listings, log: `${apt.name}: 직방${zbComplexId ? "✓" : "✗"} KB${listings.some((l) => l.source === "kb") ? "✓" : "✗"} (${listings.length}건)` };
}

function calcInventorySignal(aptId: string, today: string, todayListings: Listing[], prevListings: Listing[]): InventorySignal {
  const todaySale = todayListings.filter((l) => l.listingType === "sale" && l.source !== "kb");
  const prevSale = prevListings.filter((l) => l.listingType === "sale" && l.source !== "kb");
  const prevKeys = new Set(prevSale.map((l) => l.listingKey));
  const todayKeys = new Set(todaySale.map((l) => l.listingKey));
  const disappeared = prevSale.filter((l) => !todayKeys.has(l.listingKey)).length;
  const newOnes = todaySale.filter((l) => !prevKeys.has(l.listingKey)).length;
  const prices = todaySale.map((l) => l.askingPrice).filter((p) => p > 0).sort((a, b) => a - b);
  const avg = prices.length ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length) : 0;
  const median = prices.length ? prices[Math.floor(prices.length / 2)] : 0;
  const bottom = prices[0] ?? 0;
  const absorptionRate = prevSale.length > 0 ? Math.round((disappeared / prevSale.length) * 100) : 0;
  const lowThr = avg * 0.95;
  const lowPrice = todaySale.filter((l) => l.askingPrice < lowThr).length;
  const lowPricePrev = prevSale.filter((l) => l.askingPrice < lowThr).length;
  const lowPriceDisappeared = Math.max(0, lowPricePrev - todaySale.filter((l) => l.askingPrice < lowThr && prevKeys.has(l.listingKey!)).length);
  const lowPriceAbsorptionRate = lowPricePrev > 0 ? Math.round((lowPriceDisappeared / lowPricePrev) * 100) : 0;
  const signalScore = Math.min(100, absorptionRate + lowPriceAbsorptionRate);
  const conclusion: InventorySignal["conclusion"] = signalScore >= 30 ? "strong_up" : signalScore >= 15 ? "up" : signalScore >= 5 ? "neutral" : "down";
  const now = new Date().toISOString();
  return { id: `inv_${aptId}_${today}`, apartmentId: aptId, signalDate: today, totalListingCount: todaySale.length, newListingCount: newOnes, disappearedListingCount: disappeared, lowPriceListingCount: lowPrice, lowPriceDisappearedCount: lowPriceDisappeared, absorptionRate, lowPriceAbsorptionRate, bottomPrice: bottom, avgAskingPrice: avg, medianAskingPrice: median, signalScore, conclusion, createdAt: now };
}

// ── 국토부 실거래 수집 ──
const SALE_API = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev";
const RENT_API = "https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent";

function buildMonthRange(months = 6): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return result;
}

async function fetchMolitPage(url: string, params: URLSearchParams): Promise<Record<string, unknown>[]> {
  try {
    const res = await fetch(`${url}?${params.toString()}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const data = await res.json();
    const items = data?.response?.body?.items?.item;
    if (!items) return [];
    return Array.isArray(items) ? items : [items];
  } catch { return []; }
}

async function collectTransactions(apts: AptRow[], serviceKey: string, today: string): Promise<{ newTxs: Transaction[]; log: string }> {
  const allTx: Transaction[] = [];
  const months = buildMonthRange(3); // 최근 3개월

  for (const apt of apts) {
    const lawdCd = findSggCode(apt.data.region as string || "");
    if (!lawdCd) continue;
    const aptName = apt.name;

    for (const ym of months) {
      const baseParams = new URLSearchParams({ serviceKey, LAWD_CD: lawdCd, DEAL_YMD: ym, numOfRows: "100", pageNo: "1" });

      // 매매
      const saleItems = await fetchMolitPage(SALE_API, baseParams);
      for (const x of saleItems) {
        if (!String(x.aptNm ?? "").includes(aptName.slice(0, 4))) continue;
        const price = Number(String(x.dealAmount ?? "").replace(/,/g, ""));
        const cd = `${x.dealYear}-${String(x.dealMonth).padStart(2, "0")}-${String(x.dealDay).padStart(2, "0")}`;
        const id = `tx_molit_${apt.id}_sale_${cd}_${x.floor}_${price}`;
        allTx.push({ id, apartmentId: apt.id, transactionType: "sale", exclusiveArea: Number(x.excluUseAr ?? 0), price, contractDate: cd, floor: Number(x.floor ?? 0) || undefined, source: "molit", createdAt: today, updatedAt: today });
      }

      // 전세
      const rentParams = new URLSearchParams({ ...Object.fromEntries(baseParams), });
      const rentItems = await fetchMolitPage(RENT_API, rentParams);
      for (const x of rentItems) {
        if (!String(x.aptNm ?? "").includes(aptName.slice(0, 4))) continue;
        const deposit = Number(String(x.deposit ?? "").replace(/,/g, ""));
        const rent = Number(String(x.monthlyRent ?? "0").replace(/,/g, ""));
        const cd = `${x.dealYear}-${String(x.dealMonth).padStart(2, "0")}-${String(x.dealDay).padStart(2, "0")}`;
        const type = rent > 0 ? "monthly_rent" : "jeonse";
        const id = `tx_molit_${apt.id}_${type}_${cd}_${x.floor}_${deposit}`;
        allTx.push({ id, apartmentId: apt.id, transactionType: type, exclusiveArea: Number(x.excluUseAr ?? 0), price: deposit, deposit, monthlyRent: rent || undefined, contractDate: cd, floor: Number(x.floor ?? 0) || undefined, source: "molit", createdAt: today, updatedAt: today });
      }
    }
  }

  // 중복 제거 후 저장
  const existingRes = await sql.query("SELECT id FROM transactions WHERE apartment_id = ANY($1)", [apts.map((a) => a.id)]);
  const existingIds = new Set(existingRes.rows.map((r: { id: string }) => r.id));
  const newTxs = allTx.filter((t) => !existingIds.has(t.id));
  for (const t of newTxs) {
    await sql.query(
      "INSERT INTO transactions (id, apartment_id, contract_date, data) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING",
      [t.id, t.apartmentId, t.contractDate, JSON.stringify(t)]
    );
  }
  return { newTxs, log: `실거래 ${newTxs.length}건 신규 저장` };
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await initDb();
  const today = new Date().toISOString().slice(0, 10);

  // DB에서 모든 단지 조회
  const aptResult = await sql.query("SELECT id, data->>'name' as name, data FROM apartments");
  const apts: AptRow[] = aptResult.rows.map((r: { id: string; name: string; data: unknown }) => ({
    id: r.id,
    name: r.name,
    data: typeof r.data === "string" ? JSON.parse(r.data) : (r.data as Record<string, unknown>),
  }));

  // 오늘 이전 마지막 직방 매물 스냅샷 (소진율 계산용)
  const prevResult = await sql.query(
    "SELECT DISTINCT ON (apartment_id, data->>'listingKey') data FROM listings WHERE data->>'capturedAt' < $1 AND data->>'source' != 'kb' ORDER BY apartment_id, data->>'listingKey', data->>'capturedAt' DESC",
    [today]
  );
  const prevListings: Listing[] = prevResult.rows.map((r: { data: unknown }) =>
    typeof r.data === "string" ? JSON.parse(r.data) : (r.data as Listing)
  );

  const logs: string[] = [];
  const allNewListings: Listing[] = [];

  for (const apt of apts) {
    const { listings, log } = await collectOne(apt, today);
    logs.push(log);
    allNewListings.push(...listings);
  }

  // 기존 오늘치 키 조회 (중복 제거)
  const existingResult = await sql.query(
    "SELECT data->>'listingKey' as key FROM listings WHERE data->>'capturedAt' = $1",
    [today]
  );
  const existingKeys = new Set(existingResult.rows.map((r: { key: string }) => r.key));
  const newOnes = allNewListings.filter((l) => !existingKeys.has(l.listingKey ?? ""));

  // 매물 저장
  for (const l of newOnes) {
    await sql.query(
      "INSERT INTO listings (id, apartment_id, data) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data",
      [l.id, l.apartmentId, JSON.stringify(l)]
    );
  }

  // InventorySignal 계산·저장
  const signals: InventorySignal[] = [];
  for (const apt of apts) {
    const todayL = allNewListings.filter((l) => l.apartmentId === apt.id);
    const prevL = prevListings.filter((l) => l.apartmentId === apt.id);
    if (!todayL.filter((l) => l.source !== "kb").length) continue;
    const sig = calcInventorySignal(apt.id, today, todayL, prevL);
    signals.push(sig);
    await sql.query(
      "INSERT INTO inventory_signals (id, apartment_id, data) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data",
      [sig.id, sig.apartmentId, JSON.stringify(sig)]
    );
  }

  // 국토부 실거래 수집 (MOLIT_SERVICE_KEY 환경변수 필요)
  let txLog = "실거래: MOLIT_SERVICE_KEY 미설정 — 건너뜀";
  const molitKey = process.env.MOLIT_SERVICE_KEY;
  if (molitKey) {
    const txResult = await collectTransactions(apts, molitKey, today);
    txLog = txResult.log;
    logs.push(txLog);
  }

  return NextResponse.json({ ok: true, date: today, collected: newOnes.length, signals: signals.length, txLog, logs });
}
