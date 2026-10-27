import { describe, expect, it } from "vitest";

import {
  isCalendarDate,
  isInteriorAmount,
  isInteriorId,
  isInteriorItem,
  isInteriorItemStatus,
  isInteriorPlan,
  isInteriorPlanId,
  isIsoTimestamp,
  parseInteriorItem,
  parseInteriorPlan,
  parseInteriorPlanName,
  parseInteriorSpaces,
  validateInteriorItemFields,
  validateInteriorPlanFields,
} from "./validateInteriorPlan";

// 스펙 interior-planner "데이터 모델", AC-0(g), AC-5 / ADR-029 조건 2·11의 경계표.
// 선택 키가 없어야 하는 결과는 toStrictEqual로 본다(toEqual은 값이 undefined인 키를 키 없음과 같게 본다).

const CREATED_AT = "2026-10-26T01:02:03.004Z";
const UPDATED_AT = "2026-10-26T05:06:07.890Z";

const minimalPlan = () => ({
  id: "plan_1",
  name: "우리 집",
  spaces: [{ id: "s1", name: "전체" }],
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
});

const minimalItem = () => ({
  id: "item_1",
  spaceId: "s1",
  trade: "도배",
  status: "planned",
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
});

const quote = (overrides: Record<string, unknown> = {}) => ({
  id: "q1",
  vendor: "가나 인테리어",
  amount: 300,
  ...overrides,
});

const payment = (overrides: Record<string, unknown> = {}) => ({
  id: "p1",
  label: "계약금",
  amount: 100,
  isPaid: false,
  ...overrides,
});

const quotes = (count: number) => Array.from({ length: count }, (_, i) => quote({ id: `q${i}` }));
const payments = (count: number) =>
  Array.from({ length: count }, (_, i) => payment({ id: `p${i}` }));
const spaces = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `s${i}`, name: `방${i}` }));

/** 최소 항목 필드에 덮어쓴 값으로 검증 */
const itemFields = (overrides: Record<string, unknown>) =>
  validateInteriorItemFields({ ...minimalItem(), ...overrides });
/** 최소 플랜 필드에 덮어쓴 값으로 검증 */
const planFields = (overrides: Record<string, unknown>) =>
  validateInteriorPlanFields({ ...minimalPlan(), ...overrides });

describe("최소 플랜·항목 (AC-0(g))", () => {
  it("선택 키가 모두 없는 플랜이 isInteriorPlan을 통과하고 그대로 돌아온다", () => {
    expect(isInteriorPlan(minimalPlan())).toBe(true);
    expect(parseInteriorPlan(minimalPlan())).toStrictEqual(minimalPlan());
  });

  it("선택 키가 모두 없는 항목이 isInteriorItem을 통과하고 그대로 돌아온다", () => {
    expect(isInteriorItem(minimalItem())).toBe(true);
    expect(parseInteriorItem(minimalItem())).toStrictEqual(minimalItem());
  });

  it("선택 키를 모두 채운 플랜·항목도 통과하고 값이 보존된다", () => {
    const plan = { ...minimalPlan(), budget: 5000, listingId: "listing_1" };
    expect(parseInteriorPlan(plan)).toStrictEqual(plan);

    const item = {
      ...minimalItem(),
      budget: 500,
      quotes: [quote({ contact: "010-0000-0000", memo: "실크 벽지" })],
      confirmedQuoteId: "q1",
      payments: [payment({ dueDate: "2026-11-01", isPaid: true })],
      status: "confirmed",
      startDate: "2026-11-01",
      endDate: "2026-11-03",
      memo: "거실 포함",
    };
    expect(parseInteriorItem(item)).toStrictEqual(item);
  });

  it.each([
    ["id", "id"],
    ["name", "name"],
    ["spaces", "spaces"],
    ["createdAt", "createdAt"],
    ["updatedAt", "updatedAt"],
  ])("플랜 필수 키 %s가 없으면 거부", (_, key) => {
    const plan: Record<string, unknown> = minimalPlan();
    delete plan[key];
    expect(isInteriorPlan(plan)).toBe(false);
  });

  it.each(["id", "spaceId", "trade", "status", "createdAt", "updatedAt"])(
    "항목 필수 키 %s가 없으면 거부",
    (key) => {
      const item: Record<string, unknown> = minimalItem();
      delete item[key];
      expect(isInteriorItem(item)).toBe(false);
    },
  );

  it.each([
    ["null", null],
    ["배열", []],
    ["문자열", "plan"],
    ["숫자", 1],
  ])("객체가 아니면(%s) 모두 null", (_, value) => {
    expect(parseInteriorPlan(value)).toBeNull();
    expect(parseInteriorItem(value)).toBeNull();
    expect(validateInteriorPlanFields(value)).toBeNull();
    expect(validateInteriorItemFields(value)).toBeNull();
  });
});

