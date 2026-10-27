// 스펙 interior-simple "수용 기준"의 예시 계획(qa fixture). 옛 P(`interiorPlanFixture.makePlanP`)와 이름이 겹치지 않게 둔다.
// P(새 화면에서 만든 것): 총 예산 1,000, 줄 5개를 R1 → R5 순으로 추가했고 줄마다 견적 1개 항목이다.
// L(옛 화면에서 만든 것): 총 예산 3,000, 공간 [전체 s0, 욕실1 s1, 욕실2 s2], 항목 X → Y → Z 순.
import type {
  InteriorItem,
  InteriorItemStatus,
  InteriorPlanWithItems,
  InteriorQuote,
} from "@/lib/types/interiorPlan";

/** 시각은 `toISOString` 형식. n번째 항목은 n분에 만든다 */
export const simpleTime = (minute: number) =>
  `2026-10-27T00:${String(minute).padStart(2, "0")}:00.000Z`;

/** 새 화면이 만드는 줄 하나 = 견적 1개 항목(`spaceId`는 계획의 첫 공간, 상태 "계획") */
function simpleRow(
  index: number,
  trade: string,
  vendor: string,
  detail: string,
  amount: number,
  isConfirmed: boolean,
): InteriorItem {
  const quoteId = `rq${index}`;
  return {
    id: `r${index}`,
    spaceId: "sp-whole",
    trade,
    quotes: [{ id: quoteId, vendor, amount, memo: detail }],
    ...(isConfirmed && { confirmedQuoteId: quoteId }),
    status: "planned",
    createdAt: simpleTime(index),
    updatedAt: simpleTime(index),
  };
}

/** R1 도배·육문수·실크 전체·180 ✓ */
export const r1 = () => simpleRow(1, "도배", "육문수", "실크 전체", 180, true);
/** R2 도배·동네도배·합지·150 */
export const r2 = () => simpleRow(2, "도배", "동네도배", "합지", 150, false);
/** R3 욕실·하루바스·철거·방수 (1)·370 ✓ */
export const r3 = () => simpleRow(3, "욕실", "하루바스", "철거·방수 (1)", 370, true);
/** R4 욕실·욕실나라·철거·방수 (1)·400 */
export const r4 = () => simpleRow(4, "욕실", "욕실나라", "철거·방수 (1)", 400, false);
/** R5 욕실·하루바스·타일 덧방 (2)·250 ✓ */
export const r5 = () => simpleRow(5, "욕실", "하루바스", "타일 덧방 (2)", 250, true);

/** 계획 P. 부를 때마다 새 객체다 */
export function makeSimplePlanP(
  overrides: Partial<InteriorPlanWithItems> = {},
): InteriorPlanWithItems {
  return {
    id: "plan-simple",
    name: "우리 집",
    budget: 1000,
    spaces: [{ id: "sp-whole", name: "전체" }],
    createdAt: simpleTime(0),
    updatedAt: simpleTime(0),
    items: [r1(), r2(), r3(), r4(), r5()],
    ...overrides,
  };
}

/**
 * X = s1 · 욕실 · 예산 350 · 견적 [q1 하루바스(연락처)·370·"철거·방수", q2 욕실나라·400] · 확정 q1 ·
 * 지급 [계약금 100 · 2026-11-01 · 지급함] · 진행 중 · 2026-11-03~2026-11-07 · 메모 "폐기물 포함"
 */
export const legacyX = (): InteriorItem => ({
  id: "item-x",
  spaceId: "s1",
  trade: "욕실",
  budget: 350,
  quotes: [
    { id: "q1", vendor: "하루바스", contact: "010-1234-5678", amount: 370, memo: "철거·방수" },
    { id: "q2", vendor: "욕실나라", amount: 400 },
  ],
  confirmedQuoteId: "q1",
  payments: [{ id: "pay-x1", label: "계약금", amount: 100, dueDate: "2026-11-01", isPaid: true }],
  status: "inProgress",
  startDate: "2026-11-03",
  endDate: "2026-11-07",
  memo: "폐기물 포함",
  createdAt: simpleTime(1),
  updatedAt: simpleTime(1),
});

/** Y = s0 · 도배 · 예산 200 · 계획 · 견적 없음 */
export const legacyY = (): InteriorItem => ({
  id: "item-y",
  spaceId: "s0",
  trade: "도배",
  budget: 200,
  status: "planned",
  createdAt: simpleTime(2),
  updatedAt: simpleTime(2),
});

/** Z = s2 · 욕실 · 견적 [q3 하루바스·250·"타일 덧방"] · 견적 중 */
export const legacyZ = (): InteriorItem => ({
  id: "item-z",
  spaceId: "s2",
  trade: "욕실",
  quotes: [{ id: "q3", vendor: "하루바스", amount: 250, memo: "타일 덧방" }],
  status: "quoting",
  createdAt: simpleTime(3),
  updatedAt: simpleTime(3),
});

