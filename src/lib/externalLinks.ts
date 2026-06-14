export function getNaverLandSearchUrl(apartmentName: string) {
  return `https://land.naver.com/search?query=${encodeURIComponent(apartmentName)}`;
}

export function getHogangnonoSearchUrl(apartmentName: string) {
  return `https://hogangnono.com/search?q=${encodeURIComponent(apartmentName)}`;
}
