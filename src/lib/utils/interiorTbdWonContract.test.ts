// qa 태스크 1(스펙 interior-tbd-amount AC-0(a)(c), ADR-033 조건 3·8, ADR-034 조건 2·4·7):
// - 옛 번들 계약: 새 파서는 P·L·옛 P·P⁺·M·0원 계획 원문을 받은 그대로 돌려준다(`toStrictEqual`, 정규화 없음).
//   옛 파서(1단계 직전 cc056a4)가 같은 원문을 corrupt로 읽는다는 기록은 영구 테스트로 두지 않는다(qa 기록 파일).
// - 1단계 번들 보존: 미정·0원·원 키 계획 X가 저장소에 있을 때, 화면이 쓰는 쓰기 함수(addLineInput·editLineInput·
//   toggleLineConfirmInput·removeLineWrite·planSettingsPatch)로 계획 Y를 쓴 뒤 원문의 X가 그대로다.
// - 두 키 동시 불가: 위 모든 쓰기와 X 자신의 쓰기 뒤 원문 어디에도 `amount`+`amountWon`·`budget`+`budgetWon`이 함께 없다.
import { describe, expect, it } from "vitest";

import { planSettingsPatch } from "@/containers/Mortgage/Home/planSettingsPatch";
import { makePlanP } from "@/test/interiorPlanFixture";
import {
  makeFullItem,
  makePlanL,
  makePlanM,
  makeSimplePlanP,
  makeSimplePlanPPlus,
  simpleTime,
} from "@/test/interiorSimpleFixture";
import { createMemoryStorage } from "@/test/memoryStorage";

import {
  addLineInput,
  editLineInput,
  releasesOtherConfirm,
  removeLineWrite,
  toggleLineConfirmInput,
} from "./interiorLineWrites";
import { buildInteriorPlanRows } from "./interiorPlanRows";
import {
  createInteriorPlanStore,
  INTERIOR_PLANS_STORAGE_KEY,
  parseInteriorPlans,
} from "./interiorPlanStorage";

import type { InteriorLineValues } from "@/lib/types/interiorLineDraft";
import type {
  InteriorItem,
  InteriorItemInput,
  InteriorPlanWithItems,
} from "@/lib/types/interiorPlan";

/** 견적 금액 0(만원 키 0 확정·원 키 0 확정)과 원 키 총 예산 */
const zeroPlan = (): InteriorPlanWithItems => ({
  id: "plan-zero",
  name: "셀프 집",
  budgetWon: 1,
  spaces: [{ id: "sp-whole", name: "전체" }],
  createdAt: simpleTime(0),
  updatedAt: simpleTime(0),
  items: [
    {
      id: "z1",
      spaceId: "sp-whole",
      trade: "도배",
      quotes: [{ id: "zq1", vendor: "셀프도배", amount: 0 }],
      confirmedQuoteId: "zq1",
      status: "planned",
      createdAt: simpleTime(1),
      updatedAt: simpleTime(1),
    },
    {
      id: "z2",
      spaceId: "sp-whole",
      trade: "조명",
      quotes: [
        { id: "zq2", vendor: "셀프조명", amountWon: 0 },
        { id: "zq3", vendor: "빛나라조명", amount: 120, memo: "거실" },
      ],
      confirmedQuoteId: "zq2",
      status: "quoting",
      createdAt: simpleTime(2),
      updatedAt: simpleTime(2),
    },
  ],
});

/** M의 총 예산을 원 키로(만원 키 없음) */
function planMWon(): InteriorPlanWithItems {
  const { budget, ...rest } = makePlanM({ id: "plan-m-won", name: "원 예산 집" });
  void budget;
  return { ...rest, budgetWon: 12_000_000 };
}

const indented = (plans: InteriorPlanWithItems[]) => JSON.stringify({ plans }, null, 2);

