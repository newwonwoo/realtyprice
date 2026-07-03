// 수도권 지역별 대장아파트 참조 테이블
// 선정 기준: 각 시/구의 최고가 대표 아파트(재건축 추진 단지 제외, 네이버 전용 84㎡ 1~3층 제외 호가 기준).
// 자동 매칭: target.address에서 구/시 추출 → 첫 번째 매칭 항목 제안.
//
// ⚠️ 2026-07 전면 재작성: 기존 테이블은 48개 중 ~11개만 실제 대장과 일치(나머지 오기입·누락).
//    사용자 제공 "수도권 대장아파트 시세표"(네이버 84㎡ 호가, 재건축 제외)를 단일 근거로 재구성.
//    · households = 표의 세대수. region/name = 표 그대로.
//    · complexPk: 단지가 바뀐 곳은 부동산원 CSV 미검증이므로 임의입력 금지 규칙에 따라 비움
//      (이름+주소 region 퍼지매칭으로 폴백). 단지가 동일한 11곳만 기존 검증 complexPk 유지.
//      확정 시 /admin/verify-leaders 로 complexPk 채울 것.

export type LeaderEntry = {
  region: string;      // 주소 매칭 키워드 (가장 세분화된 행정구역)
  name: string;
  address: string;
  brand?: string;
  households?: number;
  complexPk?: string;  // 부동산원 단지고유번호 (검증된 경우만)
};

