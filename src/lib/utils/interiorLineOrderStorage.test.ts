// 스펙 interior-vendor-tbd-line-order AC-0(b)(d)(e), ADR-036 조건 2: 로그아웃 저장소(`createInteriorPlanStore`)의
// 줄 순서 `lineOrder` 쓰기·보존과 업체 미정 견적 보존. 원문(`interior-plans`)에서 키가 아예 없는지 `Object.hasOwn`으로 본다.
import { describe, expect, it, vi } from "vitest";

import { makePlanP } from "@/test/interiorPlanFixture";
import { makeSimplePlanP, simpleTime } from "@/test/interiorSimpleFixture";
import { createMemoryStorage } from "@/test/memoryStorage";

import { createInteriorPlanStore, INTERIOR_PLANS_STORAGE_KEY } from "./interiorPlanStorage";

import type {
  InteriorItemInput,
  InteriorPlanPatch,
  InteriorPlanWithItems,
} from "@/lib/types/interiorPlan";

const P_ORDER = ["r1:rq1", "r2:rq2", "r3:rq3", "r4:rq4", "r5:rq5"];
const MOVED_ORDER = ["r2:rq2", "r1:rq1", "r3:rq3", "r4:rq4", "r5:rq5"];

function createStore(storage: Storage) {
  let id = 0;
  let minute = 40;
  return createInteriorPlanStore({
    storage,
    createId: () => `new${(id += 1)}`,
    now: () => simpleTime((minute += 1)),
  });
}

const seeded = (plans: InteriorPlanWithItems[]) =>
  createMemoryStorage({ [INTERIOR_PLANS_STORAGE_KEY]: JSON.stringify({ plans }) });

const storedPlans = (storage: Storage) =>
  (
    JSON.parse(storage.getItem(INTERIOR_PLANS_STORAGE_KEY) ?? "null") as {
      plans: InteriorPlanWithItems[];
    }
  ).plans;

const storedPlan = (storage: Storage, id = "plan-simple") =>
  storedPlans(storage).find((plan) => plan.id === id)!;

/** 업체 키 없는 견적 줄(R8 모양): 조명 · 거실 간접등 · 300,000원 · 확정 */
const TBD_VENDOR_LINE: InteriorItemInput = {
  spaceId: "sp-whole",
  trade: "조명",
  quotes: [{ id: "rq8", amountWon: 300_000, memo: "거실 간접등" }],
  confirmedQuoteId: "rq8",
  status: "planned",
};

/** 업체·금액·세부내용이 모두 없는 견적 줄(R9 모양) */
const ID_ONLY_LINE: InteriorItemInput = {
  spaceId: "sp-whole",
  trade: "철거",
  quotes: [{ id: "rq9" }],
  status: "planned",
};

describe("updatePlan(lineOrder): 그 플랜의 lineOrder·updatedAt만 바뀐다 (AC-0(d))", () => {
  it("끌기 한 번 = setItem 1회, items와 다른 플랜은 그대로", () => {
    const storage = seeded([makeSimplePlanP(), makePlanP()]);
    const setItem = vi.spyOn(storage, "setItem");
    const store = createStore(storage);

    expect(store.updatePlan("plan-simple", { lineOrder: MOVED_ORDER })).toStrictEqual({ ok: true });

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(storedPlan(storage)).toStrictEqual({
      ...makeSimplePlanP(),
      lineOrder: MOVED_ORDER,
      updatedAt: simpleTime(41),
    });
    expect(storedPlan(storage, "plan-p")).toStrictEqual(makePlanP());
  });

  it("스냅샷에도 lineOrder가 들어가고, 새 스토어(새로고침)에서도 같다", () => {
    const storage = seeded([makeSimplePlanP()]);
    createStore(storage).updatePlan("plan-simple", { lineOrder: MOVED_ORDER });
    const snapshot = createStore(storage).getSnapshot();
    expect(snapshot.status === "ok" && snapshot.plans[0].lineOrder).toStrictEqual(MOVED_ORDER);
  });
});

