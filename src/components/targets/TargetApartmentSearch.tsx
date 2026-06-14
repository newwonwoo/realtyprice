"use client";

import { useRef, useState } from "react";
import type { Apartment } from "@/types/apartment";
import { searchApartments } from "@/lib/searchApartments";
import { nowIso } from "@/lib/format";
import { readStorage, STORAGE_KEYS } from "@/lib/storage";
import type { AptSearchResult } from "@/app/api/apt-search/route";

type Tab = "api" | "local" | "manual";

function builtYear(date: string): number | undefined {
  const y = parseInt(date?.slice(0, 4), 10);
  return isNaN(y) ? undefined : y;
}

function builtLabel(date: string): string {
  if (!date || date.length < 6) return "-";
  return `${date.slice(0, 4)}.${date.slice(4, 6)}`;
}

export function TargetApartmentSearch({ apartments, onAdd }: { apartments: Apartment[]; onAdd: (apartment: Apartment) => boolean }) {
  const [tab, setTab] = useState<Tab>("api");

  // API 검색
  const [keyword, setKeyword] = useState("");
  const [apiResults, setApiResults] = useState<AptSearchResult[]>([]);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState("");

  // 로컬 검색
  const [localRegion, setLocalRegion] = useState("");
  const [localName, setLocalName] = useState("");

  // 직접 입력
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

  // ── 공공데이터 검색 ──────────────────────────────────────
  async function searchByApi() {
    if (!keyword.trim()) { setApiError("검색어를 입력하세요."); return; }
    const keys = readStorage<{ provider: string; value: string }[]>(STORAGE_KEYS.apiKeys, []);
    const serviceKey = keys.find((k) => k.provider === "data_go_kr")?.value;
    if (!serviceKey) { setApiError("공공데이터포털 API 키가 없습니다. 설정 > API 키 설정에서 등록하세요."); return; }

    setApiLoading(true);
    setApiError("");
    setApiResults([]);
    try {
      const params = new URLSearchParams({ serviceKey, keyword: keyword.trim() });
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

  async function addFromApi(item: AptSearchResult) {
    const apt: import("@/types/apartment").Apartment = {
      id: `cpk_${item.complexPk}`,
      name: item.name,
      region: item.address.split(" ").slice(0, 2).join(" "),
      address: item.address,
      role: "target",
      group: "custom",
      builtYear: builtYear(item.builtDate),
      households: item.households || undefined,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    // 카카오 API 키가 있으면 좌표 자동 조회
    const keys = readStorage<{ provider: string; value: string }[]>(STORAGE_KEYS.apiKeys, []);
    const kakaoKey = keys.find((k) => k.provider === "kakao_rest_api")?.value;
    if (kakaoKey && item.address) {
      try {
        const res = await fetch(`/api/geocode?address=${encodeURIComponent(item.address)}&kakaoKey=${encodeURIComponent(kakaoKey)}`);
        const geo = await res.json();
        if (!geo.error) {
          apt.latitude = geo.lat;
          apt.longitude = geo.lng;
        }
      } catch { /* 좌표 없이 추가 */ }
    }

    const added = onAdd(apt);
    showMessage(added
      ? `"${item.name}" 추가됨${apt.latitude ? " (좌표 포함)" : " (좌표 없음 — 카카오 API 키 설정 시 자동 조회)"}`
      : "이미 등록된 대상아파트입니다."
    );
  }

  // ── 로컬 검색 ──────────────────────────────────────────
  const localResults = (localRegion || localName)
    ? searchApartments(apartments, { regionKeyword: localRegion, nameKeyword: localName }).filter((a) => a.role !== "target")
    : [];

  function addFromLocal(apt: Apartment) {
    const added = onAdd({ ...apt, id: `target_${Date.now()}`, role: "target", updatedAt: nowIso() });
    showMessage(added ? "대상아파트로 추가했습니다." : "이미 등록된 대상아파트입니다.");
  }

  // ── 직접 입력 ─────────────────────────────────────────
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

  return (
    <div className="card p-5">
      <h2 className="text-lg font-black">대상아파트 추가</h2>

      {/* 탭 */}
      <div className="mt-4 flex gap-2 border-b border-slate-200">
        {([["api", "단지 검색 (공공데이터)"], ["local", "저장된 아파트"], ["manual", "직접 입력"]] as [Tab, string][]).map(([id, label]) => (
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
          <p className="mb-3 text-xs text-slate-500">
            한국부동산원 단지 식별정보 API로 주소 또는 단지명을 검색합니다.
            <a href="/settings/api" className="ml-1 text-blue-600 underline">API 키 설정</a> 필요.
          </p>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchByApi()}
              placeholder="단지명 또는 주소 입력 (예: 오산역 금강, 인천 연수구 송도)"
            />
            <button className="btn-primary whitespace-nowrap" onClick={searchByApi} disabled={apiLoading}>
              {apiLoading ? "검색 중…" : "검색"}
            </button>
          </div>
          {apiError && <p className="mt-2 text-sm text-red-600">{apiError}</p>}
          {apiResults.length > 0 && (
            <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
              <table className="table w-full">
                <thead><tr><th>단지명</th><th>주소</th><th>세대</th><th>사용승인</th><th>추가</th></tr></thead>
                <tbody>
                  {apiResults.map((item) => (
                    <tr key={item.complexPk}>
                      <td className="font-semibold">{item.name}</td>
                      <td className="text-xs">{item.address}</td>
                      <td className="text-right">{item.households ? `${item.households.toLocaleString()}세대` : "-"}</td>
                      <td>{builtLabel(item.builtDate)}</td>
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
            <input className="input" value={localRegion} onChange={(e) => setLocalRegion(e.target.value)} placeholder="지역 (예: 오산, 송도)" />
            <input className="input" value={localName} onChange={(e) => setLocalName(e.target.value)} placeholder="아파트명 (예: 금강, 힐스테이트)" />
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
                {!localResults.length && <tr><td colSpan={4} className="text-center text-slate-500">검색 결과 없음</td></tr>}
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
