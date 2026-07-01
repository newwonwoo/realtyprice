"use client";

import { useState } from "react";
import type { Apartment } from "@/types/apartment";
import type { Transaction } from "@/types/transaction";
import { fetchTransactions } from "@/components/targets/TransactionFetcher";
import type { ApartmentWithRole } from "@/components/listings/ListingFetcher";

type AptEntry = {
  apartment: Apartment;
  label: "대상" | "대장" | "비교";
  existingCount: number;
};

// 호가 수집기(ListingFetcher)와 동일한 수집대상 리스트를 공유한다.
const ROLE_TO_LABEL = { target: "대상", leader: "대장", comparable: "비교" } as const;

type Props = {
  apartments: ApartmentWithRole[];
  existingTransactions: Transaction[];
  onImport: (txs: Transaction[]) => void;
};

const thisYear = new Date().getFullYear();
const thisMonth = String(new Date().getMonth() + 1).padStart(2, "0");

const LABEL_BADGE: Record<string, string> = {
  대상: "bg-blue-100 text-blue-700",
  대장: "bg-violet-100 text-violet-700",
  비교: "bg-slate-100 text-slate-600",
};

export function UnifiedTransactionFetcher({ apartments, existingTransactions, onImport }: Props) {
  const [fromYm, setFromYm] = useState(`${thisYear - 1}${thisMonth}`);
  const [toYm] = useState(`${thisYear}${thisMonth}`);

  function applyPreset(months: number) {
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    setFromYm(`${y}${m}`);
  }
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; current?: string } | null>(null);
  const [results, setResults] = useState<{ name: string; label: string; imported: number; error?: string }[]>([]);

  const entries: AptEntry[] = apartments.map(({ apartment, role }) => ({
    apartment,
    label: ROLE_TO_LABEL[role],
    existingCount: existingTransactions.filter((t) => t.apartmentId === apartment.id).length,
  }));

  const totalExisting = existingTransactions.length;

  async function fetchAll() {
    setLoading(true);
    setProgress({ done: 0, total: entries.length });
    setResults([]);

    const allNew: Transaction[] = [];
    const log: { name: string; label: string; imported: number; error?: string }[] = [];

    for (let i = 0; i < entries.length; i++) {
      const { apartment, label } = entries[i];
      setProgress({ done: i, total: entries.length, current: apartment.shortName ?? apartment.name });
      try {
        const existing = [...existingTransactions, ...allNew];
        const { newTxs, error } = await fetchTransactions(apartment, existing, fromYm, toYm, "all");
        if (error) {
          log.push({ name: apartment.shortName ?? apartment.name, label, imported: 0, error });
        } else {
          allNew.push(...newTxs);
          log.push({ name: apartment.shortName ?? apartment.name, label, imported: newTxs.length });
        }
      } catch (e) {
        log.push({ name: apartment.shortName ?? apartment.name, label, imported: 0, error: String(e) });
      }
      setProgress({ done: i + 1, total: entries.length });
    }

    if (allNew.length > 0) onImport(allNew);
    setResults(log);
    setLoading(false);
    setProgress(null);
  }

  const totalImported = results.reduce((s, r) => s + r.imported, 0);

  return (
    <div className="space-y-4 p-5">
      {/* 단지 목록 미리보기 */}
      <div className="flex flex-wrap gap-2">
        {entries.map(({ apartment, label, existingCount }) => (
          <div key={apartment.id} className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold">
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${LABEL_BADGE[label]}`}>{label}</span>
            <span className="text-slate-700">{apartment.shortName ?? apartment.name}</span>
            {existingCount > 0 && <span className="text-slate-400">{existingCount}건</span>}
          </div>
        ))}
      </div>

      {/* 기간 프리셋 + 버튼 */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1">
          {[3, 6, 12, 24, 36].map((m) => (
            <button
              key={m}
              onClick={() => applyPreset(m)}
              className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${fromYm === (() => { const d = new Date(); d.setMonth(d.getMonth() - m); return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}`; })() ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
            >
              {m >= 12 ? `${m / 12}년` : `${m}개월`}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-400 ml-1">{fromYm} ~ {toYm}</span>
        <button className="btn-primary ml-auto" onClick={fetchAll} disabled={loading}>
          {loading ? `수집 중 ${progress?.done}/${progress?.total}…` : `전체 수집 (${entries.length}개 단지)`}
        </button>
      </div>

      {/* 진행 바 */}
      {loading && progress && (
        <div className="space-y-1">
          <div className="h-2 w-full rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full bg-blue-500 transition-all duration-300"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          </div>
          {progress.current && <p className="text-xs text-slate-500">수집 중: {progress.current}</p>}
        </div>
      )}

      {/* 결과 */}
      {results.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1">
          <p className="text-xs font-black text-slate-700">
            신규 {totalImported}건 저장 · 누적 {totalExisting + totalImported}건
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
            {results.map((r) => (
              <p key={r.name} className={`text-xs ${r.error ? "text-red-500" : "text-slate-500"}`}>
                <span className={`font-semibold mr-1 rounded px-1 text-[10px] ${LABEL_BADGE[r.label]}`}>{r.label}</span>
                {r.name}: {r.error ? `오류` : `${r.imported}건`}
              </p>
            ))}
          </div>
          {results.some((r) => r.error) && (
            <div className="mt-2 text-xs text-red-500 space-y-0.5">
              {results.filter((r) => r.error).map((r) => (
                <p key={r.name}>{r.name}: {r.error}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
