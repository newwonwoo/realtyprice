// data.go.kr API 키 정규화
// 사용자가 "URL인코딩" 버전(%2F... 포함)을 붙여넣어도 "URL디코딩" 버전으로 통일
export function normalizeApiKey(key: string): string {
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}
