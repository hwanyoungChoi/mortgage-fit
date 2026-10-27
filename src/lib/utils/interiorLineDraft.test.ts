// 스펙 interior-simple "줄 시트", AC-2(c) 입력 경계(필수·금액·글자 수·공백)와 AC-4(b) 비고 초기값.
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
  amount: "180",
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

  it("P의 R1 → 구분·업체·견적·세부내용·확정을 그대로", () => {
    expect(toInteriorLineDraft(rowOf(makeSimplePlanP(), "r1:rq1"))).toEqual({
      trade: "도배",
      vendor: "육문수",
      amount: "180",
      detail: "실크 전체",
      note: "",
      isConfirmed: true,
    });
  });

  it("L의 욕실나라(X의 두 번째 견적) → 비고는 항목 메모, 확정 아님", () => {
    expect(toInteriorLineDraft(rowOf(makePlanL(), "item-x:q2"))).toEqual({
      trade: "욕실",
      vendor: "욕실나라",
      amount: "400",
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
    expect(isSameLineDraft(validDraft(), validDraft({ amount: "181" }))).toBe(false);
    expect(isSameLineDraft(validDraft(), validDraft({ isConfirmed: true }))).toBe(false);
  });
});

describe("필수 칸 (AC-2(c))", () => {
  it("구분·업체·견적이 비면 그 칸의 오류(화면 순서), 세부내용·비고는 선택", () => {
    expect(interiorLineDraftErrors(createInteriorLineDraft())).toEqual([
      { field: "trade", message: "구분을 입력하세요" },
      { field: "vendor", message: "업체 이름을 입력하세요" },
      { field: "amount", message: "견적 금액을 입력하세요" },
    ]);
    expect(validateInteriorLineDraft(createInteriorLineDraft()).ok).toBe(false);
  });

  it("오류 순서는 시트 칸 순서(구분 → 세부내용 → 업체 → 견적 → 비고): 첫 오류로 포커스를 옮긴다", () => {
    const draft = createInteriorLineDraft();
    const fields = interiorLineDraftErrors({
      ...draft,
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

  it("업체만 채우고 견적을 비우면 저장이 막힌다", () => {
    const result = validateInteriorLineDraft(validDraft({ amount: "" }));
    expect(result).toEqual({
      ok: false,
      errors: [{ field: "amount", message: "견적 금액을 입력하세요" }],
    });
  });
});

describe("견적 금액 (만원 정수 1~999,999,999, AC-2(c))", () => {
  it.each([
    ["1", 1],
    ["999999999", 999_999_999],
    // 붙여넣은 쉼표·앞뒤 공백은 뗀다
    ["1,000", 1000],
    [" 180 ", 180],
  ])("%j → %i", (amount, value) => {
    const result = validateInteriorLineDraft(validDraft({ amount }));
    expect(result.ok && result.values.amount).toBe(value);
  });

  it.each([
    ["0", "0보다 큰 금액을 입력하세요"],
    ["-1", "숫자만 입력하세요"],
    ["1.5", "정수(만원 단위)로 입력하세요"],
    ["1000000000", "최대 9자리(999,999,999만원)까지 입력할 수 있습니다"],
    ["1,000,000,000", "최대 9자리(999,999,999만원)까지 입력할 수 있습니다"],
    ["12a", "숫자만 입력하세요"],
    ["", "견적 금액을 입력하세요"],
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
        amount: 180,
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
      values: { trade: "도배", vendor: "육문수", amount: 180, isConfirmed: false },
    });
  });

  it("확정 체크는 그대로 넘긴다", () => {
    const result = validateInteriorLineDraft(validDraft({ isConfirmed: true }));
    expect(result.ok && result.values.isConfirmed).toBe(true);
  });
});

// ADR-034 조건 6(qa Q9): 1단계 시트는 만원으로 떨어지는 원 금액만 만원으로 채우고, 아니면 빈칸이다(2단계에서 원 입력으로).
describe("toInteriorLineDraft — 원 단위 견적(예시 M, 1단계)", () => {
  it.each([
    ["m1:mq1", "M1 { amount: 800 }", "800"],
    ["m2:mq2", "M2 { amountWon: 1234500 }", ""],
    ["m3:mq3", "M3 { amountWon: 1235000 }", ""],
    ["m4:mq4", "M4 { amountWon: 999 }", ""],
    ["m5:mq5", "M5 금액 미정", ""],
  ])("%s %s → 견적 칸 %j", (key, _, amount) => {
    expect(toInteriorLineDraft(rowOf(makePlanM(), key)).amount).toBe(amount);
  });

  it("{ amountWon: 12000000 } → '1200', { amountWon: 0 } → ''", () => {
    const plan = makePlanM();
    plan.items[1].quotes = [{ id: "mq2", vendor: "하루바스", amountWon: 12_000_000 }];
    plan.items[2].quotes = [{ id: "mq3", vendor: "욕실나라", amountWon: 0 }];
    expect(toInteriorLineDraft(rowOf(plan, "m2:mq2")).amount).toBe("1200");
    expect(toInteriorLineDraft(rowOf(plan, "m3:mq3")).amount).toBe("");
  });
});