describe("옛 번들 계약: 새 파서는 원문을 받은 그대로 돌려준다(정규화 없음)", () => {
  it.each<[string, () => InteriorPlanWithItems[]]>([
    ["P(새 화면)", () => [makeSimplePlanP()]],
    ["L(옛 화면, 다견적·지급·연락처)", () => [makePlanL()]],
    ["옛 P(makePlanP, 상태 5종·지급)", () => [makePlanP()]],
    ["P⁺(금액 미정 R6 확정·R7 미확정)", () => [makeSimplePlanPPlus()]],
    ["M(만원 키·원 키 섞임 + 미정)", () => [makePlanM()]],
    ["M + 총 예산 원 키", () => [planMWon()]],
    ["견적 0(만원 0·원 0)", () => [zeroPlan()]],
    ["전부 한 원문", () => [makeSimplePlanPPlus(), makePlanM(), zeroPlan()]],
  ])("%s → status ok, plans toStrictEqual 원문", (_, plansOf) => {
    const raw = indented(plansOf());
    const snapshot = parseInteriorPlans(raw);
    expect(snapshot).toStrictEqual({
      status: "ok",
      plans: (JSON.parse(raw) as { plans: unknown[] }).plans,
    });
    expect(snapshot).toStrictEqual({ status: "ok", plans: plansOf() });
  });

  it("키 단위: 미정 견적에는 금액 키가 하나도 없고, 만원 키는 만원 키로·원 키는 원 키로 남는다", () => {
    const snapshot = parseInteriorPlans(indented([makeSimplePlanPPlus(), makePlanM(), zeroPlan()]));
    if (snapshot.status !== "ok") throw new Error(snapshot.status);
    const quoteOf = (planId: string, itemId: string) =>
      snapshot.plans.find((plan) => plan.id === planId)!.items.find((item) => item.id === itemId)!
        .quotes![0];
    const keys = (quote: object) => [
      Object.hasOwn(quote, "amount"),
      Object.hasOwn(quote, "amountWon"),
    ];
    expect(keys(quoteOf("plan-simple", "r6"))).toEqual([false, false]);
    expect(keys(quoteOf("plan-simple", "r7"))).toEqual([false, false]);
    expect(keys(quoteOf("plan-m", "m1"))).toEqual([true, false]);
    expect(keys(quoteOf("plan-m", "m2"))).toEqual([false, true]);
    expect(keys(quoteOf("plan-m", "m5"))).toEqual([false, false]);
    expect(quoteOf("plan-zero", "z1")).toStrictEqual({ id: "zq1", vendor: "셀프도배", amount: 0 });
    expect(quoteOf("plan-zero", "z2")).toStrictEqual({
      id: "zq2",
      vendor: "셀프조명",
      amountWon: 0,
    });
    const zero = snapshot.plans.find((plan) => plan.id === "plan-zero")!;
    expect([Object.hasOwn(zero, "budget"), zero.budgetWon]).toEqual([false, 1]);
  });
});

// --- 쓰기: 화면이 쓰는 함수 그대로(store는 로컬 원본)

const values = (overrides: Partial<InteriorLineValues> = {}): InteriorLineValues => ({
  trade: "도배",
  vendor: "새업체",
  amountWon: 9_990_000,
  isConfirmed: false,
  ...overrides,
});

/** 계획 X 묶음(미정·0원·원 키). 계획은 기기마다 3개까지라 X 둘 + Y 하나로 나눠 두 번 돈다 */
const X_SETS: [string, () => InteriorPlanWithItems[]][] = [
  ["X = P⁺ · M", () => [makeSimplePlanPPlus(), makePlanM()]],
  ["X = 원 예산 M · 0원", () => [planMWon(), zeroPlan()]],
];
/** 계획 Y(옛 키만, P를 다른 id로) */
const planY = () => makeSimplePlanP({ id: "plan-y", name: "Y 집" });

function seeded(xPlans: InteriorPlanWithItems[] = [makeSimplePlanPPlus(), makePlanM()]) {
  const storage = createMemoryStorage({
    [INTERIOR_PLANS_STORAGE_KEY]: indented([...xPlans, planY()]),
  });
  let counter = 0;
  const store = createInteriorPlanStore({
    storage,
    createId: () => `new${(counter += 1)}`,
    now: () => "2026-10-27T09:00:00.000Z",
  });
  const stored = () =>
    (JSON.parse(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)!) as { plans: InteriorPlanWithItems[] })
      .plans;
  const item = (planId: string, itemId: string) =>
    stored()
      .find((plan) => plan.id === planId)!
      .items.find((candidate) => candidate.id === itemId)!;
  return { storage, store, stored, item };
}

type Seeded = ReturnType<typeof seeded>;

