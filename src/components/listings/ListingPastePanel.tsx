"use client";

import { useMemo, useState } from "react";
import { useRealtyStore } from "@/lib/clientStore";
import { normalizeToBGrade } from "@/lib/grade";
import { formatEok } from "@/lib/format";
import { parseListingText, type ParsedListing } from "@/lib/listingTextParser";
import type { Listing } from "@/types/listing";
import type { ApartmentWithRole } from "./ListingFetcher";

const ROLE_LABEL = { target: "대상", leader: "대장", comparable: "비교" } as const;

// 네이버부동산 화면에서 사람이 직접 복사(Ctrl+C)한 매물 텍스트를 붙여넣으면
// 가격·면적·층을 파싱해 미리보기로 보여주고, 확인 후에만 store.listings에 저장한다.
// 서버가 어디를 자동 호출하는 게 아니라 전 과정이 사람 주도 — 직방식 차단 리스크 없음.
export function ListingPastePanel({ apartments }: { apartments: ApartmentWithRole[] }) {
  const store = useRealtyStore();
  const [selectedAptId, setSelectedAptId] = useState(apartments[0]?.apartment.id ?? "");
  const [text, setText] = useState("");
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [savedMsg, setSavedMsg] = useState("");

  const parsed = useMemo(() => parseListingText(text), [text]);
  const savable = parsed.filter((p) => p.tradeType !== "monthly_rent");
  const monthlyCount = parsed.length - savable.length;

  function toggle(idx: number) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function save() {
    const apt = apartments.find((x) => x.apartment.id === selectedAptId)?.apartment;
    if (!apt) return;
    const today = new Date().toISOString().slice(0, 10);
    const toSave = savable.filter((_, i) => !excluded.has(i));

    const listings: Listing[] = toSave.map((p) => {
      const key = `nvp_${apt.id}_${p.tradeType}_${p.exclusiveArea ?? 0}_${p.price}_${p.floor ?? "x"}`;
      return {
        id: `listing_${key}`,
        apartmentId: apt.id,
        listingType: p.tradeType as "sale" | "jeonse",
        exclusiveArea: p.exclusiveArea ?? apt.defaultArea ?? 0,
        askingPrice: p.price,
        floor: p.floor,
        grade: "B" as const,
        adjustedAskingPrice: normalizeToBGrade(p.price, "B"),
        source: "naver" as const,
        listingKey: key,
        capturedAt: today,
        status: "active" as const,
        memo: `수동 붙여넣기: ${p.rawLine.slice(0, 60)}`,
      };
    });

    const existingKeys = new Set(store.listings.map((l) => l.listingKey));
    const newOnes = listings.filter((l) => !existingKeys.has(l.listingKey));
    if (newOnes.length > 0) store.setListings([...newOnes, ...store.listings]);
    setSavedMsg(`${newOnes.length}건 저장됨${listings.length - newOnes.length > 0 ? ` (중복 ${listings.length - newOnes.length}건 제외)` : ""}`);
    setText("");
    setExcluded(new Set());
    setTimeout(() => setSavedMsg(""), 6000);
  }

  if (!apartments.length) return null;

  return (
    <details className="group rounded-lg border border-slate-200">
      <summary className="flex cursor-pointer select-none items-center justify-between px-3 py-2 text-xs font-semibold text-slate-500 hover:text-blue-600">
        네이버 매물 붙여넣기 (복사한 매물 텍스트 → 호가로 저장)
        <span className="text-slate-300 transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="border-t border-slate-100 p-4 space-y-3">
        <p className="text-xs text-slate-500">
          위 네이버부동산 링크에서 매물 목록을 <b>드래그해서 복사</b>한 뒤 아래에 붙여넣으면
          가격·면적·층을 자동으로 추려서 보여줍니다. <b>내용을 확인한 뒤 저장</b>하세요 — 잘못 읽힌 줄은 체크를 해제하면 됩니다.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-600">이 매물이 속한 단지:</span>
          <select className="input w-auto text-sm" value={selectedAptId} onChange={(e) => setSelectedAptId(e.target.value)}>
            {apartments.map(({ apartment: a, role }) => (
              <option key={a.id} value={a.id}>[{ROLE_LABEL[role]}] {a.name}</option>
            ))}
          </select>
        </div>

        <textarea
          className="input h-32 w-full font-mono text-xs"
          placeholder={"예)\n매매 4억 6,500\n아파트 112/84㎡, 12/25층, 남향\n전세 3억 2,000\n아파트 112/84㎡, 5/25층"}
          value={text}
          onChange={(e) => { setText(e.target.value); setExcluded(new Set()); }}
        />

        {text.trim() && savable.length === 0 && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
            매물을 찾지 못했습니다. &quot;매매 4억 6,500&quot;처럼 거래유형과 가격이 함께 있는 줄이 필요합니다.
            {monthlyCount > 0 && ` (월세 ${monthlyCount}건은 호가 저장을 지원하지 않아 제외됩니다.)`}
          </p>
        )}

        {savable.length > 0 && (
          <div className="space-y-2">
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="table w-full text-xs">
                <thead><tr><th></th><th>유형</th><th>가격</th><th>전용면적</th><th>층</th><th>원본 줄</th></tr></thead>
                <tbody>
                  {savable.map((p, i) => (
                    <tr key={i} className={excluded.has(i) ? "opacity-40" : ""}>
                      <td><input type="checkbox" checked={!excluded.has(i)} onChange={() => toggle(i)} /></td>
                      <td className="font-semibold">{p.tradeType === "sale" ? "매매" : "전세"}</td>
                      <td className="font-semibold tabular-nums">{formatEok(p.price)}</td>
                      <td className="tabular-nums">{p.exclusiveArea ? `${p.exclusiveArea}㎡` : <span className="text-amber-600">미인식 → 기본평형 사용</span>}</td>
                      <td className="tabular-nums">{p.floor ?? "-"}</td>
                      <td className="max-w-[240px] truncate text-slate-400">{p.rawLine}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {monthlyCount > 0 && (
              <p className="text-xs text-slate-400">월세 {monthlyCount}건은 호가 저장을 지원하지 않아 제외됐습니다.</p>
            )}
            <div className="flex items-center justify-end gap-3">
              {savedMsg && <span className="text-xs font-semibold text-emerald-600">{savedMsg}</span>}
              <button className="btn-primary text-sm px-4 py-2" onClick={save} disabled={savable.length - excluded.size === 0}>
                {savable.length - excluded.size}건 호가로 저장
              </button>
            </div>
          </div>
        )}
        {!text.trim() && savedMsg && <p className="text-xs font-semibold text-emerald-600">{savedMsg}</p>}
      </div>
    </details>
  );
}