describe("다른 쓰기는 lineOrder를 건드리지 않는다 (AC-0(d), 버그 ③)", () => {
  const withOrder = () => seeded([makeSimplePlanP({ lineOrder: MOVED_ORDER })]);

  it.each<[string, InteriorPlanPatch]>([
    ["이름", { name: "새 이름" }],
    ["예산", { budgetWon: 12_000_000 }],
    ["예산 지움", { budget: null }],
    ["매물 연결", { listingId: "listing-1" }],
    ["공간", { spaces: [{ id: "sp-whole", name: "집 전체" }] }],
  ])("updatePlan(%s) 뒤에도 lineOrder 그대로", (_, patch) => {
    const storage = withOrder();
    expect(createStore(storage).updatePlan("plan-simple", patch)).toStrictEqual({ ok: true });
    expect(storedPlan(storage).lineOrder).toStrictEqual(MOVED_ORDER);
  });

  it("줄 추가·수정·삭제 뒤에도 lineOrder 그대로", () => {
    const storage = withOrder();
    const store = createStore(storage);
    const { id, createdAt, updatedAt, ...r1Fields } = makeSimplePlanP().items[0];
    void [id, createdAt, updatedAt];

    expect(store.addItem("plan-simple", TBD_VENDOR_LINE).ok).toBe(true);
    expect(storedPlan(storage).lineOrder).toStrictEqual(MOVED_ORDER);
    expect(
      store.updateItem("plan-simple", "r1", { ...r1Fields, confirmedQuoteId: undefined }),
    ).toStrictEqual({ ok: true });
    expect(storedPlan(storage).lineOrder).toStrictEqual(MOVED_ORDER);
    expect(store.removeItem("plan-simple", "r5")).toStrictEqual({ ok: true });
    expect(storedPlan(storage).lineOrder).toStrictEqual(MOVED_ORDER);
  });
});

describe("빈 배열·null 정책: 둘 다 키 삭제 (ADR-036 조건 2, AC-0(b))", () => {
  it.each([
    ["null", null],
    ["[]", []],
  ] as const)("updatePlan({ lineOrder: %s }) → ok, 원문에 lineOrder 키가 없다", (_, lineOrder) => {
    const storage = seeded([makeSimplePlanP({ lineOrder: MOVED_ORDER })]);
    expect(
      createStore(storage).updatePlan("plan-simple", { lineOrder: lineOrder as string[] | null }),
    ).toStrictEqual({ ok: true });
    const plan = storedPlan(storage);
    expect(Object.hasOwn(plan, "lineOrder")).toBe(false);
    expect(plan).toStrictEqual({ ...makeSimplePlanP(), updatedAt: simpleTime(41) });
  });

  it("lineOrder가 없는 플랜에 null을 보내도 ok, 키가 생기지 않는다", () => {
    const storage = seeded([makeSimplePlanP()]);
    expect(createStore(storage).updatePlan("plan-simple", { lineOrder: null })).toStrictEqual({
      ok: true,
    });
    expect(Object.hasOwn(storedPlan(storage), "lineOrder")).toBe(false);
  });
});

describe("틀린 lineOrder는 invalid이고 쓰지 않는다", () => {
  it.each([
    ["중복", ["r1:rq1", "r1:rq1"]],
    ['"a:b:c"', ["a:b:c"]],
    ['":q"', [":q"]],
    ["501개", Array.from({ length: 501 }, (_, i) => `r${i}:`)],
  ])("%s → invalid, setItem 0회, 원문 그대로", (_, lineOrder) => {
    const storage = seeded([makeSimplePlanP({ lineOrder: P_ORDER })]);
    const before = storage.getItem(INTERIOR_PLANS_STORAGE_KEY);
    const setItem = vi.spyOn(storage, "setItem");
    expect(createStore(storage).updatePlan("plan-simple", { lineOrder })).toStrictEqual({
      ok: false,
      reason: "invalid",
    });
    expect(setItem).not.toHaveBeenCalled();
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe(before);
  });
});

