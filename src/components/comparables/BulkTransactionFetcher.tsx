"use client";

import { useState } from "react";
import type { Apartment } from "@/types/apartment";
import type { Transaction } from "@/types/transaction";
import { fetchTransactions } from "@/components/targets/TransactionFetcher";
import { readStorage, STORAGE_KEYS } from "@/lib/storage";
import { findSggCode } from "@/data/regionCodes";

type Props = {
  apartments: Apartment[];
  existingTransactions: Transaction[];
  onImport: (transactions: Transaction[]) => void;
};

const thisYear = new Date().getFullYear();
const thisMonth = String(new Date().getMonth() + 1).padStart(2, "0");

export function BulkTransactionFetcher({ apartments, existingTransactions, onImport }: Props) {
  const [fromYm, setFromYm] = useState(`${thisYear - 1}${thisMonth}`);
  const [toYm, setToYm] = useState(`${thisYear}${thisMonth}`);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<{ name: string; imported: number; error?: string }[]>([]);
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagTarget, setDiagTarget] = useState<string>("");
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagResult, setDiagResult] = useState<string>("");

  async function fetchAll() {
    setLoading(true);
    setProgress({ done: 0, total: apartments.length });
    setResults([]);

    const allNew: Transaction[] = [];
    const log: { name: string; imported: number; error?: string }[] = [];

    for (let i = 0; i < apartments.length; i++) {
      const apt = apartments[i];
      try {
        const existing = [...existingTransactions, ...allNew];
        const { newTxs, error } = await fetchTransactions(apt, existing, fromYm, toYm, "all");
        if (error) {
          log.push({ name: apt.shortName ?? apt.name, imported: 0, error });
        } else {
          allNew.push(...newTxs);
          log.push({ name: apt.shortName ?? apt.name, imported: newTxs.length });
        }
      } catch (e) {
        log.push({ name: apt.shortName ?? apt.name, imported: 0, error: String(e) });
      }
      setProgress({ done: i + 1, total: apartments.length });
    }

    if (allNew.length > 0) onImport(allNew);
    setResults(log);
    setLoading(false);
  }

  async function runDiag() {
    setDiagLoading(true);
    setDiagResult("");
    const apt = apartments.find((a) => (a.shortName ?? a.name) === diagTarget) ?? apartments[0];
    if (!apt) { setDiagResult("단지 없음"); setDiagLoading(false); return; }

    try {
      const keys = readStorage<{ provider: string; value: string }[]>(STORAGE_KEYS.apiKeys, []);
      const serviceKey = keys.find((k) => k.provider === "data_go_kr")?.value;
      if (!serviceKey) { setDiagResult("API 키 없음"); setDiagLoading(false); return; }

      const lawdCd = findSggCode(apt.region);
      const lines: string[] = [
        `단지: ${apt.name}`,
        `shortName: ${apt.shortName ?? "(없음)"}`,
        `region: ${apt.region}`,
        `lawdCd: ${lawdCd ?? "❌ 코드 없음 — regionCodes에 없는 지역"}`,
        `fromYm: ${fromYm} / toYm: ${toYm}`,
        "",
      ];

      if (!lawdCd) {
        setDiagResult(lines.join("\n"));
        setDiagLoading(false);
        return;
      }

      const params = new URLSearchParams({
        serviceKey,
        lawdCd,
        aptName: apt.shortName ?? apt.name,
        fromYm,
        toYm: fromYm, // 진단은 시작월 1개월만
        type: "sale",
      });

      const res = await window.fetch(`/api/transactions?${params.toString()}`);
      const raw = await res.text();

      lines.push(`HTTP: ${res.status}`);
      lines.push("");
      try {
        const json = JSON.parse(raw);
        lines.push(`items 수: ${json.items?.length ?? 0}`);
        if (json.error) lines.push(`error: ${json.error}`);
        if (json.items?.length > 0) {
          lines.push("");
          lines.push("첫 번째 item 필드 타입 진단:");
          const first = json.items[0];
          for (const [k, v] of Object.entries(first)) {
            lines.push(`  ${k}: ${typeof v} = ${JSON.stringify(v)}`);
          }
        }
      } catch {
        lines.push("raw response:");
        lines.push(raw.slice(0, 2000));
      }

      setDiagResult(lines.join("\n"));
    } catch (e) {
      setDiagResult(`진단 실패: ${String(e)}`);
    } finally {
      setDiagLoading(false);
    }
  }

  if (apartments.length === 0) return null;

  const totalImported = results.reduce((s, r) => s + r.imported, 0);

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <p className="text-sm font-black">비교단지 실거래 일괄수집</p>
          <p className="text-xs text-slate-500">선택된 {apartments.length}개 단지 실거래를 한 번에 수집합니다.</p>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <input className="input w-28" type="text" maxLength={6} placeholder="202401" value={fromYm} onChange={(e) => setFromYm(e.target.value)} />
          <span className="text-xs text-slate-400">~</span>
          <input className="input w-28" type="text" maxLength={6} placeholder="202506" value={toYm} onChange={(e) => setToYm(e.target.value)} />
          <button className="btn-primary whitespace-nowrap" onClick={fetchAll} disabled={loading}>
            {loading ? `수집 중 ${progress?.done}/${progress?.total}…` : "일괄 수집"}
          </button>
        </div>
      </div>

      {loading && progress && (
        <div>
          <div className="h-1.5 w-full rounded-full bg-slate-200">
            <div
              className="h-1.5 rounded-full bg-blue-500 transition-all"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-bold text-green-700">총 {totalImported}건 신규 저장</p>
          {results.map((r) => (
            <p key={r.name} className={`text-xs ${r.error ? "text-red-500" : "text-slate-500"}`}>
              {r.name}: {r.error ? `오류 — ${r.error}` : `${r.imported}건`}
            </p>
          ))}
        </div>
      )}

      {/* 진단 패널 */}
      <details className="rounded-lg border border-slate-200 bg-slate-50" onToggle={(e) => setDiagOpen((e.target as HTMLDetailsElement).open)}>
        <summary className="cursor-pointer px-4 py-2 text-xs font-semibold text-slate-500 select-none">
          🔍 API 진단 {diagOpen ? "▲" : "▼"}
        </summary>
        <div className="border-t border-slate-200 px-4 py-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <select
              className="input text-xs flex-1"
              value={diagTarget}
              onChange={(e) => setDiagTarget(e.target.value)}
            >
              {apartments.map((a) => (
                <option key={a.id} value={a.shortName ?? a.name}>{a.shortName ?? a.name}</option>
              ))}
            </select>
            <button className="btn-secondary text-xs whitespace-nowrap" onClick={runDiag} disabled={diagLoading}>
              {diagLoading ? "진단 중…" : "진단 실행"}
            </button>
          </div>
          <p className="text-xs text-slate-400">시작 년월 1개월치 매매 데이터를 직접 조회하고 API 응답 구조를 출력합니다.</p>
          {diagResult && (
            <pre className="mt-2 rounded bg-slate-900 p-3 text-xs text-green-300 overflow-x-auto whitespace-pre-wrap break-all">
              {diagResult}
            </pre>
          )}
        </div>
      </details>
    </div>
  );
}
