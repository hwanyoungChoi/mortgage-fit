// qa 태스크 2(스펙 interior-tbd-amount AC-0(c) 2단계·AC-2 2단계, ADR-033 조건 5, ADR-034 조건 4·5): 순수 함수 경계.
// - 줄 쓰기 행렬: 모든 예시 계획(P⁺·M·L·0원·makeFullItem)의 모든 견적 × 금액(비움·0·1·9,999·1,234,500·MAX_WON)으로 고치면
//   고친 견적은 amountWon만(비우면 두 키 없음, undefined 값도 아님), 형제 견적·숨은 값은 그대로, 공용 검증 통과.
// - [줄 추가] R6 미정 확정의 addItem 입력은 스펙 리터럴 그대로.
// - 시트 칸 검증: 빈칸·공백은 미정, 0은 0원, 형식 위반은 오류(쓰기 없음).
// - 계획 관리 PATCH: 어떤 시작 예산·입력이든 두 예산 키를 함께 숫자로 만들지 않는다.
import { describe, expect, it } from "vitest";

import { planSettingsPatch } from "@/containers/Mortgage/Home/planSettingsPatch";
import {
  legacyY,
  makeFullItem,
  makePlanL,
  makePlanM,
  makeSimplePlanPPlus,
} from "@/test/interiorSimpleFixture";
import { createMemoryStorage } from "@/test/memoryStorage";

import {
  toInteriorLineDraft,
  validateInteriorLineDraft,
  interiorLineDraftErrors,
} from "./interiorLineDraft";
import { addLineInput, editLineInput } from "./interiorLineWrites";
import { buildInteriorPlanRows, quoteWonOf } from "./interiorPlanRows";
import { createInteriorPlanStore, INTERIOR_PLANS_STORAGE_KEY } from "./interiorPlanStorage";
import { validateInteriorItemFields } from "./validateInteriorPlan";

import type { InteriorLineDraft, InteriorLineValues } from "@/lib/types/interiorLineDraft";
import type { InteriorItem, InteriorPlanWithItems } from "@/lib/types/interiorPlan";

const MAX_WON = 9_999_999_999_999;

function inputOf(item: InteriorItem) {
  const { id, createdAt, updatedAt, ...input } = item;
  void [id, createdAt, updatedAt];
  return input;
}

/** 0원 계획의 항목: 옛 키 0 · 원 키 0 */
const zeroItem = (): InteriorItem => ({
  id: "z1",
  spaceId: "sp-whole",
  trade: "도배",
  quotes: [
    { id: "zq1", vendor: "셀프도배", amount: 0 },
    { id: "zq2", vendor: "셀프조명", amountWon: 0 },
  ],
  confirmedQuoteId: "zq1",
  status: "planned",
  createdAt: "2026-10-27T00:00:00.000Z",
  updatedAt: "2026-10-27T00:00:00.000Z",
});

const SOURCE_ITEMS: [string, InteriorItem][] = [
  ...makeSimplePlanPPlus().items.map((item): [string, InteriorItem] => [`P⁺ ${item.id}`, item]),
  ...makePlanM().items.map((item): [string, InteriorItem] => [`M ${item.id}`, item]),
  ...makePlanL()
    .items.filter((item) => (item.quotes ?? []).length > 0)
    .map((item): [string, InteriorItem] => [`L ${item.id}`, item]),
  ["0원 z1", zeroItem()],
  ["makeFullItem(진행 중)", makeFullItem("inProgress")],
];

const QUOTE_CASES = SOURCE_ITEMS.flatMap(([name, item]) =>
  (item.quotes ?? []).map((quote): [string, InteriorItem, string] => [
    `${name}/${quote.id}`,
    item,
    quote.id,
  ]),
);

const AMOUNTS: [string, number | undefined][] = [
  ["비움", undefined],
  ["0", 0],
  ["1", 1],
  ["9,999", 9_999],
  ["1,234,500", 1_234_500],
  ["MAX_WON", MAX_WON],
];

