"use client";

import { Fragment, useRef, useState } from "react";
import type { Apartment } from "@/types/apartment";
import { searchApartments } from "@/lib/searchApartments";
import { nowIso } from "@/lib/format";
import { readStorage, STORAGE_KEYS } from "@/lib/storage";
import type { AptSearchResult } from "@/app/api/apt-search/route";
import type { PresaleInfo } from "@/app/api/apt-presale/route";
import { isLeaderApartment } from "@/lib/leaderApartments";

type Tab = "api" | "local";

// 통합 검색 결과 타입
type CombinedResult =
  | { source: "completed"; data: AptSearchResult }
  | { source: "presale"; data: PresaleInfo };

// 진단 정보 타입
type StrategyDiag = { field: string; value: string; httpStatus: number; rawCount: number; error?: string };
type DiagInfo = {
  completedKeyword: string;
  presaleKeyword: string;
  completed?: { diag?: StrategyDiag[]; rawTotal?: number; total?: number; error?: string };
  presale?: { diag?: StrategyDiag[]; total?: number; error?: string };
};

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
  const [apiResults, setApiResults] = useState<CombinedResult[]>([]);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [debugMode, setDebugMode] = useState(false);
  const [diagInfo, setDiagInfo] = useState<DiagInfo | null>(null);

  // 로컬 검색
  const [localRegion, setLocalRegion] = useState("");
  const [localName, setLocalName] = useState("");

  const [message, setMessage] = useState("");
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showMessage(msg: string) {
    setMessage(msg);
    if (msgTimer.current) clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMessage(""), 3000);
  }

  // ── 공공데이터 + 청약홈 동시 검색 ────────────────────────
  async function searchByApi() {
    if (!keyword.trim()) { setApiError("검색어를 입력하세요."); return; }
    const keys = readStorage<{ provider: string; value: string }[]>(STORAGE_KEYS.apiKeys, []);
    const serviceKey = keys.find((k) => k.provider === "data_go_kr")?.value;
    if (!serviceKey) { setApiError("공공데이터포털 API 키가 없습니다. 설정 > API 키 설정에서 등록하세요."); return; }

    setApiLoading(true);
    setApiError("");
    setApiResults([]);
    setDiagInfo(null);
    const dbg = debugMode ? "1" : "";
    try {
      const kw = keyword.trim();
      const hasRegion = kw.includes(" ");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let completedRes: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let presaleRes: any;
      let completedKeyword = kw;

      if (hasRegion) {
        // 지역+단지명 입력: 부동산원·청약홈 동시 조회
        [completedRes, presaleRes] = await Promise.all([
          fetch(`/api/apt-search?${new URLSearchParams({ serviceKey, keyword: kw, debug: dbg })}`).then((r) => r.json()),
          fetch(`/api/apt-presale?${new URLSearchParams({ serviceKey, houseName: kw, debug: dbg })}`).then((r) => r.json()),
        ]);
      } else {
        // 단지명만 입력: 청약홈에서 주소 먼저 확보 후 odcloud 재검색
        presaleRes = await fetch(`/api/apt-presale?${new URLSearchParams({ serviceKey, houseName: kw, debug: dbg })}`).then((r) => r.json());
        const presaleItems: PresaleInfo[] = presaleRes.items ?? [];
        if (presaleItems.length > 0) {
          const loc = presaleItems[0].supplyLocation;
          const regionParts = loc.split(" ").slice(0, 2).join(" ");
          completedKeyword = `${regionParts} ${kw}`;
        }
        completedRes = await fetch(`/api/apt-search?${new URLSearchParams({ serviceKey, keyword: completedKeyword, debug: dbg })}`).then((r) => r.json());
      }

      if (debugMode) {
        setDiagInfo({
          completedKeyword,
          presaleKeyword: kw,
          completed: { diag: completedRes.diag, rawTotal: completedRes.rawTotal, total: completedRes.total, error: completedRes.error },
          presale: { diag: presaleRes.diag, total: presaleRes.total, error: presaleRes.error },
        });
      }

      const rawCombined: CombinedResult[] = [
        ...((completedRes.items ?? []) as AptSearchResult[]).map((d): CombinedResult => ({ source: "completed", data: d })),
        ...((presaleRes.items ?? []) as PresaleInfo[]).map((d): CombinedResult => ({ source: "presale", data: d })),
      ];

      // ── 최종 엄격 필터: 사용자가 실제 입력한 키워드(kw)가 정말 포함됐는지 검증 ──
      // (자동으로 덧붙인 지역어 "경기도" 등은 기준에서 제외 → 경기도 전체가 쏟아지는 문제 방지)
      const noSpace = (s: string) => (s || "").replace(/\s+/g, "");
      const kwNoSpace = noSpace(kw);
      const kwWords = kw.split(/\s+/).filter((w) => w.length >= 2);
      const strictMatch = (name: string, addr: string) => {
        const n = noSpace(name);
        const a = noSpace(addr);
        if (kwWords.length >= 2) {
          // 지역+단지명 등 여러 단어: 모든 단어가 이름 또는 주소에 포함되어야 통과
          return kwWords.every((w) => n.includes(w) || a.includes(w));
        }
        // 단일 키워드: 그 키워드가 이름 또는 주소에 실제로 포함되어야 통과
        return n.includes(kwNoSpace) || a.includes(kwNoSpace);
      };
      const combined = rawCombined.filter((r) =>
        r.source === "completed"
          ? strictMatch(r.data.name, r.data.address)
          : strictMatch(r.data.houseName, r.data.supplyLocation)
      );

      if (!combined.length) {
        setApiError(
          hasRegion
            ? "검색 결과가 없습니다. 단지명을 더 짧게 입력하거나 지역명을 바꿔보세요. (예: 오산역 → 화성 오산역)"
            : "검색 결과가 없습니다. 지역명을 포함해서 검색해보세요. 예: \"인천 힐스테이트레이크\""
        );
        return;
      }
      setApiResults(combined);
    } catch (e) {
      setApiError(`요청 실패: ${String(e)}`);
    } finally {
      setApiLoading(false);
    }
  }

  async function addFromCompleted(item: AptSearchResult) {
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
    // 좌표는 저장하지 않음 — 비교단지 1km 필터 시 VWorld로 실시간 지오코딩(약관상 저장 금지)
    const added = onAdd(apt);
    showMessage(added ? `"${item.name}" 추가됨` : "이미 등록된 대상아파트입니다.");
  }

  async function addFromPresale(item: PresaleInfo) {
    const apt: import("@/types/apartment").Apartment = {
      id: `presale_${item.houseManageNo}`,
      name: item.houseName,
      region: item.supplyLocation.split(" ").slice(0, 2).join(" "),
      address: item.supplyLocation,
      role: "target",
      group: "presale",
      households: item.totalSupplyHouseholds || undefined,
      originalPresalePrice: item.lowestPrice,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    // 좌표 미저장 — 1km 필터 시 VWorld 실시간 지오코딩(약관상 저장 금지)
    const added = onAdd(apt);
    showMessage(added ? `"${item.houseName}" 추가됨 (분양단지)` : "이미 등록된 대상아파트입니다.");
  }

  // ── 로컬 검색 ──────────────────────────────────────────
  const localResults = (localRegion || localName)
    ? searchApartments(apartments, { regionKeyword: localRegion, nameKeyword: localName }).filter((a) => a.role !== "target")
    : [];

  function addFromLocal(apt: Apartment) {
    const added = onAdd({ ...apt, id: `target_${Date.now()}`, role: "target", updatedAt: nowIso() });
    showMessage(added ? "대상아파트로 추가했습니다." : "이미 등록된 대상아파트입니다.");
  }

  return (
    <div className="card p-5">
      <h2 className="text-lg font-black">대상아파트 추가</h2>

      {/* 탭 */}
      <div className="mt-4 flex gap-2 border-b border-slate-200">
        {([["api", "단지 검색 (공공데이터)"], ["local", "저장된 아파트"]] as [Tab, string][]).map(([id, label]) => (
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
            완공단지(한국부동산원)와 분양단지(청약홈)를 동시에 검색합니다.
            <a href="/settings/api" className="ml-1 text-blue-600 underline">API 키 설정</a> 필요.
          </p>
          <p className="mb-2 text-xs font-semibold text-amber-600">
            💡 <strong>지역명 + 단지명</strong> 조합으로 입력하면 정확합니다.
            예: <em>인천 힐스테이트레이크</em>, <em>송도 더샵</em>, <em>오산 금강</em>
          </p>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchByApi()}
              placeholder="지역 + 단지명 입력 (예: 인천 힐스테이트레이크, 송도 더샵)"
            />
            <button className="btn-primary whitespace-nowrap" onClick={searchByApi} disabled={apiLoading}>
              {apiLoading ? "검색 중…" : "검색"}
            </button>
          </div>
          <label className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none">
            <input type="checkbox" checked={debugMode} onChange={(e) => setDebugMode(e.target.checked)} />
            진단 모드 (API 응답 상세 보기)
          </label>
          {apiError && <p className="mt-2 text-sm text-red-600">{apiError}</p>}
          {diagInfo && <DiagPanel info={diagInfo} resultCount={apiResults.length} />}
          {apiResults.length > 0 && (
            <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
              <table className="table w-full">
                <thead><tr><th>단지명</th><th>주소</th><th>세대</th><th>구분</th><th>추가</th></tr></thead>
                <tbody>
                  {apiResults.map((r, i) => r.source === "completed" ? (
                    <tr key={`c_${r.data.complexPk}`}>
                      <td className="font-semibold">
                        {r.data.name}
                        {isLeaderApartment(r.data.name, r.data.address, r.data.complexPk) && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-700">👑 대장</span>}
                      </td>
                      <td className="text-xs">{r.data.address}</td>
                      <td className="text-right text-xs">{r.data.households ? `${r.data.households.toLocaleString()}세대` : "-"}</td>
                      <td><span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">완공 {builtLabel(r.data.builtDate)}</span></td>
                      <td><button className="btn-secondary" onClick={() => addFromCompleted(r.data)}>추가</button></td>
                    </tr>
                  ) : (
                    <tr key={`p_${r.data.houseManageNo}_${i}`}>
                      <td className="font-semibold">
                        {r.data.houseName}
                        {isLeaderApartment(r.data.houseName, r.data.supplyLocation) && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-700">👑 대장</span>}
                      </td>
                      <td className="text-xs">{r.data.supplyLocation}</td>
                      <td className="text-right text-xs">{r.data.totalSupplyHouseholds ? `${r.data.totalSupplyHouseholds.toLocaleString()}세대` : "-"}</td>
                      <td><span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">분양 {r.data.recruitPublicNoticeDate?.slice(0, 7) ?? ""}</span></td>
                      <td><button className="btn-secondary" onClick={() => addFromPresale(r.data)}>추가</button></td>
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

      {message && <p className="mt-3 text-sm font-semibold text-blue-700">{message}</p>}
    </div>
  );
}

// ── 진단 패널 ──────────────────────────────────────────────
function statusLabel(s: number): { text: string; cls: string } {
  if (s === 200) return { text: "200 OK", cls: "bg-emerald-100 text-emerald-700" };
  if (s === 0) return { text: "네트워크 오류", cls: "bg-red-100 text-red-700" };
  if (s === 401 || s === 403) return { text: `${s} 인증실패(키확인)`, cls: "bg-red-100 text-red-700" };
  if (s === 404) return { text: "404 없음", cls: "bg-amber-100 text-amber-700" };
  return { text: String(s), cls: "bg-slate-100 text-slate-600" };
}

function DiagTable({ diag }: { diag?: StrategyDiag[] }) {
  if (!diag || !diag.length) return <p className="text-xs text-slate-400">호출 기록 없음</p>;
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-slate-400">
          <th className="text-left font-medium">필드</th>
          <th className="text-left font-medium">검색값</th>
          <th className="text-left font-medium">HTTP</th>
          <th className="text-right font-medium">받은 건수</th>
        </tr>
      </thead>
      <tbody>
        {diag.map((d, i) => {
          const st = statusLabel(d.httpStatus);
          return (
            <Fragment key={i}>
              <tr className="border-t border-slate-100">
                <td className="py-0.5 font-mono">{d.field}</td>
                <td className="py-0.5 font-mono text-slate-600">{d.value}</td>
                <td className="py-0.5"><span className={`rounded px-1 py-0.5 ${st.cls}`}>{st.text}</span></td>
                <td className="py-0.5 text-right font-mono">{d.rawCount}{d.error ? " ⚠️" : ""}</td>
              </tr>
              {d.error && (
                <tr>
                  <td colSpan={4} className="pb-1 font-mono text-[10px] leading-tight text-red-500 break-all">↳ {d.error}</td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function DiagPanel({ info, resultCount }: { info: DiagInfo; resultCount: number }) {
  return (
    <div className="mt-3 rounded-lg border border-slate-300 bg-slate-50 p-3 text-xs">
      <p className="mb-2 font-bold text-slate-700">🔬 검색 진단</p>

      <div className="mb-3">
        <p className="font-semibold text-slate-600">① 완공단지 (부동산원 / odcloud AptIdInfoSvc)</p>
        <p className="text-slate-400">실제 검색어: <span className="font-mono text-slate-600">{info.completedKeyword}</span></p>
        {info.completed?.error && <p className="text-red-600">오류: {info.completed.error}</p>}
        <DiagTable diag={info.completed?.diag} />
        <p className="mt-1 text-slate-500">
          원본 합계 <b>{info.completed?.rawTotal ?? 0}</b>건 → 필터 후 <b>{info.completed?.total ?? 0}</b>건
        </p>
      </div>

      <div className="mb-2">
        <p className="font-semibold text-slate-600">② 분양단지 (청약홈 / ApplyhomeInfoDetailSvc)</p>
        <p className="text-slate-400">검색어: <span className="font-mono text-slate-600">{info.presaleKeyword}</span></p>
        {info.presale?.error && <p className="text-amber-600">{info.presale.error}</p>}
        <DiagTable diag={info.presale?.diag} />
        <p className="mt-1 text-slate-500">결과 <b>{info.presale?.total ?? 0}</b>건</p>
      </div>

      <p className="border-t border-slate-200 pt-2 font-semibold text-slate-700">
        최종 표시 결과: {resultCount}건
      </p>
      <p className="mt-1 text-slate-400">
        ※ 모든 HTTP가 200인데 건수가 0이면 → 필터는 작동, 해당 데이터셋에 단지 없음.
        401/403이면 → API 키 문제. 네트워크 오류면 → 서버 연결 문제.
      </p>
    </div>
  );
}
