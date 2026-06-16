"use client";

import { useState } from "react";
import type { Apartment } from "@/types/apartment";
import type { Transaction } from "@/types/transaction";
import { fetchTransactions } from "@/components/targets/TransactionFetcher";

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

  if (apartments.length === 0) return null;

  const totalImported = results.reduce((s, r) => s + r.imported, 0);

  return (
    <div className="card p-5">
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
        <div className="mt-3">
          <div className="h-1.5 w-full rounded-full bg-slate-200">
            <div
              className="h-1.5 rounded-full bg-blue-500 transition-all"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-3 space-y-1">
          <p className="text-xs font-bold text-green-700">총 {totalImported}건 신규 저장</p>
          {results.map((r) => (
            <p key={r.name} className={`text-xs ${r.error ? "text-red-500" : "text-slate-500"}`}>
              {r.name}: {r.error ? `오류 — ${r.error}` : `${r.imported}건`}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