describe("문자열 길이 상한 (trim 후 코드포인트)", () => {
  it("플랜 이름: 40자 통과, 41자 거부, 앞뒤 공백은 떼고 돌려준다", () => {
    expect(parseInteriorPlanName("가".repeat(40))).toBe("가".repeat(40));
    expect(parseInteriorPlanName("가".repeat(41))).toBeNull();
    expect(parseInteriorPlanName(`  ${"가".repeat(40)}  `)).toBe("가".repeat(40));
    expect(parseInteriorPlanName("  우리 집 \t")).toBe("우리 집");
    expect(planFields({ name: "  우리 집  " })?.name).toBe("우리 집");
  });

  it.each([
    ["빈 값", ""],
    ["공백만", "   "],
    ["탭·줄바꿈만", "\t\n"],
    ["전각 공백만", "　"],
    ["null", null],
    ["숫자", 1],
  ])("플랜 이름 %s 거부", (_, value) => {
    expect(parseInteriorPlanName(value)).toBeNull();
    expect(isInteriorPlan({ ...minimalPlan(), name: value })).toBe(false);
  });

  it("길이 단위는 코드포인트: 서로게이트 쌍 문자 40개는 통과, 41개는 거부", () => {
    // "𠀀"(U+20000)·"😀"는 UTF-16 2단위지만 1자로 센다
    expect(parseInteriorPlanName("𠀀".repeat(40))).toBe("𠀀".repeat(40));
    expect(parseInteriorPlanName("😀".repeat(40))).toBe("😀".repeat(40));
    expect(parseInteriorPlanName(`${"가".repeat(39)}😀`)).toBe(`${"가".repeat(39)}😀`);
    expect(parseInteriorPlanName("😀".repeat(41))).toBeNull();
    // 공종 30자도 같은 단위
    expect(itemFields({ trade: "😀".repeat(30) })?.trade).toBe("😀".repeat(30));
    expect(itemFields({ trade: "😀".repeat(31) })).toBeNull();
  });

  it("공간 이름: 20자 통과, 21자 거부, trim해 돌려준다", () => {
    expect(parseInteriorSpaces([{ id: "s1", name: "가".repeat(20) }])).toStrictEqual([
      { id: "s1", name: "가".repeat(20) },
    ]);
    expect(parseInteriorSpaces([{ id: "s1", name: "가".repeat(21) }])).toBeNull();
    expect(parseInteriorSpaces([{ id: "s1", name: " 거실 " }])).toStrictEqual([
      { id: "s1", name: "거실" },
    ]);
    expect(parseInteriorSpaces([{ id: "s1", name: "  " }])).toBeNull();
    expect(parseInteriorSpaces([{ id: "s1" }])).toBeNull();
  });

  it("공종: 30자 통과, 31자 거부, 빈 값·공백만 거부 (AC-5)", () => {
    expect(itemFields({ trade: "가".repeat(30) })?.trade).toBe("가".repeat(30));
    expect(itemFields({ trade: "가".repeat(31) })).toBeNull();
    expect(itemFields({ trade: ` ${"가".repeat(30)} ` })?.trade).toBe("가".repeat(30));
    expect(itemFields({ trade: "" })).toBeNull();
    expect(itemFields({ trade: "   " })).toBeNull();
    expect(itemFields({ trade: 1 })).toBeNull();
  });

  it("견적 업체: 30자 통과, 31자 거부, 빈 칸 거부 (AC-5)", () => {
    expect(itemFields({ quotes: [quote({ vendor: "가".repeat(30) })] })).not.toBeNull();
    expect(itemFields({ quotes: [quote({ vendor: "가".repeat(31) })] })).toBeNull();
    expect(itemFields({ quotes: [quote({ vendor: "" })] })).toBeNull();
    expect(itemFields({ quotes: [quote({ vendor: "  " })] })).toBeNull();
    expect(itemFields({ quotes: [quote({ vendor: undefined })] })).toBeNull();
    expect(itemFields({ quotes: [quote({ vendor: " 가나 " })] })?.quotes?.[0].vendor).toBe("가나");
  });

  it("견적 연락처: 30자 통과, 31자 거부", () => {
    expect(itemFields({ quotes: [quote({ contact: "1".repeat(30) })] })?.quotes?.[0].contact).toBe(
      "1".repeat(30),
    );
    expect(itemFields({ quotes: [quote({ contact: "1".repeat(31) })] })).toBeNull();
  });

  it("견적 메모: 200자 통과, 201자 거부", () => {
    expect(itemFields({ quotes: [quote({ memo: "가".repeat(200) })] })?.quotes?.[0].memo).toBe(
      "가".repeat(200),
    );
    expect(itemFields({ quotes: [quote({ memo: "가".repeat(201) })] })).toBeNull();
  });

  it("항목 메모: 500자 통과, 501자 거부, trim해 돌려준다", () => {
    expect(itemFields({ memo: "가".repeat(500) })?.memo).toBe("가".repeat(500));
    expect(itemFields({ memo: "가".repeat(501) })).toBeNull();
    expect(itemFields({ memo: ` ${"가".repeat(500)} ` })?.memo).toBe("가".repeat(500));
  });

  it("지급 label: 10자 통과, 11자 거부, 빈 값 거부", () => {
    expect(
      itemFields({ payments: [payment({ label: "가".repeat(10) })] })?.payments?.[0].label,
    ).toBe("가".repeat(10));
    expect(itemFields({ payments: [payment({ label: "가".repeat(11) })] })).toBeNull();
    expect(itemFields({ payments: [payment({ label: "" })] })).toBeNull();
    expect(itemFields({ payments: [payment({ label: " " })] })).toBeNull();
  });
});

