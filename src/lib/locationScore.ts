import type { Apartment } from "@/types/apartment";
import type { Transaction } from "@/types/transaction";

// 입지 등급 절대 점수 (주소 tier 키워드 + 브랜드 + 세대수 + 연식)
export function locationGradeScore(addr: string, name: string, households?: number, builtYear?: number): number {
  const text = `${addr} ${name}`;
  let s = 50;
  if (/강남|서초|송파|용산|성수|한남|여의도|판교|과천|분당|광교|송도/i.test(text)) s += 16;
  if (/역|초역세권/i.test(text)) s += 6;
  if (/래미안|자이|디에이치|아크로|힐스테이트|푸르지오|아이파크|롯데캐슬|센트럴|더샵|포레나/i.test(text)) s += 4;
  if ((households ?? 0) >= 1500) s += 8;
  else if ((households ?? 0) >= 1000) s += 5;
  const yr = builtYear ?? 0;
  const now = new Date().getFullYear();
  if (yr >= now - 5) s += 6;
  else if (yr && yr < now - 20) s -= 6;
  return Math.min(100, Math.max(0, s));
}

// 대상/대장 가격 비율 자동 산출
// 우선순위: 최근 6개월 실거래 단가 비율 → 입지점수 비율 근사
export function autoLeaderRatio(
  target: Apartment,
  leader: Apartment,
  allTransactions: Transaction[],
  referenceArea?: number,
): number {
  const area = referenceArea ?? target.defaultArea ?? 84;

  function recentUnitPrices(aptId: string): number[] {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 6);
    return allTransactions
      .filter(
        (tx) =>
          tx.apartmentId === aptId &&
          (tx.transactionType === "sale" || tx.transactionType === "presale") &&
          Math.abs(tx.exclusiveArea - area) <= 10 &&
          new Date(tx.contractDate) >= cutoff,
      )
      .map((tx) => tx.price / tx.exclusiveArea);
  }

  const targetPrices = recentUnitPrices(target.id);
  const leaderPrices = recentUnitPrices(leader.id);

  if (targetPrices.length >= 1 && leaderPrices.length >= 1) {
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const ratio = avg(targetPrices) / avg(leaderPrices);
    // 합리적 범위 내 클램핑 (50%~110%)
    return Math.round(Math.min(1.1, Math.max(0.5, ratio)) * 100) / 100;
  }

  // 실거래 없으면 입지점수 비율로 근사
  const tScore = locationGradeScore(target.address ?? target.region ?? "", target.name, target.households, target.builtYear);
  const lScore = locationGradeScore(leader.address ?? leader.region ?? "", leader.name, leader.households, leader.builtYear);
  if (lScore === 0) return 0.9;
  const ratio = tScore / lScore;
  return Math.round(Math.min(1.1, Math.max(0.5, ratio)) * 100) / 100;
}
