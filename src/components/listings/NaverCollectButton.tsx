"use client";

import { useEffect, useState } from "react";
import type { ApartmentWithRole } from "./ListingFetcher";

// 앱 ↔ 크롬확장(리얼티 실호가 수집기) 브리지 버튼.
// 확장이 설치돼 있으면 window.postMessage로 대상목록 동기화 + "전체 수집" 트리거.
// 확장이 없으면 설치 안내만 표시(앱 자체는 아무 것도 긁지 않음 — 수집은 전적으로 확장/사용자 브라우저).
type Props = { apartments: ApartmentWithRole[] };

type Msg = { source?: string; kind?: string; ok?: boolean; complexNo?: string; saved?: number; error?: string; result?: { ok: boolean; total?: number; saved?: number; error?: string } };

export function NaverCollectButton({ apartments }: Props) {
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const targets = apartments.map(({ apartment }) => ({
    apartmentId: apartment.id,
    name: apartment.name,
    region: apartment.region,
  }));

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data as Msg;
      if (!d || d.source !== "REALTY_EXT") return;
      if (d.kind === "ready") {
        setInstalled(true);
        // 대상목록 동기화(네이버 페이지 드롭다운 매칭용)
        window.postMessage({ source: "REALTY_APP", kind: "targets", targets }, "*");
      }
      if (d.kind === "progress") {
        setLog((prev) => [`${d.complexNo}: ${d.ok ? "저장 " + (d.saved ?? 0) : "실패 " + (d.error ?? "")}`, ...prev].slice(0, 8));
      }
      if (d.kind === "collectAllDone") {
        setBusy(false);
        const r = d.result;
        setLog((prev) => [r?.ok ? `완료 · ${r.total}개 · 저장 ${r.saved}건 (새로고침 시 반영)` : `실패: ${r?.error ?? ""}`, ...prev].slice(0, 8));
      }
    };
    window.addEventListener("message", onMsg);
    // 확장 존재 확인 핑
    window.postMessage({ source: "REALTY_APP", kind: "ping" }, "*");
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets.map((t) => t.apartmentId).join(",")]);

  if (!installed) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500">
        <span className="font-semibold text-slate-600">네이버 실호가</span>는 크롬확장 "리얼티 실호가 수집기"가 설치돼야 수집됩니다
        (수집은 사용자 브라우저에서만 실행). <code>extension/</code> 폴더를 <code>chrome://extensions</code>에서 로드하세요.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-green-700">네이버 확장 연결됨 ✓</span>
        <button
          type="button"
          className="btn-primary text-xs ml-auto"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setLog(["수집 시작…"]);
            window.postMessage({ source: "REALTY_APP", kind: "collectAll" }, "*");
          }}
        >
          {busy ? "수집 중…" : "네이버 실호가 새로고침 (전체)"}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">
        미매핑 단지는 네이버 단지페이지에서 1회 수집해 매핑하세요. 사용자 트리거 시에만 동작합니다.
      </p>
      {log.length > 0 && (
        <div className="mt-2 max-h-24 overflow-auto rounded bg-white/70 p-2 font-mono text-[11px] text-slate-600">
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </div>
  );
}