describe("선택 필드: 빈 값은 키 제거, null은 거부", () => {
  it("빈·공백만 있는 선택 문자열은 키를 쓰지 않는다", () => {
    const result = itemFields({ memo: "   ", quotes: [quote({ contact: "", memo: " \t " })] });
    expect(result).toStrictEqual({
      spaceId: "s1",
      trade: "도배",
      quotes: [{ id: "q1", vendor: "가나 인테리어", amount: 300 }],
      status: "planned",
    });
  });

  it("빈 quotes·payments 배열은 키를 쓰지 않는다", () => {
    expect(itemFields({ quotes: [], payments: [] })).toStrictEqual({
      spaceId: "s1",
      trade: "도배",
      status: "planned",
    });
  });

  it("값이 undefined인 선택 키는 없는 것으로 본다", () => {
    expect(itemFields({ memo: undefined, budget: undefined })).toStrictEqual({
      spaceId: "s1",
      trade: "도배",
      status: "planned",
    });
  });

  it.each([
    ["budget", { budget: null }],
    ["quotes", { quotes: null }],
    ["confirmedQuoteId", { confirmedQuoteId: null }],
    ["payments", { payments: null }],
    ["startDate", { startDate: null }],
    ["endDate", { endDate: null }],
    ["memo", { memo: null }],
    ["quotes[].contact", { quotes: [quote({ contact: null })] }],
    ["quotes[].memo", { quotes: [quote({ memo: null })] }],
    ["payments[].dueDate", { payments: [payment({ dueDate: null })] }],
  ])("항목 선택 필드 %s가 null이면 거부", (_, overrides) => {
    expect(itemFields(overrides)).toBeNull();
  });

  it.each([
    ["budget", { budget: null }],
    ["listingId", { listingId: null }],
  ])("플랜 선택 필드 %s가 null이면 거부", (_, overrides) => {
    expect(planFields(overrides)).toBeNull();
  });

  it("listingId는 매물 id 형식만 받는다", () => {
    expect(planFields({ listingId: "a".repeat(64) })?.listingId).toBe("a".repeat(64));
    expect(planFields({ listingId: "a".repeat(65) })).toBeNull();
    expect(planFields({ listingId: "" })).toBeNull();
    expect(planFields({ listingId: "a/b" })).toBeNull();
  });

  it("quotes·payments가 배열이 아니면 거부", () => {
    expect(itemFields({ quotes: quote() })).toBeNull();
    expect(itemFields({ payments: payment() })).toBeNull();
    expect(itemFields({ quotes: [null] })).toBeNull();
    expect(itemFields({ payments: ["계약금"] })).toBeNull();
  });

  it("지급 isPaid는 boolean만", () => {
    expect(itemFields({ payments: [payment({ isPaid: true })] })?.payments?.[0].isPaid).toBe(true);
    expect(itemFields({ payments: [payment({ isPaid: undefined })] })).toBeNull();
    expect(itemFields({ payments: [payment({ isPaid: "true" })] })).toBeNull();
    expect(itemFields({ payments: [payment({ isPaid: 1 })] })).toBeNull();
  });
});

