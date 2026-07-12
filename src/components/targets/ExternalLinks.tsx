"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { getHogangnonoSearchUrl, getNaverLandUrl } from "@/lib/externalLinks";
import { readStorage, STORAGE_KEYS } from "@/lib/storage";

export function ExternalLinks({ apartmentName, address }: { apartmentName: string; address?: string }) {
  // VWorld 이용약관상 변환좌표는 실시간 사용만 허용, 저장 금지 — 그래서 이 좌표는
  // store/DB에 저장하지 않고 이 컴포넌트의 로컬 state에서만 살아있다가 링크 생성 후 버려진다.
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    setCoord(null);
    if (!address) return;
    const keys = readStorage<{ provider: string; value: string }[]>(STORAGE_KEYS.apiKeys, []);
    const vworldKey = keys.find((k) => k.provider === "vworld")?.value;
    if (!vworldKey) return;
    // 괄호 표기("(A8블록)" 등)는 VWorld 주소 매칭을 방해해 항상 실패로 이어짐 — 괄호만 제거
    const cleaned = address.replace(/[（(][^）)]*[）)]/g, " ").replace(/\s+/g, " ").trim() || address;
    let cancelled = false;
    fetch(`/api/geocode?address=${encodeURIComponent(cleaned)}&vworldKey=${encodeURIComponent(vworldKey)}`)
      .then((r) => r.json())
      .then((json) => { if (!cancelled && !json.error && json.lat && json.lng) setCoord({ lat: json.lat, lng: json.lng }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [address]);

  return (
    <div className="flex flex-wrap gap-2">
      <a className="btn-secondary inline-flex items-center gap-2" href={getNaverLandUrl(apartmentName, coord?.lat, coord?.lng)} target="_blank" rel="noreferrer">
        네이버부동산 보기 <ExternalLink size={14} />
      </a>
      <a className="btn-secondary inline-flex items-center gap-2" href={getHogangnonoSearchUrl(apartmentName)} target="_blank" rel="noreferrer">
        호갱노노 보기 <ExternalLink size={14} />
      </a>
    </div>
  );
}