describe("저장된 원문 읽기", () => {
  it("lineOrder가 든 원문은 ok이고 그대로, 저장된 [ ]는 키 없음으로 읽는다(쓰지 않음)", () => {
    const storage = seeded([
      makeSimplePlanP({ lineOrder: MOVED_ORDER }),
      makePlanP({ lineOrder: [] }),
    ]);
    const setItem = vi.spyOn(storage, "setItem");
    const snapshot = createStore(storage).getSnapshot();
    expect(snapshot.status).toBe("ok");
    if (snapshot.status !== "ok") return;
    expect(snapshot.plans[0]).toStrictEqual(makeSimplePlanP({ lineOrder: MOVED_ORDER }));
    expect(snapshot.plans[1]).toStrictEqual(makePlanP());
    expect(setItem).not.toHaveBeenCalled();
  });

  it("틀린 lineOrder가 든 원문은 전체 corrupt(ADR-001)", () => {
    const storage = seeded([makeSimplePlanP({ lineOrder: ["r1:rq1", "r1:rq1"] }), makePlanP()]);
    expect(createStore(storage).getSnapshot().status).toBe("corrupt");
  });
});

describe("업체 미정 견적 왕복: vendor 키가 생기지 않는다 (AC-0(d)(e))", () => {
  it("addItem(업체 없는 견적·{ id }만 있는 견적) → updatePlan(lineOrder) → 새 스토어 스냅샷이 입력과 같다", () => {
    const storage = seeded([makeSimplePlanP()]);
    const store = createStore(storage);
    const r8 = store.addItem("plan-simple", TBD_VENDOR_LINE);
    const r9 = store.addItem("plan-simple", ID_ONLY_LINE);
    if (!r8.ok || !r9.ok) throw new Error("addItem 실패");
    const lineOrder = [...MOVED_ORDER, `${r9.item.id}:rq9`, `${r8.item.id}:rq8`];
    expect(store.updatePlan("plan-simple", { lineOrder })).toStrictEqual({ ok: true });

    const snapshot = createStore(storage).getSnapshot();
    if (snapshot.status !== "ok") throw new Error(snapshot.status);
    const plan = snapshot.plans[0];
    expect(plan.lineOrder).toStrictEqual(lineOrder);
    expect(plan.items.slice(5)).toStrictEqual([r8.item, r9.item]);
    expect(Object.hasOwn(storedPlan(storage).items[5].quotes![0], "vendor")).toBe(false);
    expect(storedPlan(storage).items[6].quotes).toStrictEqual([{ id: "rq9" }]);
  });

  it("업체 미정 줄의 확정만 끄면 confirmedQuoteId만 빠지고 vendor 키는 계속 없다", () => {
    const storage = seeded([makeSimplePlanP()]);
    const store = createStore(storage);
    const added = store.addItem("plan-simple", TBD_VENDOR_LINE);
    if (!added.ok) throw new Error("addItem 실패");
    const { confirmedQuoteId, ...unconfirmed } = TBD_VENDOR_LINE;
    void confirmedQuoteId;
    expect(store.updateItem("plan-simple", added.item.id, unconfirmed)).toStrictEqual({ ok: true });
    const item = storedPlan(storage).items[5];
    expect(Object.hasOwn(item, "confirmedQuoteId")).toBe(false);
    expect(item.quotes).toStrictEqual([{ id: "rq8", amountWon: 300_000, memo: "거실 간접등" }]);
  });

  it('업체 vendor: ""·null은 invalid, 쓰지 않음', () => {
    const storage = seeded([makeSimplePlanP()]);
    const setItem = vi.spyOn(storage, "setItem");
    const store = createStore(storage);
    for (const vendor of ["", "  ", null]) {
      const input = { ...ID_ONLY_LINE, quotes: [{ id: "rq9", vendor }] } as InteriorItemInput;
      expect(store.addItem("plan-simple", input)).toStrictEqual({ ok: false, reason: "invalid" });
    }
    expect(setItem).not.toHaveBeenCalled();
  });
});
