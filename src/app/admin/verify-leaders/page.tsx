"use client";

import { useState, useEffect } from "react";

interface Candidate {
  complexPk: string;
  name: string;
  address: string;
  households: number;
  score: number;
}

interface VerifyRow {
  region: string;
  originalName: string;
  originalAddress: string;
  originalHouseholds: number | string;
  existingComplexPk: string;
  candidates: Candidate[];
  status: string;
}

function statusColor(status: string) {
  if (status === "확정됨") return "text-blue-700 bg-blue-50";
  if (status === "강력추천") return "text-green-700 bg-green-50";
  if (status === "후보있음") return "text-amber-700 bg-amber-50";
  if (status === "매칭실패") return "text-red-700 bg-red-50";
  return "text-slate-500 bg-slate-50";
}

// 선택맵: region+originalName → 선택된 후보 (없으면 자동 1위)
function rowKey(r: VerifyRow) {
  return `${r.region}__${r.originalName}`;
}

function toCSV(rows: VerifyRow[], selected: Record<string, string>): string {
  const headers = ["region", "name", "selectedComplexPk", "selectedName", "selectedAddress", "selectedHouseholds", "status"];
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [headers.join(",")];
  for (const r of rows) {
    const key = rowKey(r);
    const pk = selected[key] ?? r.existingComplexPk ?? r.candidates[0]?.complexPk ?? "";
    const cand = r.candidates.find((c) => c.complexPk === pk);
    lines.push(
      [
        r.region,
        r.originalName,
        pk,
        cand?.name ?? "",
        cand?.address ?? "",
        cand?.households ?? "",
        r.status,
      ].map(escape).join(",")
    );
  }
  return lines.join("\n");
}

export default function VerifyLeadersPage() {
  const [apiKey, setApiKey] = useState(() =>
    typeof window !== "undefined" ? (localStorage.getItem("verifyLeadersApiKey") ?? "") : ""
  );
  useEffect(() => {
    if (apiKey) localStorage.setItem("verifyLeadersApiKey", apiKey);
  }, [apiKey]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [rows, setRows] = useState<VerifyRow[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  async function run() {
    if (!apiKey.trim()) { setError("API 키를 입력하세요."); return; }
    setError("");
    setRows([]);
    setSelected({});
    setLoading(true);
    setProgress("API 다중 검색 중… (53개 단지, 2~3분 소요)");

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
      const result: VerifyRow[] = data.results ?? [];
      setRows(result);
      // 자동 선택: 기존 pk 있으면 그것, 없으면 1위 후보
      const init: Record<string, string> = {};
      for (const r of result) {
        const k = rowKey(r);
        init[k] = r.existingComplexPk || r.candidates[0]?.complexPk || "";
      }
      setSelected(init);
      setProgress(`완료: ${result.length}개 처리`);
    } catch (e) {
      setError((e as Error).message);
      setProgress("");
    } finally {
      setLoading(false);
    }
  }

  function downloadCSV() {
    const csv = toCSV(rows, selected);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leader_complexpk_selected.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const confirmed = rows.filter((r) => r.status === "확정됨").length;
  const strong = rows.filter((r) => r.status === "강력추천").length;
  const maybe = rows.filter((r) => r.status === "후보있음").length;
  const failed = rows.filter((r) => r.status === "매칭실패").length;
  const selectedCount = rows.filter((r) => selected[rowKey(r)]).length;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-slate-800">대장아파트 complexPk 검증·선택</h1>
      <p className="mb-2 text-sm text-slate-500">
        다중 검색으로 각 단지 후보를 찾아 보여줍니다. 후보를 직접 골라 검증한 뒤 CSV로 내보내세요.
      </p>
      <p className="mb-6 text-xs text-slate-400">
        💡 풀네임 검색이 0건이면 단지번호·지명 토큰으로 재검색합니다. 점수 80↑=강력추천, 50↑=후보있음.
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
            선택결과 CSV ({selectedCount})
          </button>
        )}
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {progress && <div className="mb-4 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">{progress}</div>}

      {rows.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-3 text-sm">
          <span className="rounded bg-blue-100 px-2 py-1 text-blue-700">🔵 확정됨 {confirmed}</span>
          <span className="rounded bg-green-100 px-2 py-1 text-green-700">✅ 강력추천 {strong}</span>
          <span className="rounded bg-amber-100 px-2 py-1 text-amber-700">🟡 후보있음 {maybe}</span>
          <span className="rounded bg-red-100 px-2 py-1 text-red-700">⚠️ 매칭실패 {failed}</span>
        </div>
      )}

      <div className="space-y-3">
        {rows.map((row) => {
          const key = rowKey(row);
          const sel = selected[key] ?? "";
          return (
            <div key={key} className="rounded-xl border border-slate-200 p-4">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-800">{row.originalName}</span>
                  <span className="ml-2 text-xs text-slate-500">{row.region}</span>
                  {row.existingComplexPk && (
                    <span className="ml-2 font-mono text-xs text-blue-500">기존 pk {row.existingComplexPk}</span>
                  )}
                </div>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusColor(row.status)}`}>
                  {row.status}
                </span>
              </div>
              {row.candidates.length === 0 ? (
                <p className="text-xs text-red-500">API 후보 없음 — 부동산원 사이트에서 수동 확인 필요</p>
              ) : (
                <div className="space-y-1">
                  {row.candidates.map((c) => (
                    <label
                      key={c.complexPk}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                        sel === c.complexPk ? "border-blue-400 bg-blue-50" : "border-slate-100 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name={key}
                        checked={sel === c.complexPk}
                        onChange={() => setSelected((p) => ({ ...p, [key]: c.complexPk }))}
                      />
                      <span className="font-medium text-slate-800">{c.name}</span>
                      <span className="text-xs text-slate-500">{c.address}</span>
                      <span className="ml-auto text-xs text-slate-400">{c.households}세대 · {c.score}점</span>
                      <span className="font-mono text-xs text-slate-400">{c.complexPk}</span>
                    </label>
                  ))}
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-1 text-xs text-slate-400">
                    <input
                      type="radio"
                      name={key}
                      checked={sel === ""}
                      onChange={() => setSelected((p) => ({ ...p, [key]: "" }))}
                    />
                    선택 안 함 (제외)
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
