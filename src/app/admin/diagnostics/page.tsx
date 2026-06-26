"use client";

import { AppShell } from "@/components/AppShell";
import { useEffect, useState } from "react";

type ClientCheck = {
  name: string;
  status: "idle" | "running" | "ok" | "warn" | "error";
  message: string;
  detail?: string;
};

const ZB_HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "ko-KR,ko;q=0.9",
  "Origin": "https://www.zigbang.com",
  "Referer": "https://www.zigbang.com/",
};

async function testZigbangBrowser(): Promise<Omit<ClientCheck, "name">> {
  try {
    const res = await fetch(
      "https://apis.zigbang.com/v2/search?serviceType=아파트&q=래미안",
      { headers: ZB_HEADERS, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) {
      if (res.status === 403 || res.status === 429)
        return { status: "error", message: `차단됨 (HTTP ${res.status}) — 직방이 브라우저 IP를 막고 있습니다.` };
      return { status: "warn", message: `HTTP ${res.status}` };
    }
    const d = await res.json();
    const cnt = (d?.items ?? d?.data ?? []).length;
    return { status: "ok", message: `브라우저 직접 호출 정상 · 결과 ${cnt}건` };
  } catch (err) {
    const msg = String(err);
    if (/failed to fetch|cors|blocked/i.test(msg))
      return { status: "error", message: "CORS 또는 네트워크 차단", detail: msg };
    if (/timeout|aborted/i.test(msg))
      return { status: "error", message: "응답 시간 초과 (8초)", detail: msg };
    return { status: "error", message: "요청 실패", detail: msg };
  }
}

async function testKbBrowser(): Promise<Omit<ClientCheck, "name">> {
  try {
    const res = await fetch("/api/kb-price?aptName=래미안&area=84", { signal: AbortSignal.timeout(12000) });
    const d = await res.json().catch(() => ({})) as Record<string, unknown>;
    const code = String(d?.reasonCode ?? "");
    if (code === "ok") {
      const cnt = (d?.prices as unknown[])?.length ?? 0;
      return { status: "ok", message: `Vercel→KB 정상 · ${cnt}개 면적 시세 조회됨` };
    }
    if (code === "blocked")
      return { status: "error", message: "Vercel 서버 IP가 KB부동산에 차단됨 (403/429)", detail: String(d?.reason ?? "") };
    if (code === "upstream_error")
      return { status: "warn", message: "KB 서버 오류 (5xx)", detail: String(d?.reason ?? "") };
    if (code === "complex_not_found")
      return { status: "warn", message: "단지 검색 결과 없음 (API는 작동 중)", detail: String(d?.reason ?? "") };
    return { status: "warn", message: `reasonCode: ${code}`, detail: String(d?.reason ?? "") };
  } catch (err) {
    const msg = String(err);
    return { status: "error", message: "요청 실패", detail: msg };
  }
}

type CheckResult = {
  name: string;
  status: "ok" | "warn" | "error";
  message: string;
  detail?: string;
};

type DiagnosticsResult = {
  overall: "ok" | "warn" | "error";
  checks: CheckResult[];
  timestamp: string;
};

const STATUS_COLOR = {
  ok: "bg-emerald-100 text-emerald-800 border-emerald-200",
  warn: "bg-amber-100 text-amber-800 border-amber-200",
  error: "bg-red-100 text-red-800 border-red-200",
};

const STATUS_ICON = {
  ok: "✓",
  warn: "⚠",
  error: "✕",
};

const STATUS_BG = {
  ok: "border-emerald-200",
  warn: "border-amber-200",
  error: "border-red-200",
};

const CLIENT_CHECK_NAMES: Record<string, string> = {
  zb: "직방 API (브라우저 직접)",
  kb: "KB부동산 API (Vercel 서버 경유)",
};

export default function DiagnosticsPage() {
  const [result, setResult] = useState<DiagnosticsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientChecks, setClientChecks] = useState<Record<string, ClientCheck>>({
    zb: { name: CLIENT_CHECK_NAMES.zb, status: "idle", message: "" },
    kb: { name: CLIENT_CHECK_NAMES.kb, status: "idle", message: "" },
  });
  const [clientRunning, setClientRunning] = useState(false);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/diagnostics");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResult(await res.json());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function runClientChecks() {
    setClientRunning(true);
    setClientChecks({
      zb: { name: CLIENT_CHECK_NAMES.zb, status: "running", message: "테스트 중…" },
      kb: { name: CLIENT_CHECK_NAMES.kb, status: "running", message: "테스트 중…" },
    });
    const [zb, kb] = await Promise.all([testZigbangBrowser(), testKbBrowser()]);
    setClientChecks({
      zb: { name: CLIENT_CHECK_NAMES.zb, ...zb },
      kb: { name: CLIENT_CHECK_NAMES.kb, ...kb },
    });
    setClientRunning(false);
  }

  useEffect(() => { run(); runClientChecks(); }, []);

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-600">Admin</p>
          <h1 className="text-2xl font-black">시스템 진단</h1>
          <p className="mt-1 text-sm text-slate-500">DB · 환경변수 · 외부 API 연결 상태를 실시간 점검합니다.</p>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "점검 중…" : "다시 점검"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          진단 API 호출 실패: {error}
        </div>
      )}

      {result && (
        <>
          <div className={`mb-6 rounded-xl border-2 p-4 ${STATUS_BG[result.overall]}`}>
            <div className="flex items-center gap-3">
              <span className={`flex h-10 w-10 items-center justify-center rounded-full text-lg font-black ${STATUS_COLOR[result.overall]}`}>
                {STATUS_ICON[result.overall]}
              </span>
              <div>
                <p className="font-black text-lg">
                  {result.overall === "ok" ? "전체 정상" : result.overall === "warn" ? "일부 경고" : "문제 발견"}
                </p>
                <p className="text-xs text-slate-500">
                  {new Date(result.timestamp).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} 기준
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {result.checks.map((check, i) => (
              <div key={i} className={`rounded-lg border p-4 ${STATUS_BG[check.status]}`}>
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black ${STATUS_COLOR[check.status]}`}>
                    {STATUS_ICON[check.status]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{check.name}</p>
                    <p className="text-sm text-slate-700 mt-0.5">{check.message}</p>
                    {check.detail && (
                      <pre className="mt-2 rounded bg-slate-900 p-2 text-xs text-slate-100 overflow-x-auto whitespace-pre-wrap break-all">
                        {check.detail}
                      </pre>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-lg bg-slate-50 p-4 text-xs text-slate-500">
            <p className="font-semibold mb-1">문제 해결 가이드</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>DB 연결 실패 → Vercel Storage 탭에서 Postgres 프로젝트 연결 확인</li>
              <li>공공데이터 API → /settings/api 에서 data.go.kr 키 등록 (브라우저 저장)</li>
              <li>직방/KB API 실패 → Vercel 서버 IP 차단 여부 확인 (외부 크롤링 방어)</li>
            </ul>
          </div>
        </>
      )}

      {loading && !result && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-slate-100 animate-pulse" />
          ))}
        </div>
      )}

      {/* 매물수집 API 브라우저 진단 */}
      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-black text-lg">매물수집 API 진단 (브라우저)</h2>
            <p className="text-xs text-slate-500 mt-0.5">직방은 브라우저에서 직접, KB는 Vercel 서버를 경유해 실제 호출합니다.</p>
          </div>
          <button
            onClick={runClientChecks}
            disabled={clientRunning}
            className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {clientRunning ? "테스트 중…" : "재테스트"}
          </button>
        </div>
        <div className="space-y-3">
          {Object.values(clientChecks).map((check) => {
            const s = check.status === "idle" || check.status === "running" ? "warn" : check.status;
            return (
              <div key={check.name} className={`rounded-lg border p-4 ${STATUS_BG[s]}`}>
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black ${STATUS_COLOR[s]}`}>
                    {check.status === "running" ? "…" : STATUS_ICON[s]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{check.name}</p>
                    <p className="text-sm text-slate-700 mt-0.5">{check.message || (check.status === "idle" ? "대기 중" : "")}</p>
                    {check.detail && (
                      <pre className="mt-2 rounded bg-slate-900 p-2 text-xs text-slate-100 overflow-x-auto whitespace-pre-wrap break-all">
                        {check.detail}
                      </pre>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 space-y-1">
          <p className="font-semibold">차단 시 해결 방법</p>
          <p><span className="font-semibold">직방 차단:</span> 직방이 클라우드·데이터센터 IP를 CORS로 차단하는 경우 로컬 환경에서도 작동 여부 확인 필요. 현재 직방은 브라우저에서 직접 호출하므로 사용자 IP로 요청됩니다.</p>
          <p><span className="font-semibold">KB 차단:</span> Vercel 서버 IP가 KB부동산에 막힌 경우 Vercel Edge Function 또는 별도 프록시 서버 필요. KB 시세는 /api/kb-price 라우트를 경유합니다.</p>
        </div>
      </div>
    </AppShell>
  );
}
