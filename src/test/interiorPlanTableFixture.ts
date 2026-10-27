// 스펙 interior-planner "수용 기준"의 예시 플랜 Q(태스크 5 fixture, 사용자 스샷을 옮긴 것)와 기대 표·CSV(줄 모델, interior-simple).
// 공간은 P와 같은 기본값(방 3·욕실 2). 항목은 q1 → q5 순서로 만든다.
import { P_SPACES, pTime } from "./interiorPlanFixture";

import type { InteriorItem, InteriorPlanWithItems } from "@/lib/types/interiorPlan";

/** q1 전체/바닥 예산 200, 견적 육문수 180 메모 "2.2T 장판", 확정 */
export const qFloor = (): InteriorItem => ({
  id: "q1-floor",
  spaceId: "sp-all",
  trade: "바닥",
  budget: 200,
  quotes: [{ id: "qq-1", vendor: "육문수", amount: 180, memo: "2.2T 장판" }],
  confirmedQuoteId: "qq-1",
  status: "confirmed",
  createdAt: pTime(1),
  updatedAt: pTime(1),
});

/** q2 전체/필름 예산 없음, 견적 숨고_빛인테리어필름 200 메모 "샷시·몰딩", 확정 */
export const qFilm = (): InteriorItem => ({
  id: "q2-film",
  spaceId: "sp-all",
  trade: "필름",
  quotes: [{ id: "qq-2", vendor: "숨고_빛인테리어필름", amount: 200, memo: "샷시·몰딩" }],
  confirmedQuoteId: "qq-2",
  status: "confirmed",
  createdAt: pTime(2),
  updatedAt: pTime(2),
});

/** q3 욕실1/욕실 예산 300, 견적 숨고_하루바스 370 메모 "철거, 방수, 도기 교체"(확정)·욕실나라 400, 항목 메모 "폐기물처리 포함" */
export const qBath1 = (): InteriorItem => ({
  id: "q3-bath1",
  spaceId: "sp-bath1",
  trade: "욕실",
  budget: 300,
  quotes: [
    { id: "qq-3a", vendor: "숨고_하루바스", amount: 370, memo: "철거, 방수, 도기 교체" },
    { id: "qq-3b", vendor: "욕실나라", amount: 400 },
  ],
  confirmedQuoteId: "qq-3a",
  memo: "폐기물처리 포함",
  status: "confirmed",
  createdAt: pTime(3),
  updatedAt: pTime(3),
});

/** q4 욕실2/욕실 예산 250, 견적 숨고_하루바스 250 메모 "타일 덧방"·동네욕실 230(메모 없음), 미확정 */
export const qBath2 = (): InteriorItem => ({
  id: "q4-bath2",
  spaceId: "sp-bath2",
  trade: "욕실",
  budget: 250,
  quotes: [
    { id: "qq-4a", vendor: "숨고_하루바스", amount: 250, memo: "타일 덧방" },
    { id: "qq-4b", vendor: "동네욕실", amount: 230 },
  ],
  status: "quoting",
  createdAt: pTime(4),
  updatedAt: pTime(4),
});

/** q5 거실/에어컨(직접 입력) 예산 150, 견적 없음, 항목 메모 "추후 구매" */
export const qAircon = (): InteriorItem => ({
  id: "q5-aircon",
  spaceId: "sp-living",
  trade: "에어컨",
  budget: 150,
  memo: "추후 구매",
  status: "planned",
  createdAt: pTime(5),
  updatedAt: pTime(5),
});

/** 플랜 Q. 부를 때마다 새 객체다 */
export function makePlanQ(overrides: Partial<InteriorPlanWithItems> = {}): InteriorPlanWithItems {
  return {
    id: "plan-q",
    name: "우리 집",
    budget: 1500,
    spaces: P_SPACES.map((space) => ({ ...space })),
    createdAt: pTime(0),
    updatedAt: pTime(0),
    items: [qFloor(), qFilm(), qBath1(), qBath2(), qAircon()],
    ...overrides,
  };
}

/**
 * Q 표의 줄([구분, 업체, 세부내용, 견적(원), 확정(원), 비고], 화면 표기, 구분은 묶음 첫 줄에만). 계 줄 포함.
 * 줄 = (항목, 견적) 한 쌍이고 묶음은 처음 나온 구분 순(스펙 interior-simple). 계는 확정 칸만이다(U6)
 */
export const Q_TABLE_TEXT: string[][] = [
  ["바닥", "육문수", "2.2T 장판", "1,800,000", "1,800,000", ""],
  ["필름", "숨고_빛인테리어필름", "샷시·몰딩", "2,000,000", "2,000,000", ""],
  ["욕실", "숨고_하루바스", "철거, 방수, 도기 교체", "3,700,000", "3,700,000", "폐기물처리 포함"],
  ["욕실나라", "", "4,000,000", "", "폐기물처리 포함"],
  ["숨고_하루바스", "타일 덧방", "2,500,000", "", ""],
  ["동네욕실", "", "2,300,000", "", ""],
  ["에어컨", "", "", "", "", "추후 구매 · 예산 1,500,000원"],
  ["계", "", "", "", "7,500,000", ""],
];

/** Q CSV 본문 줄(BOM·CRLF 뺀 모양). 구분은 매 줄 반복한다 */
export const Q_CSV_LINES = [
  "구분,업체,세부내용,견적(원),확정(원),비고",
  "바닥,육문수,2.2T 장판,1800000,1800000,",
  "필름,숨고_빛인테리어필름,샷시·몰딩,2000000,2000000,",
  '욕실,숨고_하루바스,"철거, 방수, 도기 교체",3700000,3700000,폐기물처리 포함',
  "욕실,욕실나라,,4000000,,폐기물처리 포함",
  "욕실,숨고_하루바스,타일 덧방,2500000,,",
  "욕실,동네욕실,,2300000,,",
  '에어컨,,,,,"추후 구매 · 예산 1,500,000원"',
  "계,,,,7500000,",
];

/** 파일 전체: 맨 앞 BOM(U+FEFF) 하나, 모든 줄 끝(마지막 줄 포함) CRLF */
export const Q_CSV = "﻿" + Q_CSV_LINES.map((line) => `${line}\r\n`).join("");

export const Q_FILE_NAME = "우리 집-인테리어-2026-10-27.csv";