describe("개수 상한", () => {
  it("공간: 1개·30개 통과, 0개·31개 거부", () => {
    expect(parseInteriorSpaces(spaces(1))).toHaveLength(1);
    expect(parseInteriorSpaces(spaces(30))).toHaveLength(30);
    expect(parseInteriorSpaces(spaces(0))).toBeNull();
    expect(parseInteriorSpaces(spaces(31))).toBeNull();
    expect(planFields({ spaces: spaces(31) })).toBeNull();
    expect(planFields({ spaces: undefined })).toBeNull();
    expect(planFields({ spaces: { id: "s1", name: "전체" } })).toBeNull();
  });

  it("견적: 5개 통과, 6개 거부 (AC-5)", () => {
    expect(itemFields({ quotes: quotes(5) })?.quotes).toHaveLength(5);
    expect(itemFields({ quotes: quotes(6) })).toBeNull();
  });

  it("지급: 5개 통과, 6개 거부", () => {
    expect(itemFields({ payments: payments(5) })?.payments).toHaveLength(5);
    expect(itemFields({ payments: payments(6) })).toBeNull();
  });
});

describe("금액: 만원 정수 1~999,999,999 (ADR-029 조건 2·11)", () => {
  it.each([
    [1, true],
    [999_999_999, true],
    [0, false],
    [-1, false],
    [1_000_000_000, false],
    [123.5, false],
    [0.5, false],
    [999_999_998.9, false],
    [Number.NaN, false],
    [Number.POSITIVE_INFINITY, false],
    ["100", false],
    [null, false],
    [undefined, false],
  ])("isInteriorAmount(%s) → %s", (value, expected) => {
    expect(isInteriorAmount(value)).toBe(expected);
  });

  const amountCases: [string, unknown, boolean][] = [
    ["1", 1, true],
    ["999,999,999", 999_999_999, true],
    ["0", 0, false],
    ["1,000,000,000", 1_000_000_000, false],
    ["123.5(반올림하지 않음)", 123.5, false],
    ["NaN", Number.NaN, false],
    ["문자열", "300", false],
  ];

  it.each(amountCases)("플랜 예산 %s", (_, amount, isValid) => {
    const result = planFields({ budget: amount });
    if (isValid) expect(result?.budget).toBe(amount);
    else expect(result).toBeNull();
  });

  it.each(amountCases)("항목 예산 %s", (_, amount, isValid) => {
    const result = itemFields({ budget: amount });
    if (isValid) expect(result?.budget).toBe(amount);
    else expect(result).toBeNull();
  });

  it.each(amountCases)("견적 금액 %s", (_, amount, isValid) => {
    const result = itemFields({ quotes: [quote({ amount })] });
    if (isValid) expect(result?.quotes?.[0].amount).toBe(amount);
    else expect(result).toBeNull();
  });

  it.each(amountCases)("지급 금액 %s", (_, amount, isValid) => {
    const result = itemFields({ payments: [payment({ amount })] });
    if (isValid) expect(result?.payments?.[0].amount).toBe(amount);
    else expect(result).toBeNull();
  });

  it("견적·지급 금액은 필수", () => {
    expect(itemFields({ quotes: [quote({ amount: undefined })] })).toBeNull();
    expect(itemFields({ payments: [payment({ amount: undefined })] })).toBeNull();
  });
});

