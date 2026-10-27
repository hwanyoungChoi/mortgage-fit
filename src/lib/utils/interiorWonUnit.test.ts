// ADR-034 조건 3·7(qa Q2·Q7): 견적 `amountWon`·총 예산 `budgetWon`(원 정수) 검증 경계와 보존.
// - 검증은 공용 `validateInteriorPlan.ts` 한 곳이고, 같은 뜻의 두 키(`amount`·`amountWon`, `budget`·`budgetWon`)가 함께 있으면 거부한다.
// - 파서는 저장 형태를 바꾸지 않는다(옛 키를 새 키로 정규화하지 않음). 로컬 쓰기는 스냅샷 전체를 다시 쓰므로,
//   다른 계획을 쓴 뒤에도 새 키를 가진 계획이 원문에서 그대로인지 `toStrictEqual`로 본다.
// 선택 키가 없어야 하는 결과는 toStrictEqual·Object.hasOwn으로 본다(toEqual은 undefined 키를 키 없음과 같게 본다).
import { describe, expect, it } from "vitest";

import { MAX_WON } from "@/lib/constants/interiorPlan";
import { P_SPACES, pTime, toStoredPlans } from "@/test/interiorPlanFixture";
import { createMemoryStorage } from "@/test/memoryStorage";

import {
  createInteriorPlanStore,
  INTERIOR_PLANS_STORAGE_KEY,
  parseInteriorPlans,
} from "./interiorPlanStorage";
import {
  isInteriorWon,
  validateInteriorItemFields,
  validateInteriorPlanFields,
} from "./validateInteriorPlan";

import type {
  InteriorItem,
  InteriorItemInput,
  InteriorPlanWithItems,
  InteriorQuote,
} from "@/lib/types/interiorPlan";

const itemWithQuote = (quote: Record<string, unknown>) => ({
  spaceId: "s1",
  trade: "도배",
  status: "planned",
  quotes: [{ id: "q1", vendor: "육문수", ...quote }],
});

/** 견적 하나를 검증한 결과(항목이 거부되면 null) */
const parsedQuote = (quote: Record<string, unknown>): InteriorQuote | null => {
  const item = validateInteriorItemFields(itemWithQuote(quote));
  return item === null ? null : item.quotes![0];
};

const planFields = (budgets: Record<string, unknown>) => ({
  name: "우리 집",
  spaces: [{ id: "s1", name: "전체" }],
  ...budgets,
});

describe("상수", () => {
  it("MAX_WON은 13자리이고 옛 만원 상한 × 10,000을 담는다", () => {
    expect(MAX_WON).toBe(9_999_999_999_999);
    expect(999_999_999 * 10_000).toBeLessThanOrEqual(MAX_WON);
    expect(Number.isSafeInteger(MAX_WON)).toBe(true);
  });
});

describe("견적 amountWon 검증 경계(qa Q2)", () => {
  it.each([0, 1, 9_999_999_999_999])("amountWon %s 통과, 그 키 그대로", (amountWon) => {
    expect(parsedQuote({ amountWon })).toStrictEqual({ id: "q1", vendor: "육문수", amountWon });
  });

  it.each([
    ["-1", -1],
    ["1.5", 1.5],
    ['"1"', "1"],
    ["null", null],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["10_000_000_000_000", 10_000_000_000_000],
    ["2 ** 53 + 2(안전 정수 밖)", 2 ** 53 + 2],
  ])("amountWon %s 거부", (_, amountWon) => {
    expect(parsedQuote({ amountWon })).toBeNull();
  });

  it("amount(옛 키)는 지금 규칙 그대로: 0·1·999,999,999 통과, 1,000,000,000 거부", () => {
    for (const amount of [0, 1, 999_999_999]) {
      expect(parsedQuote({ amount })).toStrictEqual({ id: "q1", vendor: "육문수", amount });
    }
    expect(parsedQuote({ amount: 1_000_000_000 })).toBeNull();
  });

  it.each([
    ["다른 값", { amount: 800, amountWon: 1_234_500 }],
    ["같은 환산값", { amount: 800, amountWon: 8_000_000 }],
    ["둘 다 0", { amount: 0, amountWon: 0 }],
  ])("한 견적에 amount·amountWon 함께(%s) → 거부", (_, quote) => {
    expect(parsedQuote(quote)).toBeNull();
  });

  it("값이 undefined인 키는 없음으로 본다: { amount: undefined, amountWon: 1 } → amountWon만", () => {
    const quote = parsedQuote({ amount: undefined, amountWon: 1 })!;
    expect(quote).toStrictEqual({ id: "q1", vendor: "육문수", amountWon: 1 });
    expect(Object.hasOwn(quote, "amount")).toBe(false);
  });

  it("둘 다 없음(미정)이면 결과에 금액 키가 없다", () => {
    const quote = parsedQuote({ amountWon: undefined })!;
    expect(quote).toStrictEqual({ id: "q1", vendor: "육문수" });
    expect(Object.hasOwn(quote, "amount")).toBe(false);
    expect(Object.hasOwn(quote, "amountWon")).toBe(false);
  });

  it("옛 키 amount를 amountWon으로 바꾸지 않는다(정규화 없음)", () => {
    const quote = parsedQuote({ amount: 800 })!;
    expect(quote).toStrictEqual({ id: "q1", vendor: "육문수", amount: 800 });
    expect(Object.hasOwn(quote, "amountWon")).toBe(false);
  });
});

