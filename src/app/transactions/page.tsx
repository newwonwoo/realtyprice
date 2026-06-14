"use client";

import { useState } from "react";
import Papa from "papaparse";
import { AppShell } from "@/components/AppShell";
import { useRealtyStore } from "@/lib/clientStore";
import { normalizeToBGrade } from "@/lib/grade";
import { nowIso } from "@/lib/format";
import type { Transaction, TransactionType, UnitGrade } from "@/types/transaction";

const grades: UnitGrade[] = ["S", "A", "B", "C", "D", "UNKNOWN"];

export default function TransactionsPage() {
  const store = useRealtyStore();
  const [apartmentId, setApartmentId] = useState("");
  const [transactionType, setTransactionType] = useState<TransactionType>("sale");
  const [price, setPrice] = useState("");
  const [exclusiveArea, setExclusiveArea] = useState("84");
  const [contractDate, setContractDate] = useState(new Date().toISOString().slice(0, 10));
  const [floor, setFloor] = useState("");
  const [buildingNo, setBuildingNo] = useState("");
  const [unitNo, setUnitNo] = useState("");
  const [direction, setDirection] = useState("");
  const [grade, setGrade] = useState<UnitGrade>("B");
  const [message, setMessage] = useState("");

  function addTransaction() {
    if (!apartmentId || !price || Number.isNaN(Number(price))) {
      setMessage("단지와 숫자 가격을 입력하세요.");
      return;
    }
    const numericPrice = Number(price);
    const tx: Transaction = {
      id: `tx_${Date.now()}`,
      apartmentId,
      transactionType,
      exclusiveArea: Number(exclusiveArea || 84),
      price: numericPrice,
      contractDate,
      floor: floor ? Number(floor) : undefined,
      buildingNo: buildingNo || undefined,
      unitNo: unitNo || undefined,
      direction: direction || undefined,
      grade,
      adjustedPrice: normalizeToBGrade(numericPrice, grade),
      source: "manual",
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    store.setTransactions([tx, ...store.transactions]);
    setPrice("");
    setMessage("실거래를 추가했습니다.");
  }

  function uploadCsv(file: File) {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const rows = result.data.map((row) => {
          const apartment = store.apartments.find((item) => item.name === row.apartmentName || item.shortName === row.apartmentName || item.id === row.apartmentId);
          const gradeValue = grades.includes(row.grade as UnitGrade) ? (row.grade as UnitGrade) : "UNKNOWN";
          const numericPrice = Number(row.price);
          return apartment && numericPrice ? ({
            id: `tx_${Date.now()}_${Math.random()}`,
            apartmentId: apartment.id,
            transactionType: (row.transactionType || "sale") as TransactionType,
            exclusiveArea: Number(row.exclusiveArea || 84),
            price: numericPrice,
            contractDate: row.contractDate || new Date().toISOString().slice(0, 10),
            floor: row.floor ? Number(row.floor) : undefined,
            buildingNo: row.buildingNo || undefined,
            unitNo: row.unitNo || undefined,
            direction: row.direction || undefined,
            grade: gradeValue,
            gradeReason: row.gradeReason || undefined,
            adjustedPrice: normalizeToBGrade(numericPrice, gradeValue),
            source: "csv",
            createdAt: nowIso(),
            updatedAt: nowIso()
          } satisfies Transaction) : null;
        }).filter(Boolean) as Transaction[];
        store.setTransactions([...rows, ...store.transactions]);
        setMessage(`${rows.length}건을 업로드했습니다.`);
      }
    });
  }

  return (
    <AppShell>
      <div className="mb-8">
        <p className="text-sm font-semibold text-blue-600">Transactions</p>
        <h1 className="text-3xl font-black">실거래 입력</h1>
        <p className="mt-2 text-slate-600">동호수 등급은 S/A/B/C/D를 B급 기준 가격으로 환산합니다.</p>
      </div>

      <div className="card p-5">
        <div className="grid gap-3 md:grid-cols-4">
          <select className="input" value={apartmentId} onChange={(event) => setApartmentId(event.target.value)}>
            <option value="">단지 선택</option>
            {store.apartments.map((apartment) => <option key={apartment.id} value={apartment.id}>{apartment.name}</option>)}
          </select>
          <select className="input" value={transactionType} onChange={(event) => setTransactionType(event.target.value as TransactionType)}>
            <option value="sale">매매</option><option value="jeonse">전세</option><option value="presale">분양권</option><option value="monthly_rent">월세</option>
          </select>
          <input className="input" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="가격, 만원" />
          <input className="input" value={exclusiveArea} onChange={(event) => setExclusiveArea(event.target.value)} placeholder="전용면적" />
          <input className="input" type="date" value={contractDate} onChange={(event) => setContractDate(event.target.value)} />
          <input className="input" value={floor} onChange={(event) => setFloor(event.target.value)} placeholder="층" />
          <input className="input" value={buildingNo} onChange={(event) => setBuildingNo(event.target.value)} placeholder="동" />
          <input className="input" value={unitNo} onChange={(event) => setUnitNo(event.target.value)} placeholder="호수" />
          <input className="input" value={direction} onChange={(event) => setDirection(event.target.value)} placeholder="향" />
          <select className="input" value={grade} onChange={(event) => setGrade(event.target.value as UnitGrade)}>
            {grades.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <button className="btn-primary" onClick={addTransaction}>추가</button>
        </div>
        <div className="mt-4 flex flex-col gap-2 text-sm text-slate-600">
          <input type="file" accept=".csv" onChange={(event) => event.target.files?.[0] && uploadCsv(event.target.files[0])} />
          <p>CSV 컬럼: apartmentName 또는 apartmentId, transactionType, price, exclusiveArea, contractDate, floor, buildingNo, unitNo, direction, grade</p>
          {message && <p className="font-semibold text-blue-700">{message}</p>}
        </div>
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