describe("날짜 YYYY-MM-DD (실제 달력)", () => {
  it.each([
    ["2026-10-26", true],
    ["2026-12-31", true],
    ["2026-01-01", true],
    ["2028-02-29", true],
    ["2026-13-01", false],
    ["2026-00-10", false],
    ["2026-02-30", false],
    ["2026-02-29", false],
    ["2026-04-31", false],
    ["2026-10-00", false],
    ["2026-1-01", false],
    ["2026/10/26", false],
    ["2026-10-26T00:00:00.000Z", false],
    [" 2026-10-26", false],
    ["", false],
    [20261026, false],
    [null, false],
  ])("isCalendarDate(%s) → %s", (value, expected) => {
    expect(isCalendarDate(value)).toBe(expected);
  });

  it.each(["2026-13-01", "2026-02-30"])("%s는 dueDate·startDate·endDate 모두 거부", (date) => {
    expect(itemFields({ payments: [payment({ dueDate: date })] })).toBeNull();
    expect(itemFields({ startDate: date })).toBeNull();
    expect(itemFields({ endDate: date })).toBeNull();
  });

  it("끝 < 시작은 거부, 같은 날·끝이 뒤·한쪽만 있으면 통과 (AC-5)", () => {
    expect(itemFields({ startDate: "2026-10-26", endDate: "2026-10-25" })).toBeNull();
    expect(itemFields({ startDate: "2026-10-01", endDate: "2026-09-30" })).toBeNull();
    expect(itemFields({ startDate: "2027-01-01", endDate: "2026-12-31" })).toBeNull();
    expect(itemFields({ startDate: "2026-10-26", endDate: "2026-10-26" })).toMatchObject({
      startDate: "2026-10-26",
      endDate: "2026-10-26",
    });
    expect(itemFields({ startDate: "2026-09-30", endDate: "2026-10-01" })).not.toBeNull();
    expect(itemFields({ endDate: "2026-01-01" })).toMatchObject({ endDate: "2026-01-01" });
    expect(itemFields({ startDate: "2026-12-31" })).toMatchObject({ startDate: "2026-12-31" });
  });
});