describe("총 예산 budgetWon 검증 경계(qa Q2)", () => {
  it.each([1, 9_999_999_999_999])("budgetWon %s 통과, 그 키 그대로", (budgetWon) => {
    expect(validateInteriorPlanFields(planFields({ budgetWon }))).toStrictEqual(
      planFields({ budgetWon }),
    );
    expect(isInteriorWon(budgetWon)).toBe(true);
  });

  it.each([
    ["0", 0],
    ["-1", -1],
    ["10_000_000_000_000", 10_000_000_000_000],
    ["1.5", 1.5],
    ['"1"', "1"],
    ["null", null],
    ["NaN", Number.NaN],
    ["2 ** 53 + 2(안전 정수 밖)", 2 ** 53 + 2],
  ])("budgetWon %s 거부", (_, budgetWon) => {
    expect(validateInteriorPlanFields(planFields({ budgetWon }))).toBeNull();
  });

  it("budget(옛 키)는 지금 규칙 그대로: 1·999,999,999 통과, 0·1,000,000,000 거부", () => {
    for (const budget of [1, 999_999_999]) {
      expect(validateInteriorPlanFields(planFields({ budget }))).toStrictEqual(
        planFields({ budget }),
      );
    }
    for (const budget of [0, 1_000_000_000]) {
      expect(validateInteriorPlanFields(planFields({ budget }))).toBeNull();
    }
  });

  it.each([
    ["다른 값", { budget: 1000, budgetWon: 12_345_000 }],
    ["같은 환산값", { budget: 1000, budgetWon: 10_000_000 }],
  ])("한 플랜에 budget·budgetWon 함께(%s) → 거부", (_, budgets) => {
    expect(validateInteriorPlanFields(planFields(budgets))).toBeNull();
  });

  it("값이 undefined인 키는 없음: { budget: undefined, budgetWon: 1 } → budgetWon만, budget 키 없음", () => {
    const fields = validateInteriorPlanFields(planFields({ budget: undefined, budgetWon: 1 }))!;
    expect(fields).toStrictEqual(planFields({ budgetWon: 1 }));
    expect(Object.hasOwn(fields, "budget")).toBe(false);
  });

  it("옛 키 budget을 budgetWon으로 바꾸지 않는다(정규화 없음)", () => {
    const fields = validateInteriorPlanFields(planFields({ budget: 1000 }))!;
    expect(Object.hasOwn(fields, "budgetWon")).toBe(false);
  });
});

// --- 보존(qa Q7): 계획 X에 새 키, 계획 Y를 쓴 뒤 원문의 X가 그대로

const T0 = pTime(0);

/** 계획 X: 원 단위 견적(1,234,500·0)·만원 견적 형제·총 예산 원 */
const planX = (): InteriorPlanWithItems => ({
  id: "plan-x",
  name: "원 단위 집",
  budgetWon: 12_345_000,
  spaces: P_SPACES.slice(0, 1),
  createdAt: T0,
  updatedAt: T0,
  items: [
    {
      id: "x-item-1",
      spaceId: "sp-all",
      trade: "도배",
      quotes: [
        { id: "xq1", vendor: "육문수", amountWon: 1_234_500 },
        { id: "xq2", vendor: "동네도배", amount: 800 },
        { id: "xq3", vendor: "셀프시공", amountWon: 0 },
      ],
      confirmedQuoteId: "xq1",
      status: "planned",
      createdAt: T0,
      updatedAt: T0,
    },
  ],
});

/** 계획 Y: 옛 키만 */
const planY = (): InteriorPlanWithItems => ({
  id: "plan-y",
  name: "만원 집",
  budget: 3000,
  spaces: P_SPACES.slice(0, 1),
  createdAt: pTime(1),
  updatedAt: pTime(1),
  items: [
    {
      id: "y-item-1",
      spaceId: "sp-all",
      trade: "욕실",
      quotes: [{ id: "yq1", vendor: "하루바스", amount: 370 }],
      status: "planned",
      createdAt: pTime(1),
      updatedAt: pTime(1),
    },
  ],
});

const fieldsOf = ({ id, createdAt, updatedAt, ...fields }: InteriorItem): InteriorItemInput => {
  void [id, createdAt, updatedAt];
  return fields;
};

const storedPlans = (storage: Storage) =>
  (JSON.parse(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)!) as { plans: unknown[] }).plans;

