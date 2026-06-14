"use client";

import { useState } from "react";
import Papa from "papaparse";
import { AppShell } from "@/components/AppShell";
import { useRealtyStore } from "@/lib/clientStore";
import { normalizeToBGrade } from "@/lib/grade";
import { nowIso } from "@/lib/format";
import type { Transaction, TransactionType, UnitGrade } from "@/types/transaction";

export default function TransactionsPage() {
  const store = useRealtyStore();
  const [apartmentId, setApartmentId] = useState("");
  const [transactionType, setTransactionType] = useState<TransactionType>("sale");
  const [price, setPrice] = useState("");
  const [exclusiveArea, setExclusiveArea] = useState("84");
  const [contractDate, setContractDate] = useState(new Date().toISOString().slice(0, 10));
  const [floor, setFloor] = useState("");
  const [grade, setGrade] = useState<UnitGrade>("B");

  function addTransaction() {
    if (!apartmentId || !price) return;
    const numericPrice = Number(price);
    const tx: Transaction = {
      id: `tx_${Date.now()}`,
      apartmentId,
      transactionType,
      exclusiveArea: Number(exclusiveArea),
      price: numericPrice,
      contractDate,
      floor: floor ? Number(floor) : undefined,
      grade,
      adjustedPrice: normalizeToBGrade(numericPrice, grade),
      source: "manual",
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    store.setTransactions([tx, ...store.transactions]);
    setPrice("");
  }

  function uploadCsv(file: File) {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const rows = result.data.map((row) => {
          const apt = store.apartments.find((x) => x.name === row.apartmentName || x.shortName === row.apartmentName);
          const gradeValue = (row.grade || "UNKNOWN") as UnitGrade;
          const numericPrice = Number(row.price);
          return apt ? ({
            id: `tx_${Date.now()}_${Math.random()}`,
            apartmentId: apt.id,
            transactionType: (row.transactionType || "sale") as TransactionType,
            exclusiveArea: Number(row.exclusiveArea || 84),
            price: numericPrice,
            contractDate: row.contractDate || new Date().toISOString().slice(0, 10),
            floor: row.floor ? Number(row.floor) : undefined,
            buildingNo: row.buildingNo,
            direction: row.direction,
            grade: gradeValue,
            adjustedPrice: normalizeToBGrade(numericPrice, gradeValue),
            source: "csv",
            createdAt: nowIso(),
            updatedAt: nowIso()
          } satisfies Transaction) : null;
        }).filter(Boolean) as Transaction[];
        store.setTransactions([...rows, ...store.transactions]);
      }
    });
  }

  return (
    <AppShell>
      <div className="mb-8"><p className="text-sm font-semibold text-blue-600">Transactions</p><h1 className="text-3xl font-black">실거래 입력</h1></div>
      <div className="card p-5">
        <div className="grid gap-3 md:grid-cols-4">
          <select className="input" value={apartmentId} onChange={(e) => setApartmentId(e.target.value)}>
            <option value="">단지 선택</option>
            {store.apartments.map((apt) => <option key={apt.id} value={apt.id}>{apt.name}</option>)}
          </select>
          <select className="input" value={transactionType} onChange={(e) => setTransactionType(e.target.value as TransactionType)}>
            <option value="sale">매매</option><option value="jeonse">전세</option><option value="presale">분양권</option><option value="monthly_rent">월세</option>
          </select>
          <input className="input" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="가격, 만원" />
          <input className="input" value={exclusiveArea} onChange={(e) => setExclusiveArea(e.target.value)} placeholder="전용면적" />
          <input className="input" type="date" value={contractDate} onChange={(e) => setContractDate(e.target.value)} />
          <input className="input" value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="층" />
          <select className="input" value={grade} onChange={(e) => setGrade(e.target.value as UnitGrade)}>
            {(["S", "A", "B", "C", "D", "UNKNOWN"] as UnitGrade[]).map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <button className="btn-primary" onClick={addTransaction}>추가</button>
        </div>
        <div className="mt-4"><input type="file" accept=".csv" onChange={(e) => e.target.files?.[0] && uploadCsv(e.target.files[0])} /></div>
      </div>
      <DataTable transactions={store.transactions} apartmentName={(id) => store.apartments.find((x) => x.id === id)?.name ?? id} />
    </AppShell>
  );
}

function DataTable({ transactions, apartmentName }: { transactions: Transaction[]; apartmentName: (id: string) => string }) {
  return <div className="card mt-6 overflow-hidden"><table className="table w-full"><thead><tr><th>단지</th><th>유형</th><th>가격</th><th>보정가</th><th>면적</th><th>층</th><th>등급</th><th>계약일</th></tr></thead><tbody>{transactions.map((tx) => <tr key={tx.id}><td>{apartmentName(tx.apartmentId)}</td><td>{tx.transactionType}</td><td>{tx.price.toLocaleString()}</td><td>{tx.adjustedPrice?.toLocaleString() ?? "-"}</td><td>{tx.exclusiveArea}</td><td>{tx.floor ?? "-"}</td><td>{tx.grade}</td><td>{tx.contractDate}</td></tr>)}</tbody></table></div>;
}