describe("시각: toISOString 형식만", () => {
  it.each([
    ["2026-10-26T01:02:03.004Z", true],
    [new Date(Date.UTC(2026, 0, 1)).toISOString(), true],
    ["2026-10-26T10:02:03.004+09:00", false],
    ["2026-10-26T01:02:03Z", false],
    ["2026-10-26T01:02:03.0Z", false],
    ["2026-10-26T01:02:03.004", false],
    ["2026-10-26 01:02:03.004Z", false],
    ["2026-10-26", false],
    ["2026-02-30T00:00:00.000Z", false],
    ["2026-10-26T24:00:00.000Z", false],
    ["2026-10-26T01:60:00.000Z", false],
    ["+002026-10-26T01:02:03.004Z", false],
    ["", false],
    [Date.UTC(2026, 9, 26), false],
    [null, false],
  ])("isIsoTimestamp(%s) → %s", (value, expected) => {
    expect(isIsoTimestamp(value)).toBe(expected);
  });

  it("+09:00 형식 createdAt·updatedAt이면 플랜·항목 모두 거부 (AC-5)", () => {
    const offset = "2026-10-26T10:02:03.004+09:00";
    expect(isInteriorPlan({ ...minimalPlan(), createdAt: offset })).toBe(false);
    expect(isInteriorPlan({ ...minimalPlan(), updatedAt: offset })).toBe(false);
    expect(isInteriorItem({ ...minimalItem(), createdAt: offset })).toBe(false);
    expect(isInteriorItem({ ...minimalItem(), updatedAt: offset })).toBe(false);
  });
});

describe("id 유일성 (ADR-029 조건 2, AC-5)", () => {
  it("spaces[].id가 겹치면 거부", () => {
    const duplicated = [
      { id: "s1", name: "거실" },
      { id: "s1", name: "주방" },
    ];
    expect(parseInteriorSpaces(duplicated)).toBeNull();
    expect(planFields({ spaces: duplicated })).toBeNull();
    expect(isInteriorPlan({ ...minimalPlan(), spaces: duplicated })).toBe(false);
  });

  it("quotes[].id가 겹치면 거부", () => {
    expect(itemFields({ quotes: [quote({ id: "q1" }), quote({ id: "q1" })] })).toBeNull();
    expect(itemFields({ quotes: [quote({ id: "q1" }), quote({ id: "q2" })] })).not.toBeNull();
  });

  it("payments[].id가 겹치면 거부", () => {
    expect(itemFields({ payments: [payment({ id: "p1" }), payment({ id: "p1" })] })).toBeNull();
    expect(itemFields({ payments: [payment({ id: "p1" }), payment({ id: "p2" })] })).not.toBeNull();
  });

  it("견적·지급·공간 id도 id 형식이어야 한다", () => {
    expect(itemFields({ quotes: [quote({ id: "q 1" })] })).toBeNull();
    expect(itemFields({ payments: [payment({ id: "" })] })).toBeNull();
    expect(parseInteriorSpaces([{ id: "a".repeat(65), name: "거실" }])).toBeNull();
  });
});

describe("confirmedQuoteId는 quotes 안의 id (AC-5)", () => {
  it("quotes 안에 있으면 통과", () => {
    expect(
      itemFields({ quotes: [quote({ id: "q1" }), quote({ id: "q2" })], confirmedQuoteId: "q2" }),
    ).toMatchObject({ confirmedQuoteId: "q2" });
  });

  it("quotes에 없는 id면 거부", () => {
    expect(itemFields({ quotes: [quote({ id: "q1" })], confirmedQuoteId: "q9" })).toBeNull();
  });

  it("quotes가 없거나 빈 배열이면 거부", () => {
    expect(itemFields({ confirmedQuoteId: "q1" })).toBeNull();
    expect(itemFields({ quotes: [], confirmedQuoteId: "q1" })).toBeNull();
  });

  it("지급 id는 견적 id로 치지 않는다", () => {
    expect(
      itemFields({
        quotes: [quote({ id: "q1" })],
        payments: [payment({ id: "x" })],
        confirmedQuoteId: "x",
      }),
    ).toBeNull();
  });
});

