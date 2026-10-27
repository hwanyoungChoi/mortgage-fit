// 스펙 interior-simple "줄 시트", AC-2(c) 입력 경계(필수·금액·글자 수·공백)와 AC-4(b) 비고 초기값.
// 견적은 2단계(스펙 interior-tbd-amount AC-2 2단계, ADR-034): 원 단위 0~MAX_WON, 비우면 미정.
import { describe, expect, it } from "vitest";

import { makePlanL, makePlanM, makeSimplePlanP } from "@/test/interiorSimpleFixture";

import {
  createInteriorLineDraft,
  interiorLineDraftErrors,
  isSameLineDraft,
  toInteriorLineDraft,
  validateInteriorLineDraft,
} from "./interiorLineDraft";
import { buildInteriorPlanRows } from "./interiorPlanRows";

import type { InteriorLineDraft, InteriorLineDraftField } from "@/lib/types/interiorLineDraft";
import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";

/** 저장할 수 있는 줄(R1과 같은 값) */
const validDraft = (patch: Partial<InteriorLineDraft> = {}): InteriorLineDraft => ({
  ...createInteriorLineDraft("도배"),
  vendor: "육문수",
  amount: "1800000",
  detail: "실크 전체",
  ...patch,
});

const errorOf = (draft: InteriorLineDraft, field: InteriorLineDraftField) =>
  interiorLineDraftErrors(draft).find((error) => error.field === field)?.message ?? null;

const rowOf = (plan: InteriorPlanWithItems, key: string) => {
  const row = buildInteriorPlanRows(plan)
    .groups.flatMap((group) => group.rows)
    .find((candidate) => candidate.key === key);
  if (row === undefined) throw new Error(`줄 ${key} 없음`);
  return row;
};

describe("createInteriorLineDraft / toInteriorLineDraft", () => {
  it("새 줄은 빈 칸·확정 꺼짐, 묶음 끝 [+ 줄 추가]면 구분만 채운다", () => {
    expect(createInteriorLineDraft()).toEqual({
      trade: "",
      vendor: "",
      amount: "",
      detail: "",
      note: "",
      isConfirmed: false,
    });
    expect(createInteriorLineDraft("욕실").trade).toBe("욕실");
  });

  it("P의 R1(만원 180) → 구분·업체·견적(원 글자)·세부내용·확정을 그대로", () => {
    expect(toInteriorLineDraft(rowOf(makeSimplePlanP(), "r1:rq1"))).toEqual({
      trade: "도배",
      vendor: "육문수",
      amount: "1800000",
      detail: "실크 전체",
      note: "",
      isConfirmed: true,
    });
  });

  it("L의 욕실나라(X의 두 번째 견적) → 비고는 항목 메모, 확정 아님", () => {
    expect(toInteriorLineDraft(rowOf(makePlanL(), "item-x:q2"))).toEqual({
      trade: "욕실",
      vendor: "욕실나라",
      amount: "4000000",
      detail: "",
      note: "폐기물 포함",
      isConfirmed: false,
    });
  });

  it("L의 Y(견적 0개, 예산 200) → 업체·견적 빈칸, 비고는 비어 있다(합성 '예산 200만원'이 아님, AC-4(b))", () => {
    expect(toInteriorLineDraft(rowOf(makePlanL(), "item-y:"))).toEqual({
      trade: "도배",
      vendor: "",
      amount: "",
      detail: "",
      note: "",
      isConfirmed: false,
    });
  });

  it("isSameLineDraft: 칸 하나·확정 하나만 달라도 다르다", () => {
    expect(isSameLineDraft(validDraft(), validDraft())).toBe(true);
    expect(isSameLineDraft(validDraft(), validDraft({ amount: "1800001" }))).toBe(false);
    expect(isSameLineDraft(validDraft(), validDraft({ isConfirmed: true }))).toBe(false);
  });
});

