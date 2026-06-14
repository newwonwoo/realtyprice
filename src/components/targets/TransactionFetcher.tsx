"use client";

import { useState } from "react";
import type { Apartment } from "@/types/apartment";
import type { Transaction } from "@/types/transaction";
import { readStorage, STORAGE_KEYS } from "@/lib/storage";
import { findSggCode } from "@/data/regionCodes";
import { nowIso } from "@/lib/format";
import type { MolitTransaction } from "@/app/api/transactions/route";

type Props = {
  apartment: Apartment;
  existingTransactions: Transaction[];
  onImport: (transactions: Transaction[]) => void;
};

function parsePrice(str: string): number {
  return parseInt(str.replace(/,/g, "").trim(), 10) || 0;
}

function toContractDate(tx: MolitTransaction): string {
  const y = tx.dealYear?.trim() ?? "";
  const m = (tx.dealMonth?.trim() ?? "").padStart(2, "0");
  const d = (tx.dealDay?.trim() ?? "1").padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function molitToTransaction(tx: MolitTransaction, apartmentId: string): Transaction {
  const now = nowIso();
  return {
    id: `molit_${apartmentId}_${tx.transactionType}_${tx.dealYear}${tx.dealMonth}${tx.dealDay}_${tx.floor}_${tx.excluUseAr}`,
    apartmentId,
    transactionType: tx.transactionType,
    exclusiveArea: parseFloat(tx.excluUseAr) || 0,
    price: tx.transactionType === "sale" ? parsePrice(tx.dealAmount ?? "") : parsePrice(tx.deposit ?? ""),
    deposit: tx.transactionType !== "sale" ? parsePrice(tx.deposit ?? "") : undefined,
    monthlyRent: tx.transactionType === "monthly_rent" ? parsePrice(tx.monthlyRent ?? "") : undefined,
    contractDate: toContractDate(tx),
    floor: parseInt(tx.floor, 10) || undefined,
    grade: "B",
    source: "molit",
    createdAt: now,
    updatedAt: now,
  };
}

const thisYear = new Date().getFullYear();
const thisMonth = String(new Date().getMonth() + 1).padStart(2, "0");

export function TransactionFetcher({ apartment, existingTransactions, onImport }: Props) {
  const [fromYm, setFromYm] = useState(`${thisYear - 1}${thisMonth}`);
  const [toYm, setToYm] = useState(`${thisYear}${thisMonth}`);
  const [type, setType] = useState<"all" | "sale" | "rent">("all");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [error, setError] = useState("");

  async function fetch() {
    const keys = readStorage<{ provider: string; value: string }[]>(STORAGE_KEYS.apiKeys, []);
    const serviceKey = keys.find((k) => k.provider === "data_go_kr")?.value;

    if (!serviceKey) {
      setError("공공데이터포털 API 키가 없습니다. 설정 > API 키 설정에서 등록하세요.");
      return;
    }

    const lawdCd = findSggCode(apartment.region);
    if (!lawdCd) {
      setError(`지역코드를 찾을 수 없습니다: "${apartment.region}". 아파트 지역 정보를 확인하세요.`);
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const params = new URLSearchParams({
        serviceKey,
        lawdCd,
        aptName: apartment.shortName ?? apartment.name,
        fromYm,
        toYm,
        type,
      });
      const res = await window.fetch(`/api/transactions?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "오류가 발생했습니다."); return; }

      const existingIds = new Set(existingTransactions.map((tx) => tx.id));
      const newTxs: Transaction[] = (json.items as MolitTransaction[])
        .map((item) => molitToTransaction(item, apartment.id))
        .filter((tx) => !existingIds.has(tx.id) && tx.price > 0 && tx.exclusiveArea > 0);

      onImport(newTxs);
      setResult({ imported: newTxs.length, skipped: json.total - newTxs.length });
    } catch (e) {
      setError(`요청 실패: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="font-black text-sm">실거래 자동수집 (국토부)</p>
      <p className="mt-1 text-xs text-slate-500">공공데이터포털 API 키로 국토부 실거래를 자동으로 가져옵니다.</p>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <label className="block">
          <span className="text-xs font-semibold text-slate-600">시작 년월</span>
          <input className="input mt-1" type="text" maxLength={6} placeholder="202401" value={fromYm} onChange={(e) => setFromYm(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-600">종료 년월</span>
          <input className="input mt-1" type="text" maxLength={6} placeholder="202506" value={toYm} onChange={(e) => setToYm(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-600">유형</span>
          <select className="input mt-1" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="all">매매+전월세</option>
            <option value="sale">매매만</option>
            <option value="rent">전월세만</option>
          </select>
        </label>
        <div className="flex items-end">
          <button className="btn-primary w-full" onClick={fetch} disabled={loading}>
            {loading ? "수집 중…" : "수집"}
          </button>
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {result && (
        <p className="mt-2 text-xs font-semibold text-green-700">
          {result.imported}건 신규 저장 완료 {result.skipped > 0 ? `(중복 ${result.skipped}건 제외)` : ""}
        </p>
      )}
    </div>
  );
}