/** 옛 계획 L. 부를 때마다 새 객체다 */
export function makePlanL(overrides: Partial<InteriorPlanWithItems> = {}): InteriorPlanWithItems {
  return {
    id: "plan-l",
    name: "옛 계획",
    budget: 3000,
    spaces: [
      { id: "s0", name: "전체" },
      { id: "s1", name: "욕실1" },
      { id: "s2", name: "욕실2" },
    ],
    createdAt: simpleTime(0),
    updatedAt: simpleTime(0),
    items: [legacyX(), legacyY(), legacyZ()],
    ...overrides,
  };
}

/**
 * 모든 선택 키가 채워진 항목(AC-0(c) c3): 예산 · 견적 2개(연락처·메모 포함, 금액은 fq1 `amount` 만원·fq2 `amountWon` 원) ·
 * 확정 · 지급 2줄(지급함/미지급, 예정일) · 시작·끝 · 메모. 상태만 바꿔 5종 각각으로 쓴다
 */
export const makeFullItem = (status: InteriorItemStatus): InteriorItem => ({
  id: "item-full",
  spaceId: "s1",
  trade: "욕실",
  budget: 350,
  quotes: [
    { id: "fq1", vendor: "하루바스", contact: "010-1234-5678", amount: 370, memo: "철거·방수" },
    {
      id: "fq2",
      vendor: "욕실나라",
      contact: "02-123-4567",
      amountWon: 4_000_000,
      memo: "도기 포함",
    },
  ],
  confirmedQuoteId: "fq1",
  payments: [
    { id: "fp1", label: "계약금", amount: 100, dueDate: "2026-11-01", isPaid: true },
    { id: "fp2", label: "잔금", amount: 270, dueDate: "2026-11-20", isPaid: false },
  ],
  status,
  startDate: "2026-11-03",
  endDate: "2026-11-07",
  memo: "폐기물 포함",
  createdAt: simpleTime(9),
  updatedAt: simpleTime(9),
});

/** P의 CSV 본문 줄(BOM·CRLF 뺀 모양, AC-5): 머리 + 줄 5 + 계 = 7행 */
export const SIMPLE_P_CSV_LINES = [
  "구분,업체,세부내용,견적(원),확정(원),비고",
  "도배,육문수,실크 전체,1800000,1800000,",
  "도배,동네도배,합지,1500000,,",
  "욕실,하루바스,철거·방수 (1),3700000,3700000,",
  "욕실,욕실나라,철거·방수 (1),4000000,,",
  "욕실,하루바스,타일 덧방 (2),2500000,2500000,",
  "계,,,,8000000,",
];

/** L의 CSV 본문 줄(AC-5): 머리 + 줄 4 + 계 = 6행. 옛 비고 조각("미확정"·"최저"·"초과")이 없다 */
export const LEGACY_L_CSV_LINES = [
  "구분,업체,세부내용,견적(원),확정(원),비고",
  "욕실,하루바스,철거·방수,3700000,3700000,폐기물 포함",
  "욕실,욕실나라,,4000000,,폐기물 포함",
  "욕실,하루바스,타일 덧방,2500000,,",
  '도배,,,,,"예산 2,000,000원"',
  "계,,,,3700000,",
];

/** CSV 파일 전체: 맨 앞 BOM(U+FEFF) 하나, 모든 줄 끝(마지막 줄 포함) CRLF */
export const toCsvFile = (lines: string[]) =>
  "\uFEFF" + lines.map((line) => `${line}\r\n`).join("");

// 스펙 interior-tbd-amount "수용 기준"의 예시 P⁺: P의 R1~R5 뒤에 금액 미정 줄 R6·R7을 이 순서로 더한다(총 예산 1,000).

/** 금액 미정 줄 = 견적 1개 항목, 견적에 `amount` 키가 없다(ADR-033). 세부내용이 null이면 `memo` 키도 없다 */
function tbdRow(
  index: number,
  trade: string,
  vendor: string,
  detail: string | null,
  isConfirmed: boolean,
): InteriorItem {
  const quoteId = `rq${index}`;
  return {
    id: `r${index}`,
    spaceId: "sp-whole",
    trade,
    quotes: [{ id: quoteId, vendor, ...(detail !== null && { memo: detail }) }],
    ...(isConfirmed && { confirmedQuoteId: quoteId }),
    status: "planned",
    createdAt: simpleTime(index),
    updatedAt: simpleTime(index),
  };
}

/** R6 조명·빛나라조명·거실 매입등·금액 없음 ✓ */
export const r6 = () => tbdRow(6, "조명", "빛나라조명", "거실 매입등", true);
/** R7 도배·한솔도배·세부내용 없음·금액 없음(미확정) */
export const r7 = () => tbdRow(7, "도배", "한솔도배", null, false);

