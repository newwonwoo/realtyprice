"use client";

import { AppShell } from "@/components/AppShell";
import { useRealtyStore } from "@/lib/clientStore";
import type { Transaction } from "@/types/transaction";

export default function TransactionsPage() {
  const store = useRealtyStore();

  return (
    <AppShell>
      <div className="mb-8">
        <p className="text-sm font-semibold text-blue-600">Transactions</p>
        <h1 className="text-3xl font-black">실거래 내역</h1>
        <p className="mt-2 text-slate-600">국토부 실거래는 자동수집됩니다. 동호수 등급(S/A/B/C/D)은 B급 기준 가격으로 환산해 표시합니다.</p>
      </div>

      {!store.targets.length && store.ready && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          대상아파트가 없습니다.{" "}
          <a href="/targets" className="font-semibold underline">대상아파트 추가</a>
          {" "}후 실거래가 자동수집됩니다.
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        실거래는 국토부 공공데이터에서 <span className="font-semibold">자동수집</span>됩니다(매매·전세·분양권). 아래 표는 수집된 내역입니다.
      </div>

      <DataTable transactions={store.transactions} apartmentName={(idValue) => store.apartments.find((item) => item.id === idValue)?.name ?? idValue} />
    </AppShell>
  );
}

function DataTable({ transactions, apartmentName }: { transactions: Transaction[]; apartmentName: (id: string) => string }) {
  return (
    <div className="card mt-6 overflow-hidden">
      <table className="table w-full">
        <thead><tr><th>단지</th><th>유형</th><th>가격</th><th>보정가</th><th>면적</th><th>동/호</th><th>층</th><th>등급</th><th>계약일</th></tr></thead>
        <tbody>
          {transactions.map((tx) => (
            <tr key={tx.id}>
              <td>{apartmentName(tx.apartmentId)}</td><td>{tx.transactionType}</td><td>{tx.price.toLocaleString()}</td><td>{tx.adjustedPrice?.toLocaleString() ?? "-"}</td><td>{tx.exclusiveArea}</td><td>{[tx.buildingNo, tx.unitNo].filter(Boolean).join("/") || "-"}</td><td>{tx.floor ?? "-"}</td><td>{tx.grade}</td><td>{tx.contractDate}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
