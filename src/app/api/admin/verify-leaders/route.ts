import { NextRequest, NextResponse } from "next/server";
import { LEADER_APARTMENTS } from "@/lib/leaderApartments";

const API_BASE = "https://api.odcloud.kr/api/AptIdInfoSvc/v1/getAptInfo";

function buildUrl(serviceKey: string, name: string) {
  let key = serviceKey;
  try { key = decodeURIComponent(serviceKey); } catch { /* keep */ }
  return (
    `${API_BASE}?serviceKey=${encodeURIComponent(key)}&page=1&perPage=100` +
    `&cond[COMPLEX_NM1::LIKE]=${encodeURIComponent(name)}&cond[COMPLEX_GB_CD::EQ]=1`
  );
}

interface AptResult {
  complexPk: string;
  name: string;
  address: string;
  households: number;
}

async function searchByName(serviceKey: string, name: string): Promise<AptResult[]> {
  const res = await fetch(buildUrl(serviceKey, name), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data?.data ?? []).map((it: Record<string, unknown>) => ({
    complexPk: String(it["COMPLEX_PK"] ?? ""),
    name: String(it["COMPLEX_NM1"] ?? ""),
    address: String(it["ADRES"] ?? ""),
    households: Number(it["UNIT_CNT"] ?? 0),
  }));
}

function pickBest(entry: typeof LEADER_APARTMENTS[0], results: AptResult[]): AptResult | null {
  const en = entry.name.replace(/\s/g, "");
  const inRegion = results.filter((r) => r.address.includes(entry.region));
  const pool = inRegion.length ? inRegion : results;
  const scored = pool.map((r) => {
    const rn = r.name.replace(/\s/g, "");
    let score = 0;
    if (rn === en) score += 100;
    else if (rn.includes(en) || en.includes(rn)) score += 60;
    if (entry.households && r.households) {
      const ratio = Math.min(entry.households, r.households) / Math.max(entry.households, r.households);
      score += ratio * 20;
    }
    if (r.address.includes(entry.region)) score += 10;
    return { r, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.score >= 50 ? scored[0].r : null;
}

export async function POST(req: NextRequest) {
  const { serviceKey } = await req.json();
  if (!serviceKey) {
    return NextResponse.json({ error: "serviceKey 필요" }, { status: 400 });
  }

  const results = [];

  for (const entry of LEADER_APARTMENTS) {
    await new Promise((r) => setTimeout(r, 150));
    try {
      const apiResults = await searchByName(serviceKey, entry.name);
      const best = pickBest(entry, apiResults);
      if (!best) {
        results.push({
          region: entry.region,
          originalName: entry.name,
          originalAddress: entry.address,
          originalHouseholds: entry.households ?? "",
          matchedName: "",
          matchedAddress: "",
          matchedHouseholds: "",
          complexPk: "",
          status: "매칭실패",
        });
      } else {
        const changed =
          best.name !== entry.name ||
          best.address !== entry.address ||
          best.households !== entry.households;
        results.push({
          region: entry.region,
          originalName: entry.name,
          originalAddress: entry.address,
          originalHouseholds: entry.households ?? "",
          matchedName: best.name,
          matchedAddress: best.address,
          matchedHouseholds: best.households,
          complexPk: best.complexPk,
          status: changed ? "교정필요" : "일치",
        });
      }
    } catch (e) {
      results.push({
        region: entry.region,
        originalName: entry.name,
        originalAddress: entry.address,
        originalHouseholds: entry.households ?? "",
        matchedName: "",
        matchedAddress: "",
        matchedHouseholds: "",
        complexPk: "",
        status: `오류: ${(e as Error).message.slice(0, 80)}`,
      });
    }
  }

  return NextResponse.json({ results });
}
