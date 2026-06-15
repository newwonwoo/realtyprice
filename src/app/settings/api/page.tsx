"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";

// 공공데이터포털 키 하나로 단지목록·실거래·전월세 API 모두 사용 가능
const providers = [
  ["data_go_kr", "공공데이터포털 API Key", "data.go.kr에서 발급. 아파트 단지 검색·실거래 수집에 모두 사용됩니다."],
  ["vworld", "VWorld 지오코더 인증키", "vworld.kr에서 발급 (무료, 일 4만건). 단지 주소 → GPS 좌표 변환에 사용 (비교단지 1km 인접 필터). ⚠️ VWorld 약관상 좌표는 실시간 사용만 가능하며 저장하지 않습니다."],
  ["telegram_bot_token", "Telegram Bot Token", "알림 전송용 (선택)"],
  ["telegram_chat_id", "Telegram Chat ID", "알림 전송용 (선택)"]
] as const;

type SavedKeys = Record<string, boolean>;

export default function ApiSettingsPage() {
  const [savedKeys, setSavedKeys] = useState<SavedKeys>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/env-keys")
      .then((r) => r.json())
      .then((data) => {
        setSavedKeys(data as SavedKeys);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function save(provider: string) {
    const value = draft[provider];
    if (!value) return;
    const res = await fetch("/api/env-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, value }),
    });
    const data = await res.json();
    setSavedKeys((prev) => ({ ...prev, [provider]: true }));
    setDraft((prev) => ({ ...prev, [provider]: "" }));
    if (data.note) setNotice(data.note);
  }

  async function remove(provider: string) {
    await fetch("/api/env-keys", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    });
    setSavedKeys((prev) => ({ ...prev, [provider]: false }));
  }

  if (loading) return <AppShell><div className="p-8 text-slate-400">로딩 중...</div></AppShell>;

  return (
    <AppShell>
      <div className="mb-8"><p className="text-sm font-semibold text-blue-600">Settings</p><h1 className="text-3xl font-black">API 키 설정</h1><p className="mt-2 text-slate-600">API 키는 서버의 .env.local 파일에 저장됩니다.</p></div>
      {notice && (
        <div className="mb-4 rounded-lg bg-blue-50 p-4 text-sm text-blue-800">
          {notice}
          <button className="ml-4 underline" onClick={() => setNotice(null)}>닫기</button>
        </div>
      )}
      <div className="card p-5">
        <div className="space-y-5">
          {providers.map(([provider, label, desc]) => {
            const saved = savedKeys[provider];
            return (
              <div key={provider} className="grid gap-3 rounded-lg border border-slate-200 p-4 md:grid-cols-[1fr_1.2fr_auto_auto] md:items-center">
                <div><p className="font-bold">{label}</p><p className="text-xs text-slate-400">{desc}</p><p className="text-xs text-slate-500">{saved ? "저장됨 (환경변수)" : "미저장"}</p></div>
                <input className="input" type="password" value={draft[provider] ?? ""} onChange={(e) => setDraft({ ...draft, [provider]: e.target.value })} placeholder={saved ? "********" : "키 입력"} />
                <button className="btn-primary" onClick={() => save(provider)}>저장</button>
                <button className="btn-secondary" onClick={() => remove(provider)}>삭제</button>
              </div>
            );
          })}
        </div>
        <p className="mt-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">API 키는 서버의 .env.local 파일에 저장됩니다. 변경 후 서버를 재시작해야 적용됩니다.</p>
      </div>
    </AppShell>
  );
}