/** 원문 어디에도 같은 뜻의 두 키가 함께 있지 않다 */
function expectNoDoubleKeys(plans: InteriorPlanWithItems[]) {
  for (const plan of plans) {
    expect(Object.hasOwn(plan, "budget") && Object.hasOwn(plan, "budgetWon"), plan.id).toBe(false);
    for (const item of plan.items) {
      for (const quote of item.quotes ?? []) {
        expect(
          Object.hasOwn(quote, "amount") && Object.hasOwn(quote, "amountWon"),
          `${plan.id}/${item.id}/${quote.id}`,
        ).toBe(false);
      }
    }
  }
}

const Y_WRITES: [string, (seed: Seeded) => { ok: boolean }][] = [
  [
    "줄 추가(addLineInput)",
    ({ store }) =>
      store.addItem("plan-y", addLineInput("sp-whole", "nq", values({ isConfirmed: true }))),
  ],
  [
    "줄 수정(editLineInput, R1 금액 2,000,000원)",
    ({ store, item }) =>
      store.updateItem(
        "plan-y",
        "r1",
        editLineInput(
          item("plan-y", "r1"),
          "rq1",
          values({
            vendor: "육문수",
            amountWon: 2_000_000,
            detail: "실크 전체",
            isConfirmed: true,
          }),
          () => "unused",
        ),
      ),
  ],
  [
    "확정 켜기(toggleLineConfirmInput, R2)",
    ({ store, item }) =>
      store.updateItem("plan-y", "r2", toggleLineConfirmInput(item("plan-y", "r2"), "rq2", true)),
  ],
  [
    "줄 삭제(removeLineWrite, R3 → 항목째)",
    ({ store, item }) => {
      const removal = removeLineWrite(item("plan-y", "r3"), "rq3");
      if (removal.kind !== "removeItem") throw new Error(removal.kind);
      return store.removeItem("plan-y", "r3");
    },
  ],
  [
    "이름만 고침(planSettingsPatch)",
    ({ store }) =>
      store.updatePlan(
        "plan-y",
        planSettingsPatch(
          { name: "Y 집", budget: "10000000" },
          { name: "Y 새집", budget: "10000000" },
        ),
      ),
  ],
  [
    "총 예산 고침(planSettingsPatch)",
    ({ store }) =>
      store.updatePlan(
        "plan-y",
        planSettingsPatch(
          { name: "Y 집", budget: "10000000" },
          { name: "Y 집", budget: "20000000" },
        ),
      ),
  ],
  [
    "총 예산 원 키로(PATCH budgetWon)",
    ({ store }) => store.updatePlan("plan-y", { budgetWon: 20_000_000 }),
  ],
  [
    "계획 Y 삭제 뒤 새 계획 만들기",
    ({ store }) => {
      expect(store.removePlan("plan-y").ok).toBe(true);
      return store.createPlan({ name: "새 집", budget: 500, spaces: [{ id: "s", name: "전체" }] });
    },
  ],
  ["계획 Y 삭제", ({ store }) => store.removePlan("plan-y")],
];

describe("1단계 번들 보존: 계획 Y의 모든 쓰기 뒤 원문의 X(미정·0원·원 키)가 그대로", () => {
  it.each(
    X_SETS.flatMap(([xName, xPlans]) =>
      Y_WRITES.map(([name, write]) => [xName, name, xPlans, write] as const),
    ),
  )("%s: Y %s", (_, __, xPlans, write) => {
    const seed = seeded(xPlans());
    expect(write(seed).ok).toBe(true);
    expect(seed.stored().slice(0, 2)).toStrictEqual(xPlans());
    expectNoDoubleKeys(seed.stored());
  });
});

