"use client";

import { ExternalLink } from "lucide-react";
import { getNaverLandUrl } from "@/lib/externalLinks";
import { useLiveGeocode } from "@/lib/useLiveGeocode";
import type { ApartmentWithRole } from "./ListingFetcher";

const ROLE_LABEL = { target: "대상", leader: "대장", comparable: "비교" } as const;
const ROLE_COLOR = {
  target: "bg-blue-100 text-blue-700",
  leader: "bg-violet-100 text-violet-700",
  comparable: "bg-slate-100 text-slate-600",
} as const;

function NaverLinkRow({ item }: { item: ApartmentWithRole }) {
  const { apartment: a, role } = item;
  const coord = useLiveGeocode(a.address ?? a.region);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
      <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-bold ${ROLE_COLOR[role]}`}>{ROLE_LABEL[role]}</span>
      <span className="flex-1 truncate font-semibold text-slate-700">{a.name}</span>
      <a
        className="btn-secondary shrink-0 inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 whitespace-nowrap"
        href={getNaverLandUrl(a.name, coord?.lat, coord?.lng)}
        target="_blank"
        rel="noreferrer"
      >
        네이버부동산 <ExternalLink size={12} />
      </a>
    </div>
  );
}

// 자동수집(직방/KB)이 안 잡히거나 값이 의심스러울 때, 사람이 직접 눈으로 확인하기 쉽게
// 대상·대장·비교단지 전부의 네이버부동산 딥링크를 한 곳에 모아 보여준다.
// 서버가 네이버를 자동 호출하지 않음 — 클릭은 사람이 직접 함, 데이터 저장 없음.
export function NaverLinksPanel({ apartments }: { apartments: ApartmentWithRole[] }) {
  if (!apartments.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-bold text-slate-700">네이버부동산에서 직접 확인</p>
      <p className="mt-1 text-xs text-slate-500">
        자동수집(직방·KB)이 안 되거나 값이 의심스러울 때, 아래 버튼으로 해당 단지 위치가 정확히 지정된 네이버부동산 지도를 열어 직접 확인하세요.
      </p>
      <div className="mt-3 space-y-2">
        {apartments.map((item) => (
          <NaverLinkRow key={item.apartment.id} item={item} />
        ))}
      </div>
    </div>
  );
}