/** 계획 P⁺ = P + R6·R7. 부를 때마다 새 객체다 */
export function makeSimplePlanPPlus(
  overrides: Partial<InteriorPlanWithItems> = {},
): InteriorPlanWithItems {
  return makeSimplePlanP({ items: [r1(), r2(), r3(), r4(), r5(), r6(), r7()], ...overrides });
}

/** P⁺의 CSV 본문 줄(AC-3): 머리 + 줄 7 + 계 = 9행 */
export const SIMPLE_P_PLUS_CSV_LINES = [
  "구분,업체,세부내용,견적(원),확정(원),비고",
  "도배,육문수,실크 전체,1800000,1800000,",
  "도배,동네도배,합지,1500000,,",
  "도배,한솔도배,,미정,,",
  "욕실,하루바스,철거·방수 (1),3700000,3700000,",
  "욕실,욕실나라,철거·방수 (1),4000000,,",
  "욕실,하루바스,타일 덧방 (2),2500000,2500000,",
  "조명,빛나라조명,거실 매입등,미정,미정,",
  "계,,,,8000000,금액 미정 1건 제외",
];

// ADR-034 조건 8(qa Q4)의 예시 M: 옛 키(만원)와 원 단위 키가 섞인 계획. 총 예산 1,000만원(옛 키), 줄 5개를 M1 → M5 순으로 더했다.
// 확정 M1 `{amount: 800}`·M2 `{amountWon: 1234500}`·M3 `{amountWon: 1235000}`, 미확정 M4 `{amountWon: 999}`, 확정 미정 M5.
// 지출 예정 8,000,000 + 1,234,500 + 1,235,000 = 10,469,500원, 예산 초과 469,500원, 미정 1건.
// 총 예산을 `{ budgetWon: 12000000 }`으로 바꾸면 남은 예산 1,530,500원이다.
// M2(123.45만원)와 M3(123.5만원)는 원 → 만원 내림·반올림 오류를, M1은 만원을 원으로 읽는 오류를 가른다.

/** 예시 M의 줄 하나 = 견적 1개 항목. 금액 키는 받은 그대로(없으면 미정) */
function mixedRow(
  index: number,
  trade: string,
  vendor: string,
  amountKeys: Pick<InteriorQuote, "amount" | "amountWon">,
  isConfirmed: boolean,
): InteriorItem {
  const quoteId = `mq${index}`;
  return {
    id: `m${index}`,
    spaceId: "sp-whole",
    trade,
    quotes: [{ id: quoteId, vendor, ...amountKeys }],
    ...(isConfirmed && { confirmedQuoteId: quoteId }),
    status: "planned",
    createdAt: simpleTime(index),
    updatedAt: simpleTime(index),
  };
}

/** M1 도배·육문수·800만원(옛 키) ✓ */
export const m1 = () => mixedRow(1, "도배", "육문수", { amount: 800 }, true);
/** M2 욕실·하루바스·1,234,500원 ✓ */
export const m2 = () => mixedRow(2, "욕실", "하루바스", { amountWon: 1_234_500 }, true);
/** M3 욕실·욕실나라·1,235,000원 ✓ */
export const m3 = () => mixedRow(3, "욕실", "욕실나라", { amountWon: 1_235_000 }, true);
/** M4 조명·빛나라조명·999원(미확정) */
export const m4 = () => mixedRow(4, "조명", "빛나라조명", { amountWon: 999 }, false);
/** M5 조명·한빛전기·금액 미정 ✓ */
export const m5 = () => mixedRow(5, "조명", "한빛전기", {}, true);

/** 계획 M. 부를 때마다 새 객체다 */
export function makePlanM(overrides: Partial<InteriorPlanWithItems> = {}): InteriorPlanWithItems {
  return {
    id: "plan-m",
    name: "섞인 집",
    budget: 1000,
    spaces: [{ id: "sp-whole", name: "전체" }],
    createdAt: simpleTime(0),
    updatedAt: simpleTime(0),
    items: [m1(), m2(), m3(), m4(), m5()],
    ...overrides,
  };
}

/** M의 CSV 본문 줄: 머리 + 줄 5 + 계 = 7행(총 예산은 CSV에 없어 두 총 예산에서 같다) */
export const PLAN_M_CSV_LINES = [
  "구분,업체,세부내용,견적(원),확정(원),비고",
  "도배,육문수,,8000000,8000000,",
  "욕실,하루바스,,1234500,1234500,",
  "욕실,욕실나라,,1235000,1235000,",
  "조명,빛나라조명,,999,,",
  "조명,한빛전기,,미정,미정,",
  "계,,,,10469500,금액 미정 1건 제외",
];
