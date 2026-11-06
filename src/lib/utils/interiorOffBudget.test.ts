// 스펙 interior-budget-exclude AC-1·AC-2(저장 형식), ADR-038: 항목 `isOffBudget?: true`.
// 키 없음 = 반영. `false`는 받되 키를 쓰지 않고, `true`·`false`·키 없음 밖의 값은 항목이 올바르지 않다.
// 키가 없어야 하는 결과는 `Object.hasOwn`·toStrictEqual로 본다(toEqual은 값이 undefined인 키를 키 없음과 같게 본다).
import { describe, expect, it } from "vitest";

import {
  makePlanL,
  makePlanM,
  makePlanV,
  makeSimplePlanP,
  makeSimplePlanPPlus,
  r5,
} from "@/test/interiorSimpleFixture";
import { createMemoryStorage } from "@/test/memoryStorage";

import {
  createInteriorPlanStore,
  INTERIOR_PLANS_STORAGE_KEY,
  parseInteriorPlans,
} from "./interiorPlanStorage";
import { parseInteriorItem, validateInteriorItemFields } from "./validateInteriorPlan";

import type { InteriorItem, InteriorItemInput } from "@/lib/types/interiorPlan";

const fieldsOf = ({ id, createdAt, updatedAt, ...fields }: InteriorItem): InteriorItemInput => {
  void [id, createdAt, updatedAt];
  return fields;
};

/** R5(확정 · 2,500,000원)를 예산 외로 */
const offBudgetR5 = (): InteriorItem => ({ ...r5(), isOffBudget: true });

describe("AC-1 키 없는 기존 계획은 그대로 읽는다", () => {
  it.each([
    ["P", makeSimplePlanP()],
    ["L", makePlanL()],
    ["P⁺", makeSimplePlanPPlus()],
    ["M", makePlanM()],
    ["V", makePlanV()],
  ])("%s: parseInteriorPlans 결과가 원본과 같고 어느 항목에도 isOffBudget 키가 없다", (_, plan) => {
    const snapshot = parseInteriorPlans(JSON.stringify({ plans: [plan] }));
    expect(snapshot).toStrictEqual({ status: "ok", plans: [plan] });
    if (snapshot.status !== "ok") return;
    for (const item of snapshot.plans[0].items) {
      expect(Object.hasOwn(item, "isOffBudget")).toBe(false);
    }
  });
});

describe("AC-2 검증: true → 키, false·키 없음·undefined → 키 없음, 그 밖 → null", () => {
  const input = fieldsOf(r5());

  it("true → 결과에 isOffBudget: true", () => {
    expect(validateInteriorItemFields({ ...input, isOffBudget: true })).toStrictEqual({
      ...input,
      isOffBudget: true,
    });
  });

  it.each([
    ["false", { isOffBudget: false }],
    ["undefined", { isOffBudget: undefined }],
    ["키 없음", {}],
  ])("%s → 통과, 결과에 isOffBudget 키가 없다", (_, patch) => {
    const result = validateInteriorItemFields({ ...input, ...patch });
    expect(result).toStrictEqual(input);
    expect(Object.hasOwn(result!, "isOffBudget")).toBe(false);
  });

  it.each([
    ["null", null],
    ['"true"', "true"],
    ['"false"', "false"],
    ["1", 1],
    ["0", 0],
    ["[]", []],
    ["{}", {}],
  ])("%s → null", (_, isOffBudget) => {
    expect(validateInteriorItemFields({ ...input, isOffBudget })).toBeNull();
  });

  it("저장된 항목(parseInteriorItem)도 true는 그대로, false는 키 없이, null은 거부", () => {
    expect(parseInteriorItem(offBudgetR5())).toStrictEqual(offBudgetR5());
    const fromFalse = parseInteriorItem({ ...r5(), isOffBudget: false });
    expect(fromFalse).toStrictEqual(r5());
    expect(Object.hasOwn(fromFalse!, "isOffBudget")).toBe(false);
    expect(parseInteriorItem({ ...r5(), isOffBudget: null })).toBeNull();
  });
});

describe("AC-2 로컬 스토어 왕복", () => {
  const storeWith = (rawText?: string) => {
    const storage = createMemoryStorage(
      rawText === undefined ? {} : { [INTERIOR_PLANS_STORAGE_KEY]: rawText },
    );
    let nextId = 0;
    const store = createInteriorPlanStore({
      storage,
      createId: () => `id-${++nextId}`,
      now: () => "2026-11-06T09:00:00.000Z",
    });
    const raw = () => storage.getItem(INTERIOR_PLANS_STORAGE_KEY);
    const storedItem = (itemId: string) =>
      (
        JSON.parse(raw()!) as { plans: { items: (InteriorItemInput & { id: string })[] }[] }
      ).plans[0].items.find((item) => item.id === itemId)!;
    return { store, raw, storedItem };
  };
  const planP = () => JSON.stringify({ plans: [makeSimplePlanP()] });

  it("항목 추가·계획 만들기에 true → 스냅샷과 원문 모두 isOffBudget: true", () => {
    const { store, storedItem } = storeWith(planP());
    const added = store.addItem("plan-simple", { ...fieldsOf(r5()), isOffBudget: true });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(fieldsOf(added.item)).toStrictEqual({ ...fieldsOf(r5()), isOffBudget: true });
    expect(storedItem(added.item.id).isOffBudget).toBe(true);

    const fresh = storeWith();
    const created = fresh.store.createPlan({
      name: "우리 집",
      spaces: [{ id: "sp-whole", name: "전체" }],
      items: [fieldsOf(offBudgetR5())],
    });
    expect(created.ok).toBe(true);
    const snapshot = fresh.store.getSnapshot();
    expect(snapshot.status === "ok" && snapshot.plans[0].items.map(fieldsOf)).toStrictEqual([
      fieldsOf(offBudgetR5()),
    ]);
  });

  it("R5 수정에 true → 원문에 키, false로 다시 수정 → 원문에 키가 없다", () => {
    const { store, storedItem } = storeWith(planP());
    expect(store.updateItem("plan-simple", "r5", fieldsOf(offBudgetR5()))).toEqual({ ok: true });
    expect(fieldsOf(storedItem("r5") as InteriorItem)).toStrictEqual(fieldsOf(offBudgetR5()));

    expect(
      store.updateItem("plan-simple", "r5", {
        ...fieldsOf(r5()),
        isOffBudget: false as unknown as true,
      }),
    ).toEqual({ ok: true });
    expect(Object.hasOwn(storedItem("r5"), "isOffBudget")).toBe(false);
  });

  it("null로 수정 → invalid이고 원문이 바뀌지 않는다", () => {
    const { store, raw } = storeWith(planP());
    const before = raw();
    expect(
      store.updateItem("plan-simple", "r5", {
        ...fieldsOf(r5()),
        isOffBudget: null as unknown as true,
      }),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(raw()).toBe(before);
  });

  it('원문에 isOffBudget: "true"가 있으면 계획 전체가 corrupt다(ADR-001)', () => {
    const rawText = JSON.stringify({
      plans: [makeSimplePlanP({ items: [{ ...r5(), isOffBudget: "true" as unknown as true }] })],
    });
    expect(parseInteriorPlans(rawText)).toStrictEqual({ status: "corrupt", rawText });
  });
});
