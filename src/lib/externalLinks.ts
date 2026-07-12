import { buildNaverLandUrl } from "./naverDeepLink";

export function getNaverLandSearchUrl(apartmentName: string) {
  return `https://land.naver.com/search?query=${encodeURIComponent(apartmentName)}`;
}

// 좌표가 있으면 그 위치로 바로 열리는 딥링크, 없으면 기존 이름검색으로 폴백.
export function getNaverLandUrl(apartmentName: string, lat?: number, lon?: number) {
  if (lat != null && lon != null) return buildNaverLandUrl({ lat, lon });
  return getNaverLandSearchUrl(apartmentName);
}

export function getHogangnonoSearchUrl(apartmentName: string) {
  return `https://hogangnono.com/search?q=${encodeURIComponent(apartmentName)}`;
}