describe("X 안의 쓰기: 고친 견적만 바뀌고 미정·0원·원 키 형제는 그대로, 두 키는 생기지 않는다", () => {
  it("P⁺ R6(미정) 확정 끄기 → confirmedQuoteId 키만 빠지고 견적에 금액 키 없음, 나머지 줄 그대로", () => {
    const seed = seeded();
    const r6 = seed.item("plan-simple", "r6");
    expect(
      seed.store.updateItem("plan-simple", "r6", toggleLineConfirmInput(r6, "rq6", false)).ok,
    ).toBe(true);
    const { confirmedQuoteId, id, createdAt, updatedAt, ...rest } = r6;
    void [confirmedQuoteId, createdAt, updatedAt];
    const after = seed.item("plan-simple", "r6");
    expect({ ...after, updatedAt: undefined }).toStrictEqual({
      id,
      ...rest,
      createdAt: r6.createdAt,
      updatedAt: undefined,
    });
    expect(Object.hasOwn(after.quotes![0], "amount")).toBe(false);
    expect(seed.stored()[0].items.filter((item) => item.id !== "r6")).toStrictEqual(
      makeSimplePlanPPlus().items.filter((item) => item.id !== "r6"),
    );
  });

  it("M2(원 키 1,234,500) 시트 저장 1,234,000 → amountWon 1,234,000만, amount 없음, 다른 줄(M1 만원·M5 미정) 그대로", () => {
    const seed = seeded();
    const m2 = seed.item("plan-m", "m2");
    expect(
      seed.store.updateItem(
        "plan-m",
        "m2",
        editLineInput(
          m2,
          "mq2",
          values({ trade: "욕실", vendor: "하루바스", amountWon: 1_234_000, isConfirmed: true }),
          () => "x",
        ),
      ).ok,
    ).toBe(true);
    expect(seed.item("plan-m", "m2").quotes).toStrictEqual([
      { id: "mq2", vendor: "하루바스", amountWon: 1_234_000 },
    ]);
    expect(seed.stored()[1].items.filter((item) => item.id !== "m2")).toStrictEqual(
      makePlanM().items.filter((item) => item.id !== "m2"),
    );
    expectNoDoubleKeys(seed.stored());
  });

  it("0원 계획 z2: 형제 zq3(만원 120)만 수정 → zq2의 amountWon: 0·확정 그대로, zq3은 amountWon만(amount 지움)", () => {
    const seed = seeded([planMWon(), zeroPlan()]);
    const z2 = seed.item("plan-zero", "z2");
    const input = editLineInput(
      z2,
      "zq3",
      values({ trade: "조명", vendor: "빛나라조명", amountWon: 1_300_000, detail: "거실" }),
      () => "x",
    );
    expect(seed.store.updateItem("plan-zero", "z2", input).ok).toBe(true);
    expect(seed.item("plan-zero", "z2").quotes).toStrictEqual([
      { id: "zq2", vendor: "셀프조명", amountWon: 0 },
      { id: "zq3", vendor: "빛나라조명", amountWon: 1_300_000, memo: "거실" },
    ]);
    expectNoDoubleKeys(seed.stored());
    expect(seed.item("plan-zero", "z2").confirmedQuoteId).toBe("zq2");
  });

  it.each<
    [
      string,
      string,
      Parameters<ReturnType<typeof createInteriorPlanStore>["updatePlan"]>[1],
      object,
    ]
  >([
    [
      "원 예산 계획에 총 예산 15,000,000원(설정 시트)",
      "plan-m-won",
      planSettingsPatch(
        { name: "원 예산 집", budget: "12000000" },
        { name: "원 예산 집", budget: "15000000" },
      ),
      { budgetWon: 15_000_000 },
    ],
    [
      "만원 예산 계획에 총 예산 15,000,000원(설정 시트) → budget 지움",
      "plan-m",
      planSettingsPatch(
        { name: "섞인 집", budget: "10000000" },
        { name: "섞인 집", budget: "15000000" },
      ),
      { budgetWon: 15_000_000 },
    ],
    [
      "만원 예산 계획에 원 예산(PATCH)",
      "plan-m",
      { budgetWon: 15_000_000 },
      { budgetWon: 15_000_000 },
    ],
    [
      "원 예산 계획 이름만(설정 시트) → budgetWon 그대로",
      "plan-m-won",
      planSettingsPatch(
        { name: "원 예산 집", budget: "12000000" },
        { name: "새 이름", budget: "12000000" },
      ),
      { budgetWon: 12_000_000 },
    ],
    ["원 예산 계획 예산 비우기(PATCH budget null)", "plan-m-won", { budget: null }, {}],
  ])("%s → 예산 키 %j만 남는다", (_, planId, patch, budgets) => {
    const seed = seeded([makePlanM(), planMWon()]);
    expect(seed.store.updatePlan(planId, patch).ok).toBe(true);
    const plan = seed.stored().find((candidate) => candidate.id === planId)!;
    const budgetKeys = Object.fromEntries(
      Object.entries(plan).filter(([key]) => key === "budget" || key === "budgetWon"),
    );
    expect(budgetKeys).toStrictEqual(budgets);
    expectNoDoubleKeys(seed.stored());
  });
});

