import { NextResponse } from "next/server";
import { sql, initDb } from "@/lib/db";

type CheckResult = {
  name: string;
  status: "ok" | "warn" | "error";
  message: string;
  detail?: string;
};

async function checkDb(): Promise<CheckResult> {
  try {
    await initDb();
    const r = await sql.query("SELECT COUNT(*) AS cnt FROM apartments");
    return { name: "Vercel Postgres", status: "ok", message: `연결 정상 · apartments ${r.rows[0].cnt}행` };
  } catch (e) {
    return { name: "Vercel Postgres", status: "error", message: "연결 실패", detail: String(e) };
  }
}

async function checkEnvVar(name: string, label: string): Promise<CheckResult> {
  const val = process.env[name];
  if (!val) return { name: label, status: "error", message: `${name} 환경변수 없음` };
  return { name: label, status: "ok", message: `설정됨 (${val.slice(0, 12)}...)` };
}

async function checkNaverApi(): Promise<CheckResult> {
  const cookie = process.env.NAVER_COOKIE ?? "";
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://new.land.naver.com/",
    "Accept": "application/json",
  };
  if (cookie) headers["Cookie"] = cookie;
  try {
    const res = await fetch("https://new.land.naver.com/api/search?query=래미안&pg=1&rs=1&re=3&sm=13&fa=apt", {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const d = await res.json();
      const cnt = (d?.complexes ?? d?.result?.complexes ?? []).length;
      return { name: "네이버 부동산 API", status: "ok", message: `응답 정상 · 검색결과 ${cnt}건` };
    }
    return { name: "네이버 부동산 API", status: "warn", message: `HTTP ${res.status}`, detail: cookie ? "쿠키 만료 가능성" : "NAVER_COOKIE 미설정" };
  } catch (e) {
    return { name: "네이버 부동산 API", status: "error", message: "접속 실패", detail: String(e) };
  }
}

async function checkDataGoKr(): Promise<CheckResult> {
  const key = process.env.DATA_GO_KR_API_KEY;
  if (!key) return { name: "공공데이터 API (data.go.kr)", status: "warn", message: "DATA_GO_KR_API_KEY 환경변수 없음 · 브라우저 localStorage에서 사용 중" };
  try {
    const url = `https://api.odcloud.kr/api/RealEstateLawd/v1/getRealEstateLawd?page=1&perPage=1&serviceKey=${encodeURIComponent(key)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (res.ok) return { name: "공공데이터 API (data.go.kr)", status: "ok", message: "응답 정상" };
    return { name: "공공데이터 API (data.go.kr)", status: "warn", message: `HTTP ${res.status}` };
  } catch (e) {
    return { name: "공공데이터 API (data.go.kr)", status: "error", message: "접속 실패", detail: String(e) };
  }
}

async function checkZigbang(): Promise<CheckResult> {
  try {
    const res = await fetch(
      "https://apis.zigbang.com/v2/search?serviceType=아파트&q=래미안",
      {
        headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json", "Origin": "https://www.zigbang.com", "Referer": "https://www.zigbang.com/" },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (res.ok) {
      const d = await res.json();
      const cnt = (d?.items ?? d?.data ?? []).length;
      return { name: "직방 API", status: "ok", message: `응답 정상 · 검색결과 ${cnt}건` };
    }
    return { name: "직방 API", status: "warn", message: `HTTP ${res.status}` };
  } catch (e) {
    return { name: "직방 API", status: "error", message: "접속 실패", detail: String(e) };
  }
}

async function checkTableCounts(): Promise<CheckResult> {
  try {
    const tables = ["apartments", "comparable_rules", "transactions", "listings", "price_estimates"];
    const counts: string[] = [];
    for (const t of tables) {
      const r = await sql.query(`SELECT COUNT(*) AS cnt FROM ${t}`);
      counts.push(`${t}:${r.rows[0].cnt}`);
    }
    return { name: "DB 데이터 현황", status: "ok", message: counts.join(" · ") };
  } catch (e) {
    return { name: "DB 데이터 현황", status: "error", message: "조회 실패", detail: String(e) };
  }
}

export async function GET() {
  const [db, dbCounts, naver, dataGoKr, zigbang, pgUrl, naverCookie] = await Promise.all([
    checkDb(),
    checkTableCounts(),
    checkNaverApi(),
    checkDataGoKr(),
    checkZigbang(),
    checkEnvVar("POSTGRES_DATABASE_URL", "POSTGRES_DATABASE_URL"),
    process.env.NAVER_COOKIE
      ? Promise.resolve<CheckResult>({ name: "NAVER_COOKIE", status: "ok", message: `설정됨 (${process.env.NAVER_COOKIE.slice(0, 20)}...)` })
      : Promise.resolve<CheckResult>({ name: "NAVER_COOKIE", status: "warn", message: "미설정 · 서버에서 네이버 API 차단될 수 있음" }),
  ]);

  const checks = [db, dbCounts, pgUrl, naverCookie, naver, dataGoKr, zigbang];
  const hasError = checks.some((c) => c.status === "error");
  const hasWarn = checks.some((c) => c.status === "warn");
  const overall = hasError ? "error" : hasWarn ? "warn" : "ok";

  return NextResponse.json({ overall, checks, timestamp: new Date().toISOString() });
}