export const LEADER_APARTMENTS: LeaderEntry[] = [
  // ── 서울 ────────────────────────────────────────────────────
  { region: "서울 서초구", name: "래미안원베일리", address: "서울특별시 서초구 반포동", brand: "래미안", households: 2990 },
  { region: "서울 강남구", name: "래미안대치팰리스", address: "서울특별시 강남구 대치동 1027", brand: "래미안", households: 1608, complexPk: "11680120325153" },
  { region: "서울 송파구", name: "잠실엘스", address: "서울특별시 송파구 잠실동", brand: "엘스", households: 5678 },
  { region: "서울 양천구", name: "목동신시가지5단지", address: "서울특별시 양천구 목동", brand: "목동신시가지", households: 1848 },
  { region: "서울 동작구", name: "아크로리버하임", address: "서울특별시 동작구 흑석동 341", brand: "아크로", households: 1073, complexPk: "11590120381797" },
  { region: "서울 강동구", name: "올림픽파크포레온", address: "서울특별시 강동구 둔촌동", brand: "포레온", households: 12032 },
  { region: "서울 마포구", name: "마포프레스티지자이", address: "서울특별시 마포구 염리동", brand: "자이", households: 1694 },
  { region: "서울 용산구", name: "한가람", address: "서울특별시 용산구 이촌동", brand: "한가람", households: 2036 },
  { region: "서울 종로구", name: "경희궁자이2단지", address: "서울특별시 종로구 홍파동", brand: "자이", households: 1148 },
  { region: "서울 광진구", name: "광장힐스테이트", address: "서울특별시 광진구 광장동", brand: "힐스테이트", households: 453 },
  { region: "서울 성동구", name: "래미안옥수리버젠", address: "서울특별시 성동구 옥수동", brand: "래미안", households: 1511 },
  { region: "서울 영등포구", name: "당산센트럴아이파크", address: "서울특별시 영등포구 당산동", brand: "아이파크", households: 802 },
  { region: "서울 중구", name: "서울역센트럴자이", address: "서울특별시 중구 만리동2가 273", brand: "자이", households: 1341, complexPk: "11140120359587" },
  { region: "서울 동대문구", name: "청량리역롯데캐슬SKY-L65", address: "서울특별시 동대문구 전농동", brand: "롯데캐슬", households: 1425 },
  { region: "서울 강서구", name: "마곡엠벨리7단지", address: "서울특별시 강서구 마곡동", brand: "엠벨리", households: 1004 },
  { region: "서울 서대문구", name: "e편한세상신촌", address: "서울특별시 서대문구 북아현동", brand: "e편한세상", households: 1910 },
  { region: "서울 구로구", name: "신도림4차e편한세상", address: "서울특별시 구로구 신도림동", brand: "e편한세상", households: 853 },
  { region: "서울 은평구", name: "DMC센트럴자이", address: "서울특별시 은평구 수색동", brand: "자이", households: 1256 },
  { region: "서울 성북구", name: "래미안길음센터피스", address: "서울특별시 성북구 길음동 1320", brand: "래미안", households: 1509, complexPk: "11290120384680" },
  { region: "서울 관악구", name: "e편한세상서울대입구", address: "서울특별시 관악구 봉천동 1685", brand: "e편한세상", households: 1217, complexPk: "11620120392360" },
  { region: "서울 중랑구", name: "사가정센트럴아이파크", address: "서울특별시 중랑구 면목동 1545", brand: "아이파크", households: 1505, complexPk: "11260120411804" },
  { region: "서울 노원구", name: "청구3차", address: "서울특별시 노원구 중계동", brand: "청구", households: 780 },
  { region: "서울 금천구", name: "롯데캐슬골드파크1차", address: "서울특별시 금천구 독산동", brand: "롯데캐슬", households: 1743 },
  { region: "서울 도봉구", name: "북한산아이파크", address: "서울특별시 도봉구 창동", brand: "아이파크", households: 2061 },
  { region: "서울 강북구", name: "꿈의숲해링턴플레이스", address: "서울특별시 강북구 번동 425", brand: "해링턴플레이스", households: 1009, complexPk: "11305120394060" },

  // ── 경기 ────────────────────────────────────────────────────
  { region: "경기 과천시", name: "과천푸르지오써밋", address: "경기도 과천시 부림동", brand: "푸르지오", households: 1571 },
  { region: "경기 성남시 분당구", name: "백현마을2단지", address: "경기도 성남시 분당구 백현동", brand: "백현마을", households: 772 },
  { region: "경기 성남시 수정구", name: "위례센트럴자이", address: "경기도 성남시 수정구 창곡동", brand: "자이", households: 1413 },
  { region: "경기 성남시 중원구", name: "e편한세상금빛그랑메종1단지", address: "경기도 성남시 중원구 금광동", brand: "e편한세상", households: 1135 },
  { region: "경기 수원시 영통구", name: "광교중흥S클래스", address: "경기도 수원시 영통구 이의동", brand: "중흥S클래스", households: 2231 },
  { region: "경기 수원시 장안구", name: "화서역파크푸르지오", address: "경기도 수원시 장안구 정자동", brand: "푸르지오", households: 2355 },
  { region: "경기 수원시 팔달구", name: "매교역푸르지오SK뷰", address: "경기도 수원시 팔달구 교동", brand: "푸르지오·SK뷰", households: 3603 },
  { region: "경기 수원시 권선구", name: "수원하늘채더퍼스트1단지", address: "경기도 수원시 권선구 오목천동", brand: "하늘채", households: 1403 },
  { region: "경기 용인시 수지구", name: "성복역롯데캐슬골드타운", address: "경기도 용인시 수지구 성복동", brand: "롯데캐슬", households: 2356 },
  { region: "경기 용인시 기흥구", name: "힐스테이트기흥", address: "경기도 용인시 기흥구 구갈동 437", brand: "힐스테이트", households: 1888, complexPk: "41463120374461" },
  { region: "경기 용인시 처인구", name: "우미린센트럴파크", address: "경기도 용인시 처인구 역북동", brand: "우미린", households: 1260 },
  { region: "경기 화성시", name: "동탄역롯데캐슬", address: "경기도 화성시 오산동 100", brand: "롯데캐슬", households: 1448, complexPk: "41590120427142" },
  { region: "경기 광명시", name: "롯데캐슬&SK VIEW 클래스티지", address: "경기도 광명시 광명동", brand: "롯데캐슬·SK뷰", households: 1313 },
  { region: "경기 안양시 동안구", name: "평촌더샵센트럴시티", address: "경기도 안양시 동안구 호계동", brand: "더샵", households: 1459 },
  { region: "경기 안양시 만안구", name: "안양역푸르지오더샵", address: "경기도 안양시 만안구 안양동", brand: "푸르지오·더샵", households: 2736 },
  { region: "경기 하남시", name: "힐스테이트포웰시티", address: "경기도 하남시 학암동", brand: "힐스테이트", households: 932 },
  { region: "경기 고양시 일산동구", name: "킨텍스원시티2블럭", address: "경기도 고양시 일산동구 장항동", brand: "원시티", households: 959 },
  { region: "경기 고양시 일산서구", name: "한화포레나킨텍스", address: "경기도 고양시 일산서구 대화동", brand: "포레나", households: 1100 },
  { region: "경기 고양시 덕양구", name: "지축역센트럴푸르지오", address: "경기도 고양시 덕양구 지축동", brand: "푸르지오", households: 852 },
  { region: "경기 군포시", name: "힐스테이트금정역", address: "경기도 군포시 산본동", brand: "힐스테이트", households: 843 },
  { region: "경기 남양주시", name: "다산자이아이비플레이스", address: "경기도 남양주시 다산동", brand: "자이", households: 967 },
  { region: "경기 부천시", name: "센트럴파크푸르지오", address: "경기도 부천시 중동", brand: "푸르지오", households: 999 },
  { region: "경기 구리시", name: "신명", address: "경기도 구리시 인창동", brand: "신명", households: 434 },
  { region: "경기 의정부시", name: "의정부역센트럴자이&위브캐슬", address: "경기도 의정부시 의정부동", brand: "자이·위브캐슬", households: 2473 },
  { region: "경기 안산시 단원구", name: "안산레이크타운푸르지오", address: "경기도 안산시 단원구 초지동", brand: "푸르지오", households: 1569 },
  { region: "경기 안산시 상록구", name: "안산파크푸르지오", address: "경기도 안산시 상록구 사동", brand: "푸르지오", households: 1129 },
  { region: "경기 평택시", name: "지제역더샵센트럴시티", address: "경기도 평택시 세교동", brand: "더샵", households: 1999 },
  { region: "경기 광주시", name: "광주역자연앤자이", address: "경기도 광주시 역동", brand: "자이", households: 1031 },
  { region: "경기 시흥시", name: "시흥센트럴푸르지오", address: "경기도 시흥시 장현동", brand: "푸르지오", households: 2003 },
  { region: "경기 파주시", name: "운정신도시아이파크", address: "경기도 파주시 동패동", brand: "아이파크", households: 3042 },
  { region: "경기 김포시", name: "한강메트로자이2단지", address: "경기도 김포시 걸포동", brand: "자이", households: 2456 },
  { region: "경기 오산시", name: "더샵오산센트럴", address: "경기도 오산시 부산동", brand: "더샵", households: 596 },
  { region: "경기 이천시", name: "이천롯데캐슬골드스카이", address: "경기도 이천시 중리동", brand: "롯데캐슬", households: 736, complexPk: "41500120382768" },
  { region: "경기 의왕시", name: "인덕원푸르지오엘센트로", address: "경기도 의왕시 포일동", brand: "푸르지오", households: 1774, complexPk: "41430120395843" },
  { region: "경기 안성시", name: "아양시티프라디움", address: "경기도 안성시 아양동", brand: "시티프라디움", households: 688 },

  // ── 인천 ────────────────────────────────────────────────────
  { region: "인천 연수구", name: "송도더샵퍼스트파크", address: "인천광역시 연수구 송도동", brand: "더샵", households: 872 },
  { region: "인천 부평구", name: "부평SKVIEW해모로", address: "인천광역시 부평구 청천동", brand: "SK뷰·해모로", households: 1559 },
  { region: "인천 서구", name: "청라한양수자인레이크블루", address: "인천광역시 서구 청라동", brand: "한양수자인", households: 1534 },
  { region: "인천 남동구", name: "구월아시아드선수촌센트럴자이", address: "인천광역시 남동구 구월동", brand: "자이", households: 850 },
  { region: "인천 동구", name: "동인천역파크푸르지오", address: "인천광역시 동구 송현동", brand: "푸르지오", households: 2562 },
  { region: "인천 계양구", name: "계양코아루센트럴파크", address: "인천광역시 계양구 작전동", brand: "코아루", households: 724 },
  { region: "인천 미추홀구", name: "인천SK스카이뷰", address: "인천광역시 미추홀구 용현동", brand: "SK뷰", households: 3971 },
  { region: "인천 중구", name: "e편한세상영종국제도시오션하임", address: "인천광역시 중구 중산동", brand: "e편한세상", households: 1520 },
];

