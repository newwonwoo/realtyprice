// 수도권 지역별 대장아파트 참조 테이블
// 선정 기준: 해당 구/시에서 가격을 선도하는 역세권 대단지 랜드마크
// 자동 매칭: target.address에서 구/시 추출 → 첫 번째 매칭 항목 제안
// ⚠️ 재건축·재개발 등으로 순위가 바뀔 수 있음 — 사용자 확인 후 적용

export type LeaderEntry = {
  region: string;      // 주소 매칭 키워드 (가장 세분화된 행정구역)
  name: string;
  address: string;
  brand?: string;
  households?: number;
  complexPk?: string;  // 부동산원 단지고유번호
};

export const LEADER_APARTMENTS: LeaderEntry[] = [
  // ── 서울 강남구 ─────────────────────────────────────────────
  { region: "서울 강남구", name: "래미안대치팰리스", address: "서울특별시 강남구 대치동 1027", brand: "래미안", households: 1608, complexPk: "11680120325153" },
  // ── 서울 서초구 ─────────────────────────────────────────────
  { region: "서울 서초구", name: "아크로리버파크", address: "서울특별시 서초구 반포동 2-12", brand: "아크로", households: 1612, complexPk: "11650120345416" },
  // ── 서울 송파구 ─────────────────────────────────────────────
  { region: "서울 송파구", name: "잠실리센츠", address: "서울특별시 송파구 잠실동 22", brand: "리센츠", households: 5563, complexPk: "11710120099495" },
  // ── 서울 강동구 ─────────────────────────────────────────────
  { region: "서울 강동구", name: "고덕그라시움", address: "서울특별시 강동구 상일동 99", brand: "현대건설", households: 4932, complexPk: "11740120394388" },
  // ── 서울 마포구 ─────────────────────────────────────────────
  { region: "서울 마포구", name: "마포래미안푸르지오", address: "서울 마포구 아현동 682-5", brand: "래미안·푸르지오", households: 3885, complexPk: "11440120302058" },
  // ── 서울 용산구 ─────────────────────────────────────────────
  { region: "서울 용산구", name: "한남더힐", address: "서울특별시 용산구 한남동 810", brand: "GS건설", households: 600, complexPk: "11170120135016" },
  // ── 서울 성동구 ─────────────────────────────────────────────
  { region: "서울 성동구", name: "트리마제", address: "서울특별시 성동구 성수동1가 718", brand: "포스코이앤씨", households: 688, complexPk: "11200120351769" },
  // ── 서울 광진구 ─────────────────────────────────────────────
  { region: "서울 광진구", name: "더샵스타시티", address: "서울특별시 광진구 자양동 727", brand: "더샵", households: 1025, complexPk: "11215120064606" },
  // ── 서울 노원구 ─────────────────────────────────────────────
  { region: "서울 노원구", name: "포레나노원", address: "서울 노원구 중계동 512", brand: "한화", households: 1806, complexPk: "11350120417934" },
  // ── 서울 도봉구 ─────────────────────────────────────────────
  { region: "서울 도봉구", name: "래미안도봉", address: "서울 도봉구 방학동 678", brand: "래미안", households: 898, complexPk: "11320100255988" },
  // ── 서울 강북구 ─────────────────────────────────────────────
  { region: "서울 강북구", name: "꿈의숲해링턴플레이스", address: "서울특별시 강북구 번동 425", brand: "해링턴플레이스", households: 1009, complexPk: "11305120394060" },
  // ── 서울 성북구 ─────────────────────────────────────────────
  { region: "서울 성북구", name: "래미안길음센터피스", address: "서울특별시 성북구 길음동 1320", brand: "래미안", households: 1509, complexPk: "11290120384680" },
  // ── 서울 종로구 ─────────────────────────────────────────────
  { region: "서울 종로구", name: "경희궁자이", address: "서울 종로구 송월길 130", brand: "자이", households: 2233, complexPk: "11110120348218" },
  // ── 서울 중구 ───────────────────────────────────────────────
  { region: "서울 중구", name: "서울역센트럴자이", address: "서울특별시 중구 만리동2가 273", brand: "자이", households: 1341, complexPk: "11140120359587" },
  // ── 서울 동대문구 ────────────────────────────────────────────
  { region: "서울 동대문구", name: "래미안크레시티", address: "서울특별시 동대문구 전농동 690", brand: "래미안", households: 2678, complexPk: "11230120330456" },
  // ── 서울 중랑구 ─────────────────────────────────────────────
  { region: "서울 중랑구", name: "사가정센트럴아이파크", address: "서울특별시 중랑구 면목동 1545", brand: "아이파크", households: 1505, complexPk: "11260120411804" },
  // ── 서울 강서구 ─────────────────────────────────────────────
  { region: "서울 강서구", name: "마곡힐스테이트마스터", address: "서울특별시 강서구 마곡동 748", brand: "힐스테이트", households: 1482, complexPk: "11500120330992" },
  // ── 서울 양천구 ─────────────────────────────────────────────
  { region: "서울 양천구", name: "목동신시가지7단지", address: "서울 양천구 신정동 323", brand: "한국토지주택공사", households: 2550, complexPk: "11470100003178" },
  // ── 서울 구로구 ─────────────────────────────────────────────
  { region: "서울 구로구", name: "고척아이파크", address: "서울특별시 구로구 고척동 195", brand: "아이파크", households: 1745, complexPk: "11530120439045" },
  // ── 서울 금천구 ─────────────────────────────────────────────
  { region: "서울 금천구", name: "금천롯데캐슬골드파크3차", address: "서울특별시 금천구 독산동 1155", brand: "롯데캐슬", households: 1236, complexPk: "11545120376467" },
  // ── 서울 영등포구 ────────────────────────────────────────────
  { region: "서울 영등포구", name: "여의도자이", address: "서울특별시 영등포구 여의도동 20", brand: "자이", households: 1420, complexPk: "11560120090966" },
  // ── 서울 동작구 ─────────────────────────────────────────────
  { region: "서울 동작구", name: "아크로리버하임", address: "서울특별시 동작구 흑석동 341", brand: "아크로", households: 1073, complexPk: "11590120381797" },
  // ── 서울 관악구 ─────────────────────────────────────────────
  { region: "서울 관악구", name: "e편한세상서울대입구1단지", address: "서울특별시 관악구 봉천동 1685", brand: "e편한세상", households: 1217, complexPk: "11620120392360" },

  // ── 경기 성남시 분당구 ──────────────────────────────────────
  { region: "경기 성남시 분당구", name: "판교푸르지오그랑블", address: "경기 성남시 분당구 판교동 603-1", brand: "푸르지오", households: 1704, complexPk: "41135120141497" },
  { region: "경기 성남시 분당구", name: "분당파크뷰", address: "경기 성남시 분당구 정자동 6", brand: "삼성물산", households: 1829, complexPk: "41135100080045" },
  // ── 경기 수원시 ─────────────────────────────────────────────
  { region: "경기 수원시 영통구", name: "광교호반베르디움", address: "경기도 수원영통구 원천동 606", brand: "호반건설", households: 1425, complexPk: "41117120292567" },
  { region: "경기 수원시 권선구", name: "수원아이파크시티", address: "경기 수원시 권선구 호매실로 116", brand: "아이파크", households: 5808, complexPk: "41113120341780" },
  // ── 경기 용인시 ─────────────────────────────────────────────
  { region: "경기 용인시 수지구", name: "성복역롯데캐슬", address: "경기 용인시 수지구 성복동 673", brand: "롯데캐슬", households: 2033, complexPk: "41465120392090" },
  { region: "경기 용인시 기흥구", name: "힐스테이트기흥", address: "경기 용인시 기흥구 구갈동 437", brand: "힐스테이트", households: 1888, complexPk: "41463120374461" },
  // ── 경기 화성시 ─────────────────────────────────────────────
  { region: "경기 화성시", name: "동탄역롯데캐슬", address: "경기 화성시 오산동 100", brand: "롯데캐슬", households: 1448, complexPk: "41590120427142" },
  // ── 경기 남양주시 ────────────────────────────────────────────
  { region: "경기 남양주시", name: "별내자이더스타", address: "경기도 남양주시 별내동 999", brand: "자이", households: 740, complexPk: "41360120449174" },
  // ── 경기 고양시 ─────────────────────────────────────────────
  { region: "경기 고양시 일산동구", name: "위시티일산자이2단지", address: "경기도 고양시 일산동구 식사동 1498", brand: "자이", households: 1975, complexPk: "41285120132552" },
  { region: "경기 고양시 덕양구", name: "DMC한강숲중흥S-CLASS", address: "경기도 고양시 덕양구 덕은동", brand: "중흥S-CLASS", households: 0, complexPk: "41281120439651" },
  // ── 경기 파주시 ─────────────────────────────────────────────
  { region: "경기 파주시", name: "힐스테이트더운정", address: "경기도 파주시 목동동 1149", brand: "힐스테이트", households: 2998, complexPk: "41480120373331" },
  // ── 경기 안양시 ─────────────────────────────────────────────
  { region: "경기 안양시 동안구", name: "래미안안양메가트리아", address: "경기도 안양시 만안구 안양동 1393", brand: "래미안", households: 4250, complexPk: "41171120351980" },
  { region: "경기 안양시 만안구", name: "래미안안양메가트리아", address: "경기도 안양시 만안구 안양동 1393", brand: "래미안", households: 4250, complexPk: "41171120351980" },
  // ── 경기 광명시 ─────────────────────────────────────────────
  { region: "경기 광명시", name: "광명역써밋플레이스", address: "경기도 광명시 일직동", brand: "써밋플레이스", households: 0, complexPk: "41210120361627" },
  // ── 경기 시흥시 ─────────────────────────────────────────────
  { region: "경기 시흥시", name: "시흥배곧SK뷰", address: "경기도 시흥시 배곧동 135", brand: "SK뷰", households: 1442, complexPk: "41390120323231" },
  // ── 경기 김포시 ─────────────────────────────────────────────
  { region: "경기 김포시", name: "한강신도시롯데캐슬", address: "경기 김포시 장기동 1232", brand: "롯데캐슬", households: 1610, complexPk: "41570120287416" },
  // ── 경기 하남시 ─────────────────────────────────────────────
  { region: "경기 하남시", name: "미사강변골든센트로", address: "경기도 하남시 망월동", brand: "골든센트로", households: 0, complexPk: "41450120305302" },
  // ── 경기 오산시 ─────────────────────────────────────────────
  { region: "경기 오산시", name: "e편한세상오산세교", address: "경기도 오산시 세교동", brand: "e편한세상", households: 0, complexPk: "41370120363082" },
  // ── 경기 평택시 ─────────────────────────────────────────────
  { region: "경기 평택시", name: "평택지제역자이", address: "경기 평택시 동삭동 650", brand: "자이", complexPk: "41220120446607" },
  // ── 경기 안산시 ─────────────────────────────────────────────
  { region: "경기 안산시", name: "그랑시티자이", address: "경기도 안산시 단원구 고잔동", brand: "자이", households: 0, complexPk: "41271120400507" },
  // ── 경기 부천시 ─────────────────────────────────────────────
  { region: "경기 부천시", name: "리첸시아중동", address: "경기도 부천시 중동", brand: "리첸시아", households: 0, complexPk: "41192120150170" },
  // ── 경기 군포시 ─────────────────────────────────────────────
  { region: "경기 군포시", name: "래미안하이어스", address: "경기 군포시 산본동 1138", brand: "래미안", households: 1236, complexPk: "41410120131799" },
  // ── 경기 의왕시 ─────────────────────────────────────────────
  { region: "경기 의왕시", name: "인덕원푸르지오엘센트로", address: "경기도 의왕시 내손동", brand: "푸르지오", households: 0, complexPk: "41430120395843" },
  // ── 경기 광주시 ─────────────────────────────────────────────
  { region: "경기 광주시", name: "힐스테이트태전", address: "경기 광주시 태전동 524", brand: "힐스테이트", households: 1588, complexPk: "41610120393529" },
  // ── 경기 이천시 ─────────────────────────────────────────────
  { region: "경기 이천시", name: "이천롯데캐슬", address: "경기 이천시 중리동 450", brand: "롯데캐슬", households: 939, complexPk: "41500120382768" },

  // ── 인천 연수구(송도) ─────────────────────────────────────────
  { region: "인천 연수구", name: "더샵송도마리나베이", address: "인천광역시 연수구 송도동 308-1", brand: "더샵", households: 3100, complexPk: "28185120411147" },
  // ── 인천 서구(청라) ───────────────────────────────────────────
  { region: "인천 서구", name: "청라힐스테이트", address: "인천광역시 서구 청라동 103-27", brand: "힐스테이트", households: 224, complexPk: "28260120152518" },
  // ── 인천 남동구 ──────────────────────────────────────────────
  { region: "인천 남동구", name: "구월힐스테이트3단지", address: "인천광역시 남동구 구월동 20", brand: "힐스테이트", households: 474, complexPk: "28200120072065" },
  // ── 인천 부평구 ──────────────────────────────────────────────
  { region: "인천 부평구", name: "부평래미안", address: "인천광역시 부평구 부평동 947", brand: "래미안", households: 1145, complexPk: "28237120306392" },
  // ── 인천 계양구 ──────────────────────────────────────────────
  { region: "인천 계양구", name: "e편한세상계양더프리미어", address: "인천광역시 계양구 효성동 677", brand: "e편한세상", households: 1646, complexPk: "28245120435013" },
];

// target 주소에서 가장 세분화된 매칭 구/시 찾기
// 예: "경기 오산시 가수동" → "경기 오산시" 매칭
export function findLeaderForAddress(address: string): LeaderEntry | undefined {
  if (!address) return undefined;
  // 긴 region 키워드부터 매칭 (구·동 레벨 우선)
  const sorted = [...LEADER_APARTMENTS].sort((a, b) => b.region.length - a.region.length);
  return sorted.find((entry) => address.includes(entry.region));
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
  return LEADER_APARTMENTS.some((entry) => {
    if (address && !address.includes(entry.region)) return false;
    const e = entry.name.replace(/\s/g, "");
    // 한쪽이 다른쪽을 포함하면 같은 단지로 본다 (단, 너무 짧은 부분일치 방지: 4자 이상)
    return n === e || (n.length >= 4 && e.includes(n)) || (e.length >= 4 && n.includes(e));
  });
}