// --- AC-0(c)·AC-1 옛 다견적 항목 F⁺: makeFullItem의 fq2를 금액 없는 견적으로(연락처·메모·지급·날짜는 그대로)

function fPlus(): InteriorItem {
  const full = makeFullItem("inProgress");
  return {
    ...full,
    quotes: [
      full.quotes![0],
      { id: "fq2", vendor: "욕실나라", contact: "02-123-4567", memo: "도기 포함" },
    ],
  };
}

const inputOf = ({ id, createdAt, updatedAt, ...input }: InteriorItem): InteriorItemInput => {
  void [id, createdAt, updatedAt];
  return input;
};

describe("F⁺ (q1 하루바스 370 확정, q2 욕실나라 금액 없음)", () => {
  it("줄 2개, q2 줄은 금액 없음, 지출 예정 3,700,000 · 미정 0건", () => {
    const rows = buildInteriorPlanRows({ items: [fPlus()] });
    expect(rows.groups[0].rows.map((row) => [row.key, row.quoteWon, row.isConfirmed])).toEqual([
      ["item-full:fq1", 3_700_000, true],
      ["item-full:fq2", undefined, false],
    ]);
    expect([rows.plannedTotalWon, rows.tbdCount]).toEqual([3_700_000, 0]);
  });

  it("q2 확정 → 확정만 fq2로(견적·숨은 값 그대로), 지출 예정 0 · 미정 1건, 다른 견적 확정이 풀린다", () => {
    const item = fPlus();
    expect(releasesOtherConfirm(item, "fq2", true)).toBe(true);
    const input = toggleLineConfirmInput(item, "fq2", true);
    expect(input).toStrictEqual({ ...inputOf(item), confirmedQuoteId: "fq2" });
    const rows = buildInteriorPlanRows({ items: [{ ...item, ...input }] });
    expect([rows.plannedTotalWon, rows.tbdCount]).toEqual([0, 1]);
  });

  it("q1 금액 수정(370만 → 3,800,000원) → q1은 amountWon만, q2는 금액 키 없는 채 그대로, 지급·연락처·날짜 그대로", () => {
    const item = fPlus();
    const input = editLineInput(
      item,
      "fq1",
      values({
        trade: "욕실",
        vendor: "하루바스",
        amountWon: 3_800_000,
        detail: "철거·방수",
        startDate: item.startDate,
        endDate: item.endDate,
        note: "폐기물 포함",
        isConfirmed: true,
      }),
      () => "unused",
    );
    const { amount, ...q1 } = item.quotes![0];
    void amount;
    expect(input).toStrictEqual({
      ...inputOf(item),
      quotes: [{ ...q1, amountWon: 3_800_000 }, item.quotes![1]],
    });
    expect(Object.hasOwn(input.quotes![0], "amount")).toBe(false);
    expect(Object.hasOwn(input.quotes![1], "amount")).toBe(false);
    expect(Object.hasOwn(input.quotes![1], "amountWon")).toBe(false);
  });

  it("미확정 미정 견적 q2 삭제(n≥2) → q2만 빠지고 확정 fq1·지급·연락처 그대로", () => {
    const item = fPlus();
    const removal = removeLineWrite(item, "fq2");
    expect(removal).toStrictEqual({
      kind: "updateItem",
      input: { ...inputOf(item), quotes: [item.quotes![0]] },
    });
  });

  it("확정된 미정 견적 q2 삭제(n≥2) → confirmedQuoteId 키만 빠지고 q1·지급·연락처 그대로, 미정 0건", () => {
    const item = { ...fPlus(), confirmedQuoteId: "fq2" };
    const removal = removeLineWrite(item, "fq2");
    if (removal.kind !== "updateItem") throw new Error(removal.kind);
    const { confirmedQuoteId, ...rest } = inputOf(item);
    void confirmedQuoteId;
    expect(removal.input).toStrictEqual({ ...rest, quotes: [item.quotes![0]] });
    expect(Object.hasOwn(removal.input, "confirmedQuoteId")).toBe(false);
    const after: InteriorItem = {
      id: item.id,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      ...removal.input,
    };
    expect(buildInteriorPlanRows({ items: [after] }).tbdCount).toBe(0);
  });
});