describe("필수 칸 (AC-2(c))", () => {
  it("구분·업체가 비면 그 칸의 오류(화면 순서), 견적(비우면 미정)·세부내용·비고는 선택", () => {
    expect(interiorLineDraftErrors(createInteriorLineDraft())).toEqual([
      { field: "trade", message: "구분을 입력하세요" },
      { field: "vendor", message: "업체 이름을 입력하세요" },
    ]);
    expect(validateInteriorLineDraft(createInteriorLineDraft()).ok).toBe(false);
  });

  it("오류 순서는 시트 칸 순서(구분 → 세부내용 → 업체 → 견적 → 비고): 첫 오류로 포커스를 옮긴다", () => {
    const draft = createInteriorLineDraft();
    const fields = interiorLineDraftErrors({
      ...draft,
      amount: "12a",
      detail: "가".repeat(201),
      note: "가".repeat(501),
    }).map((error) => error.field);
    expect(fields).toEqual(["trade", "detail", "vendor", "amount", "note"]);
  });

  it('구분·업체 "   " → 필수 오류', () => {
    const draft = validDraft({ trade: "   ", vendor: "   " });
    expect(errorOf(draft, "trade")).toBe("구분을 입력하세요");
    expect(errorOf(draft, "vendor")).toBe("업체 이름을 입력하세요");
  });

  it.each(["", "   "])("견적 %j → 오류 없이 미정(amountWon 키 없음, U1)", (amount) => {
    const draft = validDraft({ amount });
    expect(interiorLineDraftErrors(draft)).toEqual([]);
    const result = validateInteriorLineDraft(draft);
    expect(result).toStrictEqual({
      ok: true,
      values: {
        trade: "도배",
        vendor: "육문수",
        detail: "실크 전체",
        isConfirmed: false,
      },
    });
    expect(result.ok && Object.hasOwn(result.values, "amountWon")).toBe(false);
  });
});

describe("견적 금액 (원 정수 0~9,999,999,999,999, ADR-034·ADR-033 개정)", () => {
  it.each([
    // 0원은 셀프 시공(미정이 아니다)
    ["0", 0],
    ["1", 1],
    ["9999", 9999],
    ["9999999999999", 9_999_999_999_999],
    // 만원 상한(999,999,999)을 넘는 원 금액도 받는다
    ["1,000,000,000", 1_000_000_000],
    // 붙여넣은 쉼표·앞뒤 공백은 뗀다
    ["1,234,500", 1_234_500],
    [" 180 ", 180],
  ])("%j → amountWon %i", (amount, value) => {
    const result = validateInteriorLineDraft(validDraft({ amount }));
    expect(result.ok && result.values.amountWon).toBe(value);
  });

  it.each([
    ["-1", "숫자만 입력하세요"],
    ["1.5", "정수(원 단위)로 입력하세요"],
    ["10000000000000", "최대 13자리(9,999,999,999,999원)까지 입력할 수 있습니다"],
    ["10,000,000,000,000", "최대 13자리(9,999,999,999,999원)까지 입력할 수 있습니다"],
    ["12a", "숫자만 입력하세요"],
  ])("%j → 오류 %j(저장 안 함)", (amount, message) => {
    const draft = validDraft({ amount });
    expect(errorOf(draft, "amount")).toBe(message);
    expect(validateInteriorLineDraft(draft).ok).toBe(false);
  });
});

describe("글자 수(코드포인트, 앞뒤 공백 뗀 뒤) (AC-2(c))", () => {
  it.each<[InteriorLineDraftField, number]>([
    ["trade", 30],
    ["vendor", 30],
    ["detail", 200],
    ["note", 500],
  ])("%s: %i자 통과, 하나 더 많으면 '(현재 n자)' 오류", (field, maxLength) => {
    expect(errorOf(validDraft({ [field]: "가".repeat(maxLength) }), field)).toBeNull();
    expect(errorOf(validDraft({ [field]: "가".repeat(maxLength + 1) }), field)).toBe(
      `${maxLength}자 이하로 입력하세요(현재 ${maxLength + 1}자)`,
    );
  });

  it("이모지는 한 글자로 센다: 구분 이모지 30개 통과, 31개 오류", () => {
    expect(errorOf(validDraft({ trade: "🏠".repeat(30) }), "trade")).toBeNull();
    expect(errorOf(validDraft({ trade: "🏠".repeat(31) }), "trade")).toBe(
      "30자 이하로 입력하세요(현재 31자)",
    );
  });

  it("앞뒤 공백은 세지 않는다: 구분 '  ' + 30자 + '  ' 통과", () => {
    expect(errorOf(validDraft({ trade: `  ${"가".repeat(30)}  ` }), "trade")).toBeNull();
  });
});

