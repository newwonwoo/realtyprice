"use client";

import { useEffect, useState } from "react";
import { readStorage, STORAGE_KEYS } from "./storage";

// VWorld 이용약관상 변환좌표는 실시간 사용만 허용, 저장 금지 — 그래서 이 좌표는
// store/DB에 저장하지 않고 훅을 쓰는 컴포넌트의 로컬 state에서만 살아있다가 버려진다.
export function useLiveGeocode(address?: string): { lat: number; lng: number } | null {
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

  return coord;
}
