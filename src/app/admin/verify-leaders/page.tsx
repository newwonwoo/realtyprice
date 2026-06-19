"use client";

import { useState } from "react";

interface VerifyRow {
  region: string;
  originalName: string;
  originalAddress: string;
  originalHouseholds: number | string;
  matchedName: string;
  matchedAddress: string;
  matchedHouseholds: number | string;
  complexPk: string;
  status: string;
}

function statusColor(status: string) {
  if (status === "일치") return "text-green-700 bg-green-50";
  if (status === "교정필요") return "text-amber-700 bg-amber-50";
  if (status === "매칭실패") return "text-red-700 bg-red-50";
  return "text-slate-500 bg-slate-50";
}

function toCSV(rows: VerifyRow[]): string {
  const headers = [
    "region", "originalName", "originalAddress", "originalHouseholds",
    "matchedName", "matchedAddress", "matchedHouseholds", "complexPk", "status",
  ];
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        r.region, r.originalName, r.originalAddress, r.originalHouseholds,
        r.matchedName, r.matchedAddress, r.matchedHouseholds, r.complexPk, r.status,
      ].map(escape).join(",")
    ),
  ];
  return lines.join("\n");
}

export default function VerifyLeadersPage() {
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [rows, setRows] = useState<VerifyRow[]>([]);
  const [error, setError] = useState("");

  async function run() {
    if (!apiKey.trim()) { setError("API 키를 입력하세요."); return; }
    setError("");
    setRows([]);
    setLoading(true);
    setProgress("API 호출 중… (53개 단지, 약 1분 소요)");

    try {
      const res = await fetch("/api/admin/verify-leaders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceKey: apiKey.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setRows(data.results ?? []);
      setProgress(`완료: ${data.results?.length ?? 0}개 처리`);
    } catch (e) {
      setError((e as Error).message);
      setProgress("");
    } finally {
      setLoading(false);
    }
  }

  function downloadCSV() {
    const csv = toCSV(rows);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leader_verify_result.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const matched = rows.filter((r) => r.status === "일치").length;
  const needFix = rows.filter((r) => r.status === "교정필요").length;
  const failed = rows.filter((r) => r.status === "매칭실패").length;

  return (
    <div className="mx-auto max-w-7xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-slate-800">대장아파트 API 검증</h1>
      <p className="mb-6 text-sm text-slate-500">
        공공데이터포털 한국부동산원 API로 하드코딩된 대장단지 목록의 이름·주소·complexPk를 검증합니다.
      </p>

      <div className="mb-4 flex gap-3">
        <input
          type="password"
          placeholder="공공데이터포털 일반 인증키 (Decoding)"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button
          onClick={run}
          disabled={loading}
          className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "실행 중…" : "검증 실행"}
        </button>
        {rows.length > 0 && (
          <button
            onClick={downloadCSV}
            className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            CSV 다운로드
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {progress && (
        <div className="mb-4 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">{progress}</div>
      )}

      {rows.length > 0 && (
        <div className="mb-4 flex gap-4 text-sm">
          <span className="rounded bg-green-100 px-2 py-1 text-green-700">✅ 일치 {matched}건</span>
          <span className="rounded bg-amber-100 px-2 py-1 text-amber-700">🔧 교정필요 {needFix}건</span>
          <span className="rounded bg-red-100 px-2 py-1 text-red-700">⚠️ 매칭실패 {failed}건</span>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">지역</th>
                <th className="px-3 py-2 text-left">기존 이름</th>
                <th className="px-3 py-2 text-left">API 이름</th>
                <th className="px-3 py-2 text-left">API 주소</th>
                <th className="px-3 py-2 text-right">세대수</th>
                <th className="px-3 py-2 text-left">complexPk</th>
                <th className="px-3 py-2 text-center">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{row.region}</td>
                  <td className="px-3 py-2 font-medium text-slate-800">{row.originalName}</td>
                  <td className={`px-3 py-2 ${row.matchedName && row.matchedName !== row.originalName ? "font-semibold text-amber-700" : "text-slate-700"}`}>
                    {row.matchedName || "—"}
                  </td>
                  <td className="max-w-xs truncate px-3 py-2 text-slate-500" title={row.matchedAddress}>
                    {row.matchedAddress || "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-600">
                    {row.matchedHouseholds !== "" ? row.matchedHouseholds : "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">{row.complexPk || "—"}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusColor(row.status)}`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
