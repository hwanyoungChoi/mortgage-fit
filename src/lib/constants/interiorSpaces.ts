// 플랜을 만들 때 고르는 방·욕실 수와 기본 공간 이름(스펙 interior-planner U2, AC-1).
// 만든 뒤에는 [공간 편집]에서 이름 바꾸기·추가·삭제한다.

/** 방 수 선택지(기본 3) */
export const INTERIOR_ROOM_COUNTS: readonly number[] = [1, 2, 3, 4, 5];
export const DEFAULT_INTERIOR_ROOM_COUNT = 3;

/** 욕실 수 선택지(기본 2) */
export const INTERIOR_BATHROOM_COUNTS: readonly number[] = [1, 2, 3];
export const DEFAULT_INTERIOR_BATHROOM_COUNT = 2;

/** 집 전체 공간. 기본 공간의 맨 앞이고, 매물 추가 비용에서 가져온 항목이 들어간다(스펙 U7) */
export const INTERIOR_WHOLE_SPACE_NAME = "전체";

/** 기본 공간: 앞쪽 공간(맨 앞은 전체) → 욕실1..m → 방1..n → 뒤쪽 공간 */
export const INTERIOR_LEADING_SPACE_NAMES: readonly string[] = [
  INTERIOR_WHOLE_SPACE_NAME,
  "현관",
  "거실",
  "주방",
];
export const INTERIOR_BATHROOM_SPACE_PREFIX = "욕실";
export const INTERIOR_ROOM_SPACE_PREFIX = "방";
export const INTERIOR_TRAILING_SPACE_NAMES: readonly string[] = ["베란다"];

/** 항목이 가리키는 공간이 플랜에 없을 때(동시 편집으로 지워짐) 묶는 그룹 이름(A6) */
export const INTERIOR_NO_SPACE_LABEL = "공간 없음";
