"use client";

import { useMemo, useRef, useState } from "react";
import type { Apartment } from "@/types/apartment";
import { searchApartments } from "@/lib/searchApartments";
import { nowIso } from "@/lib/format";
import { readStorage, STORAGE_KEYS } from "@/lib/storage";
import { searchRegions } from "@/data/regionCodes";
import type { AptSearchResult } from "@/app/api/apt-search/route";

type Tab = "api" | "local" | "manual";

export function TargetApartmentSearch({ apartments, onAdd }: { apartments: Apartment[]; onAdd: (apartment: Apartment) => boolean }) {
  const [tab, setTab] = useState<Tab>("api");

  // --- API 검색 상태 ---
  const [regionKeyword, setRegionKeyword] = useState("");
  const [aptNameKeyword, setAptNameKeyword] = useState("");
  const [selectedRegion, setSelectedRegion] = useState<{ sido: string; name: string; code: string } | null>(null);
  const [apiResults, setApiResults] = useState<AptSearchResult[]>([]);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const regionSuggestions = useMemo(() => (regionKeyword ? searchRegions(regionKeyword) : []), [regionKeyword]);

  // --- 로컬 검색 상태 ---
  const [localRegion, setLocalRegion] = useState("");
  const [localName, setLocalName] = useState("");

  // --- 직접 추가 상태 ---
  const [manualName, setManualName] = useState("");
  const [manualRegion, setManualRegion] = useState("");
  const [manualAddress, setManualAddress] = useState("");

  const [message, setMessage] = useState("");
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showMessage(msg: string) {
    setMessage(msg);
    if (msgTimer.current) clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMessage(""), 3000);
  }

  // ── API 검색 ──────────────────────────────────────────────
  async function searchByApi() {
    if (!selectedRegion) { setApiError("지역(시군구)을 선택하세요."); return; }
    const keys = readStorage<{ provider: string; value: string }[]>(STORAGE_KEYS.apiKeys, []);
    const serviceKey = keys.find((k) => k.provider === "data_go_kr")?.value;
    if (!serviceKey) { setApiError("공공데이터포털 API 키가 없습니다. 설정 > API 키 설정에서 등록하세요."); return; }

    setApiLoading(true);
    setApiError("");
    setApiResults([]);
    try {
      const params = new URLSearchParams({ serviceKey, sggCode: selectedRegion.code });
      if (aptNameKeyword.trim()) params.set("aptName", aptNameKeyword.trim());
      const res = await fetch(`/api/apt-search?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) { setApiError(json.error ?? "오류가 발생했습니다."); return; }
      if (!json.items?.length) { setApiError("검색 결과가 없습니다."); return; }
      setApiResults(json.items);
    } catch (e) {
      setApiError(`요청 실패: ${String(e)}`);
    } finally {
      setApiLoading(false);
    }
  }

  function addFromApi(item: AptSearchResult) {
    const builtYear = item.kaptUsedate ? parseInt(item.kaptUsedate.slice(0, 4), 10) : undefined;
    const households = item.kaptdaCnt ? parseInt(item.kaptdaCnt, 10) : undefined;
    const added = onAdd({
      id: `kapt_${item.kaptCode}`,
      name: item.kaptName,
      region: selectedRegion?.name ?? selectedRegion?.sido ?? "미입력",
      address: item.kaptAddr || selectedRegion?.name || "미입력",
      role: "target",
      group: "custom",
      brand: item.kaptBcompany || undefined,
      builtYear: isNaN(builtYear!) ? undefined : builtYear,
      households: isNaN(households!) ? undefined : households,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    showMessage(added ? `"${item.kaptName}" 대상아파트로 추가했습니다.` : "이미 등록된 대상아파트입니다.");
  }

  // ── 로컬 검색 ────────────────────────────────────────────
  const localResults = useMemo(
    () => searchApartments(apartments, { regionKeyword: localRegion, nameKeyword: localName }).filter((a) => a.role !== "target"),
    [apartments, localRegion, localName]
  );

  function addFromLocal(apt: Apartment) {
    const added = onAdd({ ...apt, id: `target_${Date.now()}`, role: "target", updatedAt: nowIso() });
    showMessage(added ? "대상아파트로 추가했습니다." : "이미 등록된 대상아파트입니다.");
  }

  // ── 직접 추가 ─────────────────────────────────────────────
  function addManual() {
    if (!manualName.trim()) return;
    const added = onAdd({
      id: `target_${Date.now()}`,
      name: manualName.trim(),
      region: manualRegion.trim() || "미입력",
      address: manualAddress.trim() || manualRegion.trim() || "미입력",
      role: "target",
      group: "custom",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    showMessage(added ? "대상아파트로 추가했습니다." : "이미 등록된 대상아파트입니다.");
    if (added) { setManualName(""); setManualRegion(""); setManualAddress(""); }
  }

  // ─────────────────────────────────────────────────────────
  return (
    <div className="card p-5">
      <h2 className="text-lg font-black">대상아파트 추가</h2>

      {/* 탭 */}
      <div className="mt-4 flex gap-2 border-b border-slate-200 pb-0">
        {([ ["api", "공공데이터 단지 검색"], ["local", "저장된 아파트 검색"], ["manual", "직접 입력"] ] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded-t px-4 py-2 text-sm font-semibold transition-colors ${tab === id ? "border-b-2 border-blue-600 text-blue-700" : "text-slate-500 hover:text-slate-700"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 공공데이터 단지 검색 */}
      {tab === "api" && (
        <div className="mt-4">
          <p className="mb-3 text-xs text-slate-500">공공데이터포털 아파트 단지 목록 API로 단지명을 자동 검색합니다. <a href="/settings/api" className="text-blue-600 underline">API 키 설정</a>이 필요합니다.</p>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <div className="relative">
              <input
                className="input"
                value={regionKeyword}
                onChange={(e) => { setRegionKeyword(e.target.value); setSelectedRegion(null); }}
                placeholder="지역명 입력 (예: 오산, 연수구, 강남구)"
              />
              {regionSuggestions.length > 0 && !selectedRegion && (
                <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                  {regionSuggestions.map((r) => (
                    <li
                      key={r.code}
                      className="cursor-pointer px-3 py-2 text-sm hover:bg-blue-50"
                      onClick={() => { setSelectedRegion(r); setRegionKeyword(`${r.sido} ${r.name}`); }}
                    >
                      <span className="font-semibold">{r.name}</span>
                      <span className="ml-2 text-xs text-slate-400">{r.sido}</span>
                    </li>
                  ))}
                </ul>
              )}
              {selectedRegion && (
                <p className="mt-1 text-xs text-blue-700">선택됨: {selectedRegion.sido} {selectedRegion.name} ({selectedRegion.code})</p>
              )}
            </div>
            <input className="input" value={aptNameKeyword} onChange={(e) => setAptNameKeyword(e.target.value)} placeholder="단지명 키워드 (선택, 예: 래미안, 힐스테이트)" onKeyDown={(e) => e.key === "Enter" && searchByApi()} />
            <button className="btn-primary whitespace-nowrap" onClick={searchByApi} disabled={apiLoading}>
              {apiLoading ? "검색 중…" : "검색"}
            </button>
          </div>
          {apiError && <p className="mt-2 text-sm text-red-600">{apiError}</p>}
          {apiResults.length > 0 && (
            <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
              <table className="table w-full">
                <thead><tr><th>단지명</th><th>주소</th><th>세대</th><th>사용승인</th><th>시공사</th><th>추가</th></tr></thead>
                <tbody>
                  {apiResults.map((item) => (
                    <tr key={item.kaptCode}>
                      <td className="font-semibold">{item.kaptName}</td>
                      <td className="text-xs">{item.kaptAddr}</td>
                      <td className="text-right">{item.kaptdaCnt ? `${Number(item.kaptdaCnt).toLocaleString()}세대` : "-"}</td>
                      <td>{item.kaptUsedate ? `${item.kaptUsedate.slice(0, 4)}.${item.kaptUsedate.slice(4, 6)}` : "-"}</td>
                      <td className="text-xs text-slate-500">{item.kaptBcompany || "-"}</td>
                      <td><button className="btn-secondary" onClick={() => addFromApi(item)}>추가</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 저장된 아파트 검색 */}
      {tab === "local" && (
        <div className="mt-4">
          <div className="grid gap-3 md:grid-cols-2">
            <input className="input" value={localRegion} onChange={(e) => setLocalRegion(e.target.value)} placeholder="지역 contains 예: 오산, 송도" />
            <input className="input" value={localName} onChange={(e) => setLocalName(e.target.value)} placeholder="아파트명 contains 예: 금강, 힐스테이트" />
          </div>
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
            <table className="table w-full">
              <thead><tr><th>지역</th><th>아파트명</th><th>주소</th><th>추가</th></tr></thead>
              <tbody>
                {localResults.map((apt) => (
                  <tr key={apt.id}>
                    <td>{apt.region}</td>
                    <td className="font-semibold">{apt.name}</td>
                    <td>{apt.address}</td>
                    <td><button className="btn-secondary" onClick={() => addFromLocal(apt)}>추가</button></td>
                  </tr>
                ))}
                {!localResults.length && <tr><td colSpan={4} className="text-center text-slate-500">검색 가능한 후보가 없습니다.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 직접 입력 */}
      {tab === "manual" && (
        <div className="mt-4 space-y-3">
          <input className="input" value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="아파트명 *" />
          <input className="input" value={manualRegion} onChange={(e) => setManualRegion(e.target.value)} placeholder="지역" />
          <input className="input" value={manualAddress} onChange={(e) => setManualAddress(e.target.value)} placeholder="주소" />
          <button className="btn-primary w-full" onClick={addManual}>대상아파트로 추가</button>
        </div>
      )}

      {message && <p className="mt-3 text-sm font-semibold text-blue-700">{message}</p>}
    </div>
  );
}
