"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { readStorage, STORAGE_KEYS, writeStorage } from "@/lib/storage";

const providers = [
  ["data_go_kr", "공공데이터포털 API Key"],
  ["molit", "국토부 실거래 API Key"],
  ["telegram_bot_token", "Telegram Bot Token"],
  ["telegram_chat_id", "Telegram Chat ID"]
] as const;

type ClientApiKey = {
  provider: string;
  value: string;
  storedAt: string;
  lastTestedAt?: string;
  lastSuccessAt?: string;
};

export default function ApiSettingsPage() {
  const [apiKeys, setApiKeys] = useState<ClientApiKey[]>(() => readStorage<ClientApiKey[]>(STORAGE_KEYS.apiKeys, []));
  const [draft, setDraft] = useState<Record<string, string>>({});

  function save(provider: string) {
    const value = draft[provider];
    if (!value) return;
    const next = [...apiKeys.filter((x) => x.provider !== provider), { provider, value, storedAt: new Date().toISOString() }];
    setApiKeys(next);
    writeStorage(STORAGE_KEYS.apiKeys, next);
    setDraft({ ...draft, [provider]: "" });
  }

  function remove(provider: string) {
    const next = apiKeys.filter((x) => x.provider !== provider);
    setApiKeys(next);
    writeStorage(STORAGE_KEYS.apiKeys, next);
  }

  return (
    <AppShell>
      <div className="mb-8"><p className="text-sm font-semibold text-blue-600">Settings</p><h1 className="text-3xl font-black">API 키 설정</h1><p className="mt-2 text-slate-600">API 키는 현재 브라우저 localStorage에만 저장됩니다.</p></div>
      <div className="card p-5">
        <div className="space-y-5">
          {providers.map(([provider, label]) => {
            const saved = apiKeys.find((x) => x.provider === provider);
            return (
              <div key={provider} className="grid gap-3 rounded-lg border border-slate-200 p-4 md:grid-cols-[1fr_1.2fr_auto_auto] md:items-center">
                <div><p className="font-bold">{label}</p><p className="text-xs text-slate-500">{saved ? `저장됨: ${new Date(saved.storedAt).toLocaleString()}` : "미저장"}</p></div>
                <input className="input" type="password" value={draft[provider] ?? ""} onChange={(e) => setDraft({ ...draft, [provider]: e.target.value })} placeholder={saved ? "********" : "키 입력"} />
                <button className="btn-primary" onClick={() => save(provider)}>저장</button>
                <button className="btn-secondary" onClick={() => remove(provider)}>삭제</button>
              </div>
            );
          })}
        </div>
        <p className="mt-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">프론트 저장 방식은 공개 서비스용 보안 저장소가 아닙니다. 공개 서비스 전환 시 백엔드 암호화 저장 또는 프록시 방식으로 전환하세요.</p>
      </div>
    </AppShell>
  );
}