describe("알 수 없는 키는 결과에 없다 (ADR-029 조건 2)", () => {
  it("플랜·공간의 알 수 없는 키를 떼고 새 객체를 돌려준다", () => {
    const input = {
      ...minimalPlan(),
      extra: "x".repeat(10_000),
      spaces: [{ id: "s1", name: "전체", color: "red" }],
    };
    const result = parseInteriorPlan(input);
    expect(result).toStrictEqual(minimalPlan());
    expect(result).not.toBe(input);
    expect(result?.spaces).not.toBe(input.spaces);
    // 입력은 바꾸지 않는다
    expect(input.extra).toHaveLength(10_000);
    expect(input.spaces[0]).toHaveProperty("color", "red");
  });

  it("validateInteriorPlanFields는 id·시각도 결과에 넣지 않는다", () => {
    expect(planFields({ extra: 1 })).toStrictEqual({
      name: "우리 집",
      spaces: [{ id: "s1", name: "전체" }],
    });
  });

  it("항목·견적·지급의 알 수 없는 키를 뗀다", () => {
    const input = {
      ...minimalItem(),
      extra: true,
      quotes: [{ ...quote(), rating: 5 }],
      payments: [{ ...payment(), note: "x" }],
    };
    expect(parseInteriorItem(input)).toStrictEqual({
      ...minimalItem(),
      quotes: [quote()],
      payments: [payment()],
    });
  });

  it("validateInteriorItemFields는 id·시각을 결과에 넣지 않는다", () => {
    expect(itemFields({ extra: 1 })).toStrictEqual({
      spaceId: "s1",
      trade: "도배",
      status: "planned",
    });
  });
});

describe("status", () => {
  it.each(["planned", "quoting", "confirmed", "inProgress", "done"])("%s 통과", (status) => {
    expect(isInteriorItemStatus(status)).toBe(true);
    expect(itemFields({ status })?.status).toBe(status);
  });

  it.each([
    ["대문자", "Planned"],
    ["모르는 값", "cancelled"],
    ["라벨", "계획"],
    ["빈 값", ""],
    ["null", null],
    ["숫자", 0],
  ])("%s 거부", (_, status) => {
    expect(isInteriorItemStatus(status)).toBe(false);
    expect(itemFields({ status })).toBeNull();
  });
});

describe("id 형식", () => {
  it.each([
    ["1자", "a", true],
    ["64자", "a".repeat(64), true],
    ["영숫자·_·-", "Ab_09-z", true],
    ["16바이트 hex(로컬 id)", "0123456789abcdef0123456789abcdef", true],
    ["빈 값", "", false],
    ["65자", "a".repeat(65), false],
    ["공백", "a b", false],
    ["슬래시", "a/b", false],
    ["점", "a.b", false],
    ["한글", "플랜", false],
    ["줄바꿈 꼬리", "abc\n", false],
    ["숫자", 1, false],
    ["null", null, false],
  ])("isInteriorId %s → %s", (_, value, expected) => {
    expect(isInteriorId(value)).toBe(expected);
  });

  it('플랜 id "import"는 거부(경로와 겹침), 비슷한 값은 통과', () => {
    expect(isInteriorPlanId("import")).toBe(false);
    expect(isInteriorPlan({ ...minimalPlan(), id: "import" })).toBe(false);
    expect(isInteriorPlanId("imports")).toBe(true);
    expect(isInteriorPlanId("import_1")).toBe(true);
    expect(isInteriorPlanId("a".repeat(64))).toBe(true);
    expect(isInteriorPlanId("a".repeat(65))).toBe(false);
    expect(isInteriorPlanId("")).toBe(false);
  });

  it('항목·공간 id는 "import"를 막지 않는다(경로 충돌은 플랜 id만)', () => {
    expect(isInteriorId("import")).toBe(true);
    expect(isInteriorItem({ ...minimalItem(), id: "import" })).toBe(true);
  });

  it("항목 id·spaceId 형식이 틀리면 거부", () => {
    expect(isInteriorItem({ ...minimalItem(), id: "a".repeat(65) })).toBe(false);
    expect(isInteriorItem({ ...minimalItem(), spaceId: "s/1" })).toBe(false);
    expect(isInteriorPlan({ ...minimalPlan(), id: "plan 1" })).toBe(false);
  });
});