// target 주소에서 가장 세분화된 매칭 구/시 찾기
// 예: "경기 오산시 가수동" → "경기 오산시" 매칭
// "경기도 오산시 원동" 처럼 도(道)가 붙은 주소도 정규화해서 매칭
export function findLeaderForAddress(address: string): LeaderEntry | undefined {
  if (!address) return undefined;
  // "경기도" → "경기", "충청남도" → "충청남" 등 도명 정규화
  const normalized = address
    .replace(/경기도/g, "경기")
    .replace(/인천광역시/g, "인천")
    .replace(/서울특별시/g, "서울");
  // 긴 region 키워드부터 매칭 (구·동 레벨 우선)
  const sorted = [...LEADER_APARTMENTS].sort((a, b) => b.region.length - a.region.length);
  return sorted.find((entry) => normalized.includes(entry.region));
}

// 부동산원 complexPk로 대장 판별 (정식 ID 정확매칭)
export function isLeaderByComplexPk(complexPk?: string): boolean {
  if (!complexPk) return false;
  return LEADER_APARTMENTS.some((entry) => entry.complexPk && entry.complexPk === complexPk);
}

// 단지명+주소가 그 지역의 대장아파트인지 판별
// complexPk가 있으면 그쪽이 정확하므로 그걸 우선 쓰고(isLeaderByComplexPk),
// 이름만 있을 때를 위한 폴백: 공백 제거 후 양방향 부분 포함 완화 매칭.
export function isLeaderApartment(name: string, address: string, complexPk?: string): boolean {
  if (isLeaderByComplexPk(complexPk)) return true;
  if (!name) return false;
  const n = name.replace(/\s/g, "");
  if (!n) return false;
  const normalizedAddr = address
    ? address.replace(/경기도/g, "경기").replace(/인천광역시/g, "인천").replace(/서울특별시/g, "서울")
    : "";
  return LEADER_APARTMENTS.some((entry) => {
    if (normalizedAddr && !normalizedAddr.includes(entry.region)) return false;
    const e = entry.name.replace(/\s/g, "");
    // 한쪽이 다른쪽을 포함하면 같은 단지로 본다 (단, 너무 짧은 부분일치 방지: 4자 이상)
    return n === e || (n.length >= 4 && e.includes(n)) || (e.length >= 4 && n.includes(e));
  });
}
