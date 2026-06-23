"use client";

import { AppShell } from "@/components/AppShell";
import { useEffect, useState } from "react";

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

export default function DiagnosticsPage() {
  const [result, setResult] = useState<DiagnosticsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => { run(); }, []);

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
              <li>NAVER_COOKIE 경고 → Vercel 환경변수에 브라우저 Cookie 헤더값 추가</li>
              <li>네이버 API 실패 → NAVER_COOKIE 만료, 브라우저에서 재추출 후 갱신</li>
              <li>공공데이터 API → /settings/api 에서 data.go.kr 키 등록 (브라우저 저장)</li>
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
    </AppShell>
  );
}