describe("줄 수정 행렬: 고친 견적만 amountWon(비우면 두 키 없음), 형제·숨은 값 그대로, 공용 검증 통과", () => {
  it.each(
    QUOTE_CASES.flatMap(([name, item, quoteId]) =>
      AMOUNTS.map(([label, won]): [string, string, InteriorItem, string, number | undefined] => [
        name,
        label,
        item,
        quoteId,
        won,
      ]),
    ),
  )("%s ← %s", (_name, _label, item, quoteId, won) => {
    const original = item.quotes!.find((quote) => quote.id === quoteId)!;
    const values: InteriorLineValues = {
      trade: item.trade,
      vendor: original.vendor!,
      ...(won !== undefined && { amountWon: won }),
      ...(original.memo !== undefined && { detail: original.memo }),
      ...(item.memo !== undefined && { note: item.memo }),
      isConfirmed: item.confirmedQuoteId === quoteId,
    };
    const input = editLineInput(item, quoteId, values, () => "unused");

    const edited = input.quotes!.find((quote) => quote.id === quoteId)!;
    const { amount: _a, amountWon: _w, ...rest } = original;
    void [_a, _w];
    expect(edited).toStrictEqual(won === undefined ? rest : { ...rest, amountWon: won });
    expect(Object.hasOwn(edited, "amount")).toBe(false);
    expect(Object.hasOwn(edited, "amountWon")).toBe(won !== undefined);
    // 형제 견적은 원래 금액 키 그대로(다시 쓰지 않는다)
    expect(input.quotes!.filter((quote) => quote.id !== quoteId)).toStrictEqual(
      item.quotes!.filter((quote) => quote.id !== quoteId),
    );
    // 숨은 값: 견적 외 모든 키가 열어 둔 항목 그대로(같은 칸 값을 다시 넣었으므로)
    const { quotes: _q1, ...hidden } = input;
    const { quotes: _q2, ...openedHidden } = inputOf(item);
    void [_q1, _q2];
    expect(hidden).toStrictEqual(openedHidden);
    expect(validateInteriorItemFields(input)).toStrictEqual(input);
  });
});

describe("시트를 열고 그대로 저장하면 금액(원)이 바뀌지 않는다 (모든 예시 견적)", () => {
  it.each(QUOTE_CASES)("%s", (_name, item, quoteId) => {
    const row = buildInteriorPlanRows({ items: [item] })
      .groups.flatMap((group) => group.rows)
      .find((candidate) => candidate.quote?.id === quoteId)!;
    const draft = toInteriorLineDraft(row);
    const quote = item.quotes!.find((candidate) => candidate.id === quoteId)!;
    const won = quoteWonOf(quote);
    expect(draft.amount).toBe(won === undefined ? "" : String(won));
    const result = validateInteriorLineDraft(draft);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.amountWon).toBe(won);
    expect(Object.hasOwn(result.values, "amountWon")).toBe(won !== undefined);
  });
});

