"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { readStorage, STORAGE_KEYS, writeStorage } from "@/lib/storage";

const providers = [
  ["data_go_kr", "공공데이터포털 API Key", "data.go.kr에서 발급. 아파트 단지 검색·실거래 수집에 모두 사용됩니다."],
  ["vworld", "VWorld 지오코더 인증키", "vworld.kr에서 발급 (무료, 일 4만건). 단지 주소 → GPS 좌표 변환에 사용 (비교단지 1km 인접 필터). ⚠️ VWorld 약관상 좌표는 실시간 사용만 가능하며 저장하지 않습니다."],
  ["telegram_bot_token", "Telegram Bot Token", "알림 전송용 (선택)"],
  ["telegram_chat_id", "Telegram Chat ID", "알림 전송용 (선택)"]
] as const;

type ClientApiKey = {
  provider: string;
  value: string;
  storedAt: string;
};

// 서버 환경변수에 키가 있는지 확인
type EnvKeyStatus = Record<string, boolean>;

export default function ApiSettingsPage() {
  const [apiKeys, setApiKeys] = useState<ClientApiKey[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [envStatus, setEnvStatus] = useState<EnvKeyStatus>({});

  useEffect(() => {
    setApiKeys(readStorage<ClientApiKey[]>(STORAGE_KEYS.apiKeys, []));
    // Vercel 환경변수에 키가 설정됐는지 확인
    fetch("/api/env-keys")
      .then((r) => r.json())
      .then((data) => setEnvStatus(data as EnvKeyStatus))
      .catch(() => {});
  }, []);

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
      <div className="mb-8">
        <p className="text-sm font-semibold text-blue-600">Settings</p>
        <h1 className="text-3xl font-black">API 키 설정</h1>
        <p className="mt-2 text-slate-600">API 키는 브라우저 localStorage에 저장됩니다. Vercel 환경변수에 설정된 경우 자동으로 사용됩니다.</p>
      </div>
      <div className="card p-5">
        <div className="space-y-5">
          {providers.map(([provider, label, desc]) => {
            const saved = apiKeys.find((x) => x.provider === provider);
            const envSet = envStatus[provider];
            return (
              <div key={provider} className="grid gap-3 rounded-lg border border-slate-200 p-4 md:grid-cols-[1fr_1.2fr_auto_auto] md:items-center">
                <div>
                  <p className="font-bold">{label}</p>
                  <p className="text-xs text-slate-400">{desc}</p>
                  <p className="text-xs text-slate-500">
                    {envSet ? "✅ Vercel 환경변수에 설정됨" : saved ? `브라우저 저장: ${new Date(saved.storedAt).toLocaleString()}` : "미저장"}
                  </p>
                </div>
                <input
                  className="input"
                  type="password"
                  value={draft[provider] ?? ""}
                  onChange={(e) => setDraft({ ...draft, [provider]: e.target.value })}
                  placeholder={envSet ? "환경변수 사용 중" : saved ? "********" : "키 입력"}
                  disabled={envSet}
                />
                <button className="btn-primary" onClick={() => save(provider)} disabled={envSet}>저장</button>
                <button className="btn-secondary" onClick={() => remove(provider)} disabled={envSet}>삭제</button>
              </div>
            );
          })}
        </div>
        <div className="mt-6 space-y-3">
          <p className="rounded-lg bg-blue-50 p-4 text-sm text-blue-800">
            <strong>Vercel 배포 시:</strong> Vercel 대시보드 → Settings → Environment Variables에 아래 키를 등록하세요.<br />
            <code className="mt-1 block text-xs">DATA_GO_KR_API_KEY, VWORLD_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID</code>
          </p>
          <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">브라우저 localStorage 방식은 같은 브라우저에서만 유지됩니다. 환경변수가 우선 적용됩니다.</p>
        </div>
      </div>
    </AppShell>
  );
}