function seededStore() {
  const storage = createMemoryStorage({
    [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans([planX(), planY()]),
  });
  let id = 0;
  const store = createInteriorPlanStore({
    storage,
    createId: () => `new${(id += 1)}`,
    now: () => pTime(30),
  });
  return { storage, store };
}

describe("파서는 저장 형태를 바꾸지 않는다(AC-0, ADR-034 조건 2)", () => {
  it("새 키·옛 키가 섞인 원문 → 스냅샷이 원문과 같다", () => {
    const snapshot = parseInteriorPlans(toStoredPlans([planX(), planY()]));
    expect(snapshot).toStrictEqual({ status: "ok", plans: [planX(), planY()] });
  });
});

describe("로컬 보존: 계획 Y의 모든 쓰기 뒤 원문의 계획 X가 그대로(qa Q7)", () => {
  const Y_WRITES: [string, (store: ReturnType<typeof seededStore>["store"]) => { ok: boolean }][] =
    [
      ["Y 줄 추가", (store) => store.addItem("plan-y", fieldsOf(planY().items[0]))],
      [
        "Y 줄 수정",
        (store) =>
          store.updateItem("plan-y", "y-item-1", {
            ...fieldsOf(planY().items[0]),
            quotes: [{ id: "yq1", vendor: "하루바스", amount: 400 }],
          }),
      ],
      [
        "Y 확정 토글",
        (store) =>
          store.updateItem("plan-y", "y-item-1", {
            ...fieldsOf(planY().items[0]),
            confirmedQuoteId: "yq1",
          }),
      ],
      ["Y 줄 삭제", (store) => store.removeItem("plan-y", "y-item-1")],
      ["Y 이름 PATCH", (store) => store.updatePlan("plan-y", { name: "새 이름" })],
      ["Y 예산 PATCH", (store) => store.updatePlan("plan-y", { budget: 2000 })],
      ["Y 예산 원 PATCH", (store) => store.updatePlan("plan-y", { budgetWon: 20_000_000 })],
      [
        "새 계획 만들기",
        (store) => store.createPlan({ name: "새 집", spaces: P_SPACES.slice(0, 1) }),
      ],
      ["Y 삭제", (store) => store.removePlan("plan-y")],
    ];

  it.each(Y_WRITES)("%s", (_, write) => {
    const { storage, store } = seededStore();
    expect(write(store).ok).toBe(true);
    const [storedX] = storedPlans(storage);
    expect(storedX).toStrictEqual(planX());
  });

  it("X 이름만 PATCH → budgetWon과 견적 금액 키가 그대로(이름·updatedAt만 바뀜)", () => {
    const { storage, store } = seededStore();
    expect(store.updatePlan("plan-x", { name: "이름만" })).toStrictEqual({ ok: true });
    const [storedX] = storedPlans(storage);
    expect(storedX).toStrictEqual({ ...planX(), name: "이름만", updatedAt: pTime(30) });
  });

  it("같은 항목의 형제 견적(xq2 만원)만 바꾼 입력 → xq1·xq3의 amountWon이 그대로", () => {
    const { storage, store } = seededStore();
    const original = planX().items[0];
    const input: InteriorItemInput = {
      ...fieldsOf(original),
      quotes: original.quotes!.map((quote) =>
        quote.id === "xq2" ? { ...quote, amount: 900 } : quote,
      ),
    };
    expect(store.updateItem("plan-x", "x-item-1", input)).toStrictEqual({ ok: true });
    const [storedX] = storedPlans(storage) as InteriorPlanWithItems[];
    expect(storedX.items[0].quotes).toStrictEqual([
      { id: "xq1", vendor: "육문수", amountWon: 1_234_500 },
      { id: "xq2", vendor: "동네도배", amount: 900 },
      { id: "xq3", vendor: "셀프시공", amountWon: 0 },
    ]);
  });

  it("쓰기 경로는 두 키를 함께 만들 수 없다: 두 키 견적·두 키 플랜은 invalid이고 원문 그대로", () => {
    const { storage, store } = seededStore();
    const before = storage.getItem(INTERIOR_PLANS_STORAGE_KEY);
    const bothQuote = {
      ...fieldsOf(planY().items[0]),
      quotes: [{ id: "yq1", vendor: "하루바스", amount: 370, amountWon: 3_700_000 }],
    };
    const invalid = { ok: false, reason: "invalid" };
    expect(store.addItem("plan-y", bothQuote)).toStrictEqual(invalid);
    expect(store.updateItem("plan-y", "y-item-1", bothQuote)).toStrictEqual(invalid);
    expect(
      store.createPlan({
        name: "새 집",
        budget: 1000,
        budgetWon: 10_000_000,
        spaces: P_SPACES.slice(0, 1),
      }),
    ).toStrictEqual(invalid);
    expect(
      store.createPlan({ name: "새 집", spaces: P_SPACES.slice(0, 1), items: [bothQuote] }),
    ).toStrictEqual(invalid);
    expect(store.updatePlan("plan-y", { budget: 1000, budgetWon: 10_000_000 })).toStrictEqual(
      invalid,
    );
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe(before);
  });
});