describe("[줄 추가] (AC-2 2단계)", () => {
  const draftOf = (patch: Partial<InteriorLineDraft>): InteriorLineDraft => ({
    trade: "조명",
    vendor: "빛나라조명",
    amount: "",
    detail: "거실 매입등",
    note: "",
    isConfirmed: true,
    ...patch,
  });

  it.each(["", "   "])("R6 견적 %j 확정 → addItem 입력 = 스펙 리터럴(amount 키 없음)", (amount) => {
    const result = validateInteriorLineDraft(draftOf({ amount }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const input = addLineInput("sp-whole", "q-r6", result.values);
    expect(input).toStrictEqual({
      spaceId: "sp-whole",
      trade: "조명",
      quotes: [{ id: "q-r6", vendor: "빛나라조명", memo: "거실 매입등" }],
      confirmedQuoteId: "q-r6",
      status: "planned",
    });
    expect(Object.hasOwn(input.quotes![0], "amount")).toBe(false);
    expect(Object.hasOwn(input.quotes![0], "amountWon")).toBe(false);
    expect(validateInteriorItemFields(input)).toStrictEqual(input);
  });

  it.each([
    ["0", 0],
    [" 0 ", 0],
    ["00", 0],
    ["1,000,000,000", 1_000_000_000],
    ["9,999,999,999,999", MAX_WON],
  ])("견적 %j → amountWon %i", (amount, won) => {
    const result = validateInteriorLineDraft(draftOf({ amount }));
    expect(result.ok && addLineInput("sp-whole", "q", result.values).quotes).toStrictEqual([
      { id: "q", vendor: "빛나라조명", amountWon: won, memo: "거실 매입등" },
    ]);
  });

  it.each([
    ["-1", "숫자만 입력하세요"],
    ["+1", "숫자만 입력하세요"],
    ["1e3", "숫자만 입력하세요"],
    ["1 000", "숫자만 입력하세요"],
    ["１２", "숫자만 입력하세요"],
    ["1.5", "정수(원 단위)로 입력하세요"],
    ["0.0", "정수(원 단위)로 입력하세요"],
    ["10000000000000", "최대 13자리(9,999,999,999,999원)까지 입력할 수 있습니다"],
    ["12a", "숫자만 입력하세요"],
  ])("견적 %j → 견적 칸 오류 '%s', 저장 값 없음", (amount, message) => {
    const draft = draftOf({ amount });
    expect(interiorLineDraftErrors(draft)).toStrictEqual([{ field: "amount", message }]);
    expect(validateInteriorLineDraft(draft)).toStrictEqual({
      ok: false,
      errors: [{ field: "amount", message }],
    });
  });

  it("업체를 비우면 업체 필수 오류(견적 빈칸은 오류가 아니다)", () => {
    expect(interiorLineDraftErrors(draftOf({ vendor: "  " }))).toStrictEqual([
      { field: "vendor", message: "업체 이름을 입력하세요" },
    ]);
  });
});

describe("L의 Y(업체·견적 빈 줄)에 업체만 채우기 (AC-2 2단계)", () => {
  it("견적 1개(금액 없음) 항목, 예산 200·상태·spaceId s0 유지, 확정 없음", () => {
    const result = validateInteriorLineDraft({
      ...toInteriorLineDraft(
        buildInteriorPlanRows(makePlanL())
          .groups.flatMap((group) => group.rows)
          .find((row) => row.item.id === "item-y")!,
      ),
      vendor: "육문수",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const input = editLineInput(legacyY(), null, result.values, () => "new-q");
    expect(input).toStrictEqual({
      spaceId: "s0",
      trade: "도배",
      budget: 200,
      quotes: [{ id: "new-q", vendor: "육문수" }],
      status: "planned",
    });
    expect(validateInteriorItemFields(input)).toStrictEqual(input);
  });
});

describe("계획 관리 PATCH 행렬: 두 예산 키를 함께 숫자로 만들지 않고, 로컬 저장 결과도 한 키뿐", () => {
  const STARTS: [string, Pick<InteriorPlanWithItems, "budget" | "budgetWon">, string][] = [
    ["옛 budget 1000", { budget: 1000 }, "10000000"],
    ["budgetWon 12,345,000", { budgetWon: 12_345_000 }, "12345000"],
    ["예산 없음", {}, ""],
  ];
  const INPUTS = ["", "   ", "1", "999", "10000000", "12345000", "9999999999999"];

  it.each(
    STARTS.flatMap(([name, budgets, opened]) =>
      INPUTS.map(
        (
          typed,
        ): [
          string,
          string,
          Pick<InteriorPlanWithItems, "budget" | "budgetWon">,
          string,
          string,
        ] => [name, typed, budgets, opened, typed],
      ),
    ),
  )("%s ← %j", (_name, _label, budgets, opened, typed) => {
    const patch = planSettingsPatch(
      { name: "섞인 집", budget: opened },
      { name: "섞인 집", budget: typed },
    );
    const typedWon = typed.trim() === "" ? null : Number(typed);
    if (typed === opened) {
      expect(patch).toStrictEqual({});
    } else {
      expect(patch).toStrictEqual({ budget: null, budgetWon: typedWon });
    }

    const { budget: _b, ...plan } = makePlanM();
    void _b;
    const storage = createMemoryStorage({
      [INTERIOR_PLANS_STORAGE_KEY]: JSON.stringify({ plans: [{ ...plan, ...budgets }] }),
    });
    const store = createInteriorPlanStore({
      storage,
      createId: () => "unused",
      now: () => "2026-10-28T00:00:00.000Z",
    });
    if (Object.keys(patch).length > 0) {
      expect(store.updatePlan("plan-m", patch)).toMatchObject({ ok: true });
    }
    const [stored] = (
      JSON.parse(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)!) as { plans: InteriorPlanWithItems[] }
    ).plans;
    expect(Object.hasOwn(stored, "budget") && Object.hasOwn(stored, "budgetWon")).toBe(false);
    if (typed === opened) {
      expect([stored.budget, stored.budgetWon]).toEqual([budgets.budget, budgets.budgetWon]);
    } else {
      expect(Object.hasOwn(stored, "budget")).toBe(false);
      expect(stored.budgetWon).toBe(typedWon ?? undefined);
      expect(Object.hasOwn(stored, "budgetWon")).toBe(typedWon !== null);
    }
  });
});
