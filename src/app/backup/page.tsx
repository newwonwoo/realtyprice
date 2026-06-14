"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { defaultModelWeights } from "@/lib/seed";
import { readStorage, STORAGE_KEYS, writeStorage } from "@/lib/storage";
import type { BackupData } from "@/types/model";

export default function BackupPage() {
  const [message, setMessage] = useState("");

  function exportJson() {
    const data: BackupData = {
      version: "0.1.0",
      exportedAt: new Date().toISOString(),
      apiKeysExcluded: true,
      apartments: readStorage(STORAGE_KEYS.apartments, []),
      comparableRules: readStorage(STORAGE_KEYS.comparableRules, []),
      comparableApartments: readStorage(STORAGE_KEYS.comparableApartments, []),
      transactions: readStorage(STORAGE_KEYS.transactions, []),
      listings: readStorage(STORAGE_KEYS.listings, []),
      inventorySignals: readStorage(STORAGE_KEYS.inventorySignals, []),
      priceEstimates: readStorage(STORAGE_KEYS.priceEstimates, []),
      modelSettings: readStorage(STORAGE_KEYS.modelSettings, defaultModelWeights)
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `realtyprice-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson(file: File) {
    file.text().then((raw) => {
      const data = JSON.parse(raw) as BackupData;
      writeStorage(STORAGE_KEYS.apartments, data.apartments ?? []);
      writeStorage(STORAGE_KEYS.comparableRules, data.comparableRules ?? []);
      writeStorage(STORAGE_KEYS.comparableApartments, data.comparableApartments ?? []);
      writeStorage(STORAGE_KEYS.transactions, data.transactions ?? []);
      writeStorage(STORAGE_KEYS.listings, data.listings ?? []);
      writeStorage(STORAGE_KEYS.inventorySignals, data.inventorySignals ?? []);
      writeStorage(STORAGE_KEYS.priceEstimates, data.priceEstimates ?? []);
      writeStorage(STORAGE_KEYS.modelSettings, data.modelSettings ?? defaultModelWeights);
      setMessage("복원 완료. 새로고침하면 반영됩니다.");
    }).catch(() => setMessage("복원 실패"));
  }

  return (
    <AppShell>
      <div className="mb-8"><p className="text-sm font-semibold text-blue-600">Backup</p><h1 className="text-3xl font-black">백업/복원</h1><p className="mt-2 text-slate-600">API 키는 백업에 포함하지 않습니다.</p></div>
      <div className="card p-5">
        <div className="flex flex-wrap gap-3">
          <button className="btn-primary" onClick={exportJson}>전체 데이터 JSON 내보내기</button>
          <input type="file" accept=".json" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
        </div>
        {message && <p className="mt-4 text-sm font-semibold text-blue-700">{message}</p>}
      </div>
    </AppShell>
  );
}