describe("validateInteriorLineDraft 값 (trim·빈 선택 칸)", () => {
  it('"  도배  " → trade "도배", 업체·세부내용·비고도 앞뒤 공백을 뗀다', () => {
    const result = validateInteriorLineDraft(
      validDraft({ trade: "  도배  ", vendor: " 육문수 ", detail: " 실크 ", note: " 메모 " }),
    );
    expect(result).toStrictEqual({
      ok: true,
      values: {
        trade: "도배",
        vendor: "육문수",
        amountWon: 1_800_000,
        detail: "실크",
        note: "메모",
        isConfirmed: false,
      },
    });
  });

  it('세부내용·비고 "   " → 오류 없이 키 없음', () => {
    const draft = validDraft({ detail: "   ", note: "   " });
    expect(interiorLineDraftErrors(draft)).toEqual([]);
    expect(validateInteriorLineDraft(draft)).toStrictEqual({
      ok: true,
      values: { trade: "도배", vendor: "육문수", amountWon: 1_800_000, isConfirmed: false },
    });
  });

  it("확정 체크는 그대로 넘긴다", () => {
    const result = validateInteriorLineDraft(validDraft({ isConfirmed: true }));
    expect(result.ok && result.values.isConfirmed).toBe(true);
  });
});

// ADR-034 2단계: 시트는 저장된 금액을 원 글자로 채운다(옛 만원 `amount`도 `quoteWonOf`로 원). 미정만 빈칸이다.
describe("toInteriorLineDraft — 원 단위 견적(예시 M, 2단계)", () => {
  it.each([
    ["m1:mq1", "M1 { amount: 800 }", "8000000"],
    ["m2:mq2", "M2 { amountWon: 1234500 }", "1234500"],
    ["m3:mq3", "M3 { amountWon: 1235000 }", "1235000"],
    ["m4:mq4", "M4 { amountWon: 999 }", "999"],
    ["m5:mq5", "M5 금액 미정", ""],
  ])("%s %s → 견적 칸 %j", (key, _, amount) => {
    expect(toInteriorLineDraft(rowOf(makePlanM(), key)).amount).toBe(amount);
  });

  it("{ amountWon: 0 } → '0'(빈칸이 아니다), { amount: 0 } → '0', { amountWon: 9,999,999,999,999 } → 13자리 그대로", () => {
    const plan = makePlanM();
    plan.items[1].quotes = [{ id: "mq2", vendor: "하루바스", amountWon: 0 }];
    plan.items[2].quotes = [{ id: "mq3", vendor: "욕실나라", amount: 0 }];
    plan.items[3].quotes = [{ id: "mq4", vendor: "빛나라조명", amountWon: 9_999_999_999_999 }];
    expect(toInteriorLineDraft(rowOf(plan, "m2:mq2")).amount).toBe("0");
    expect(toInteriorLineDraft(rowOf(plan, "m3:mq3")).amount).toBe("0");
    expect(toInteriorLineDraft(rowOf(plan, "m4:mq4")).amount).toBe("9999999999999");
  });

  it("채운 칸을 그대로 검증하면 같은 원 금액이다(열고 저장만 해도 금액이 바뀌지 않는다)", () => {
    const draft = toInteriorLineDraft(rowOf(makePlanM(), "m1:mq1"));
    const result = validateInteriorLineDraft(draft);
    expect(result.ok && result.values.amountWon).toBe(8_000_000);
  });
});
