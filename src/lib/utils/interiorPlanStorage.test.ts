import { describe, expect, it, vi } from "vitest";

import {
  INTERIOR_ITEM_MAX_COUNT,
  INTERIOR_PLAN_CREATE_MAX_ITEMS,
  INTERIOR_PLAN_MAX_COUNT,
  INTERIOR_QUOTE_MAX_COUNT,
} from "@/lib/constants/interiorPlan";
import { makePlanP, P_SPACES, pTime, toStoredPlans } from "@/test/interiorPlanFixture";
import { createMemoryStorage } from "@/test/memoryStorage";

import {
  createInteriorPlanStore,
  INTERIOR_PLANS_STORAGE_KEY,
  parseInteriorPlans,
} from "./interiorPlanStorage";
import { LISTINGS_STORAGE_KEY } from "./listingStorage";

import type { InteriorItemInput, InteriorPlanWithItems } from "@/lib/types/interiorPlan";
import type { InteriorPlanSnapshot } from "@/lib/types/interiorPlanStore";

/** 시각·id가 예측 가능한 스토어. 같은 storage로 둘을 만들면 탭 둘이다 */
function createStore(storage: Storage, prefix = "id") {
  let id = 0;
  let minute = 10;
  return createInteriorPlanStore({
    storage,
    createId: () => `${prefix}${(id += 1)}`,
    now: () => pTime((minute += 1)),
  });
}

const planInput = (name = "우리 집") => ({ name, spaces: P_SPACES.slice(0, 3) });

const itemInput = (patch: Partial<InteriorItemInput> = {}): InteriorItemInput => ({
  spaceId: "sp-all",
  trade: "샷시",
  budget: 1200,
  status: "planned",
  ...patch,
});

function plansOf(snapshot: InteriorPlanSnapshot): InteriorPlanWithItems[] {
  if (snapshot.status !== "ok") throw new Error(`스냅샷이 ok가 아니다: ${snapshot.status}`);
  return snapshot.plans;
}

const stored = (storage: Storage) =>
  JSON.parse(storage.getItem(INTERIOR_PLANS_STORAGE_KEY) ?? "null") as {
    plans: InteriorPlanWithItems[];
  };

/** 테스트 준비용: P를 저장소에 바로 넣는다 */
const seededStorage = (plans: InteriorPlanWithItems[] = [makePlanP()]) =>
  createMemoryStorage({ [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans(plans) });

describe("키·원문 형식", () => {
  it("키는 loan-calculator/interior-plans, 원문은 { plans: (플랜 & { items })[] }", () => {
    expect(INTERIOR_PLANS_STORAGE_KEY).toBe("loan-calculator/interior-plans");
    const storage = createMemoryStorage();
    const store = createStore(storage);
    const created = store.createPlan(planInput());
    expect(created.ok).toBe(true);
    expect(stored(storage)).toEqual({
      plans: [
        {
          id: "id1",
          name: "우리 집",
          spaces: P_SPACES.slice(0, 3),
          createdAt: pTime(11),
          updatedAt: pTime(11),
          items: [],
        },
      ],
    });
  });

  it("키가 없으면 빈 목록(쓰지 않음)", () => {
    const storage = createMemoryStorage();
    const setItem = vi.spyOn(storage, "setItem");
    expect(createStore(storage).getSnapshot()).toEqual({ status: "ok", plans: [] });
    expect(setItem).not.toHaveBeenCalled();
  });

  it("같은 원문이면 같은 스냅샷 참조(useSyncExternalStore 무한 렌더 방지)", () => {
    const store = createStore(seededStorage());
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });

  it("P 원문을 그대로 읽는다", () => {
    expect(plansOf(createStore(seededStorage()).getSnapshot())).toEqual([makePlanP()]);
  });
});

describe("생성·수정·삭제 왕복", () => {
  it("플랜 만들기 → 새 스토어(새로고침)에서도 같은 값", () => {
    const storage = createMemoryStorage();
    const created = createStore(storage).createPlan({ ...planInput(), budget: 3000 });
    if (!created.ok) throw new Error("만들기 실패");
    expect(plansOf(createStore(storage).getSnapshot())).toEqual([created.plan]);
  });

  it("만들 때 items(가져오기)는 id·시각(기준 + i ms, 서버 POST와 같음)을 붙여 같이 저장한다", () => {
    const storage = createMemoryStorage();
    const created = createStore(storage).createPlan({
      ...planInput(),
      items: [itemInput({ trade: "도배", budget: 300 }), itemInput()],
    });
    if (!created.ok) throw new Error("만들기 실패");
    expect(
      created.plan.items.map(({ id, trade, createdAt, updatedAt }) => [
        id,
        trade,
        createdAt,
        updatedAt,
      ]),
    ).toEqual([
      ["id2", "도배", "2026-10-26T00:11:00.000Z", "2026-10-26T00:11:00.000Z"],
      ["id3", "샷시", "2026-10-26T00:11:00.001Z", "2026-10-26T00:11:00.001Z"],
    ]);
    expect(created.plan.createdAt).toBe(pTime(11));
    expect(stored(storage).plans[0].items).toHaveLength(2);
  });

  it("updatePlan: 이름·예산 바꾸기, null은 지움, 키 없음은 그대로, createdAt 유지·updatedAt 갱신", () => {
    const storage = seededStorage();
    const store = createStore(storage);
    expect(store.updatePlan("plan-p", { name: "새 이름", budget: 2500 })).toEqual({ ok: true });
    let plan = stored(storage).plans[0];
    expect([plan.name, plan.budget, plan.createdAt]).toEqual(["새 이름", 2500, pTime(0)]);
    expect(plan.updatedAt).toBe(pTime(11));
    expect(plan.items).toEqual(makePlanP().items);

    expect(store.updatePlan("plan-p", { budget: null, listingId: "listing-1" })).toEqual({
      ok: true,
    });
    plan = stored(storage).plans[0];
    expect("budget" in plan).toBe(false);
    expect(plan.listingId).toBe("listing-1");
    expect(plan.name).toBe("새 이름");

    expect(store.updatePlan("plan-p", { listingId: null })).toEqual({ ok: true });
    expect("listingId" in stored(storage).plans[0]).toBe(false);
  });

  it("updatePlan: 공간 통째 바꾸기", () => {
    const storage = seededStorage();
    const spaces = [...P_SPACES, { id: "sp-new", name: "다용도실" }];
    expect(createStore(storage).updatePlan("plan-p", { spaces })).toEqual({ ok: true });
    expect(stored(storage).plans[0].spaces).toEqual(spaces);
  });

  it("updatePlan: 검증 실패(이름 빈칸·공간 0개·예산 소수)는 invalid, 쓰지 않음", () => {
    const storage = seededStorage();
    const before = storage.getItem(INTERIOR_PLANS_STORAGE_KEY);
    const setItem = vi.spyOn(storage, "setItem");
    const store = createStore(storage);
    expect(store.updatePlan("plan-p", { name: "  " })).toEqual({ ok: false, reason: "invalid" });
    expect(store.updatePlan("plan-p", { spaces: [] })).toEqual({ ok: false, reason: "invalid" });
    expect(store.updatePlan("plan-p", { budget: 1.5 })).toEqual({ ok: false, reason: "invalid" });
    expect(setItem).not.toHaveBeenCalled();
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe(before);
  });

  it("removePlan: 그 플랜만 지운다, 없으면 notFound", () => {
    const other = makePlanP({ id: "plan-q", name: "세컨드" });
    const storage = seededStorage([makePlanP(), other]);
    const store = createStore(storage);
    expect(store.removePlan("plan-p")).toEqual({ ok: true });
    expect(stored(storage).plans.map((plan) => plan.id)).toEqual(["plan-q"]);
    expect(store.removePlan("plan-p")).toEqual({ ok: false, reason: "notFound" });
  });

  it("addItem → updateItem(createdAt 유지) → removeItem", () => {
    const storage = seededStorage();
    const store = createStore(storage);
    const added = store.addItem("plan-p", itemInput({ trade: "방충망", budget: 80 }));
    if (!added.ok) throw new Error("추가 실패");
    expect(added.item).toEqual({
      id: "id1",
      spaceId: "sp-all",
      trade: "방충망",
      budget: 80,
      status: "planned",
      createdAt: pTime(11),
      updatedAt: pTime(11),
    });
    expect(stored(storage).plans[0].items.at(-1)).toEqual(added.item);

    expect(
      store.updateItem("plan-p", "id1", itemInput({ trade: "방충망", budget: 90, status: "done" })),
    ).toEqual({ ok: true });
    const updated = stored(storage).plans[0].items.at(-1);
    expect(updated).toMatchObject({ id: "id1", budget: 90, status: "done", createdAt: pTime(11) });
    expect(updated?.updatedAt).toBe(pTime(12));

    expect(store.removeItem("plan-p", "id1")).toEqual({ ok: true });
    expect(stored(storage).plans[0].items).toEqual(makePlanP().items);
  });

  it("updateItem은 전체 교체: 입력에 없는 선택 키는 사라진다(서버 PUT과 같음)", () => {
    const storage = seededStorage();
    expect(
      createStore(storage).updateItem("plan-p", "item-sash", itemInput({ trade: "샷시" })),
    ).toEqual({ ok: true });
    const sash = stored(storage).plans[0].items.find((item) => item.id === "item-sash");
    expect(sash).toEqual({
      id: "item-sash",
      spaceId: "sp-all",
      trade: "샷시",
      budget: 1200,
      status: "planned",
      createdAt: pTime(3),
      updatedAt: pTime(11),
    });
  });

  it("없는 플랜·항목은 notFound, 쓰지 않음", () => {
    const storage = seededStorage();
    const setItem = vi.spyOn(storage, "setItem");
    const store = createStore(storage);
    expect(store.updatePlan("nope", { name: "x" })).toEqual({ ok: false, reason: "notFound" });
    expect(store.addItem("nope", itemInput())).toEqual({ ok: false, reason: "notFound" });
    expect(store.updateItem("plan-p", "nope", itemInput())).toEqual({
      ok: false,
      reason: "notFound",
    });
    expect(store.removeItem("plan-p", "nope")).toEqual({ ok: false, reason: "notFound" });
    expect(setItem).not.toHaveBeenCalled();
  });

  it("검증 실패 항목(견적 금액 소수·공종 31자)은 invalid, 쓰지 않음", () => {
    const storage = seededStorage();
    const setItem = vi.spyOn(storage, "setItem");
    const store = createStore(storage);
    const badQuote = itemInput({ quotes: [{ id: "q", vendor: "가", amount: 1.5 }] });
    expect(store.addItem("plan-p", badQuote)).toEqual({ ok: false, reason: "invalid" });
    expect(store.addItem("plan-p", itemInput({ trade: "가".repeat(31) }))).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(store.updateItem("plan-p", "item-sash", badQuote)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(setItem).not.toHaveBeenCalled();
  });

  it("쓰면 구독자에게 알리고, 구독을 풀면 더 알리지 않는다", () => {
    const store = createStore(seededStorage());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.updatePlan("plan-p", { name: "a" });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.updatePlan("plan-p", { name: "b" });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("쓰기 직전 재읽기: 다른 탭의 변경을 덮지 않는다", () => {
  it("탭 A가 스냅샷을 읽은 뒤 탭 B가 항목을 넣어도, A의 플랜 이름 변경이 B의 항목을 지우지 않는다", () => {
    const storage = seededStorage();
    const tabA = createStore(storage, "a");
    const tabB = createStore(storage, "b");
    expect(plansOf(tabA.getSnapshot())[0].items).toHaveLength(4);

    const added = tabB.addItem("plan-p", itemInput({ trade: "방충망" }));
    expect(added.ok).toBe(true);
    expect(tabA.updatePlan("plan-p", { name: "A가 바꾼 이름" })).toEqual({ ok: true });

    const plan = stored(storage).plans[0];
    expect(plan.name).toBe("A가 바꾼 이름");
    expect(plan.items.map((item) => item.id)).toContain("b1");
  });

  it("두 탭이 같은 플랜에 각자 항목을 넣으면 둘 다 남는다", () => {
    const storage = seededStorage();
    const tabA = createStore(storage, "a");
    const tabB = createStore(storage, "b");
    tabA.getSnapshot();
    tabB.getSnapshot();
    tabA.addItem("plan-p", itemInput({ trade: "단열" }));
    tabB.addItem("plan-p", itemInput({ trade: "방충망" }));
    expect(stored(storage).plans[0].items.map((item) => item.trade)).toEqual([
      "도배",
      "타일",
      "샷시",
      "주방가구",
      "단열",
      "방충망",
    ]);
  });

  it("다른 탭이 다른 항목을 고친 뒤 이 탭이 한 항목을 고치면 그 항목만 바뀐다", () => {
    const storage = seededStorage();
    const tabA = createStore(storage, "a");
    const tabB = createStore(storage, "b");
    tabA.getSnapshot();
    tabB.updateItem(
      "plan-p",
      "item-tile",
      itemInput({ spaceId: "sp-bath1", trade: "타일", budget: 700 }),
    );
    tabA.updateItem(
      "plan-p",
      "item-kitchen",
      itemInput({ spaceId: "sp-kitchen", trade: "주방가구", budget: 550 }),
    );
    const budgets = Object.fromEntries(
      stored(storage).plans[0].items.map((item) => [item.id, item.budget]),
    );
    expect(budgets).toEqual({
      "item-wallpaper": 300,
      "item-tile": 700,
      "item-sash": 1200,
      "item-kitchen": 550,
    });
  });

  it("다른 탭이 만든 플랜을 이 탭의 만들기가 덮지 않는다", () => {
    const storage = createMemoryStorage();
    const tabA = createStore(storage, "a");
    const tabB = createStore(storage, "b");
    tabA.getSnapshot();
    tabB.createPlan(planInput("B 계획"));
    tabA.createPlan(planInput("A 계획"));
    expect(stored(storage).plans.map((plan) => plan.name)).toEqual(["B 계획", "A 계획"]);
  });

  it("다른 탭이 지운 플랜에 쓰면 notFound이고 되살리지 않는다", () => {
    const storage = seededStorage();
    const tabA = createStore(storage, "a");
    const tabB = createStore(storage, "b");
    tabA.getSnapshot();
    tabB.removePlan("plan-p");
    expect(tabA.addItem("plan-p", itemInput())).toEqual({ ok: false, reason: "notFound" });
    expect(tabA.updatePlan("plan-p", { name: "x" })).toEqual({ ok: false, reason: "notFound" });
    expect(stored(storage).plans).toEqual([]);
  });

  it("다른 탭이 지운 항목을 고치면 notFound이고 되살리지 않는다", () => {
    const storage = seededStorage();
    const tabA = createStore(storage, "a");
    const tabB = createStore(storage, "b");
    tabA.getSnapshot();
    tabB.removeItem("plan-p", "item-sash");
    expect(tabA.updateItem("plan-p", "item-sash", itemInput())).toEqual({
      ok: false,
      reason: "notFound",
    });
    expect(stored(storage).plans[0].items.map((item) => item.id)).not.toContain("item-sash");
  });

  it("다른 탭이 원문을 손상시켰으면 쓰지 않고 corrupt", () => {
    const storage = seededStorage();
    const tab = createStore(storage);
    tab.getSnapshot();
    storage.setItem(INTERIOR_PLANS_STORAGE_KEY, "{broken");
    const setItem = vi.spyOn(storage, "setItem");
    expect(tab.updatePlan("plan-p", { name: "x" })).toEqual({ ok: false, reason: "corrupt" });
    expect(setItem).not.toHaveBeenCalled();
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe("{broken");
  });
});

describe("손상 원문 (ADR-001: 골라 버리지 않고 전체 corrupt)", () => {
  const validRaw = toStoredPlans([makePlanP()]);
  const withBrokenItem = (() => {
    const plan = makePlanP();
    plan.items[1] = { ...plan.items[1], budget: 600.5 };
    return toStoredPlans([makePlanP({ id: "ok-plan" }), plan]);
  })();

  it.each([
    ["JSON 아님", "{"],
    ["배열", "[]"],
    ["plans 없음", "{}"],
    ["plans가 배열 아님", JSON.stringify({ plans: {} })],
    ["items 없는 플랜", JSON.stringify({ plans: [{ ...makePlanP(), items: undefined }] })],
    ["플랜 하나의 항목 하나가 소수 예산", withBrokenItem],
    ["플랜 id import", toStoredPlans([makePlanP({ id: "import" })])],
    ["시각 +09:00", toStoredPlans([makePlanP({ createdAt: "2026-10-26T09:00:00+09:00" })])],
  ])("%s → corrupt(원문 그대로 보관)", (_name, rawText) => {
    expect(parseInteriorPlans(rawText)).toEqual({ status: "corrupt", rawText });
  });

  it("빈 plans·null은 ok", () => {
    expect(parseInteriorPlans(JSON.stringify({ plans: [] }))).toEqual({ status: "ok", plans: [] });
    expect(parseInteriorPlans(null)).toEqual({ status: "ok", plans: [] });
    expect(parseInteriorPlans(validRaw)).toEqual({ status: "ok", plans: [makePlanP()] });
  });

  it("알 수 없는 키는 읽은 값에서 빠진다(옛·새 번들 키가 섞여도 통과)", () => {
    const raw = JSON.stringify({ plans: [{ ...makePlanP(), extra: 1 }], other: true });
    expect(parseInteriorPlans(raw)).toEqual({ status: "ok", plans: [makePlanP()] });
  });

  it("손상이면 reset을 뺀 모든 쓰기가 corrupt이고 setItem 0회, 원문 그대로", () => {
    const storage = createMemoryStorage({ [INTERIOR_PLANS_STORAGE_KEY]: withBrokenItem });
    const setItem = vi.spyOn(storage, "setItem");
    const store = createStore(storage);
    expect(store.getSnapshot()).toEqual({ status: "corrupt", rawText: withBrokenItem });
    const corrupt = { ok: false, reason: "corrupt" };
    expect(store.createPlan(planInput())).toEqual(corrupt);
    expect(store.updatePlan("ok-plan", { name: "x" })).toEqual(corrupt);
    expect(store.removePlan("ok-plan")).toEqual(corrupt);
    expect(store.addItem("ok-plan", itemInput())).toEqual(corrupt);
    expect(store.updateItem("ok-plan", "item-sash", itemInput())).toEqual(corrupt);
    expect(store.removeItem("ok-plan", "item-sash")).toEqual(corrupt);
    expect(setItem).not.toHaveBeenCalled();
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe(withBrokenItem);
  });

  it("reset은 이 키만 지우고 빈 목록으로 돌아간다", () => {
    const storage = createMemoryStorage({
      [INTERIOR_PLANS_STORAGE_KEY]: "{",
      [LISTINGS_STORAGE_KEY]: "[]",
    });
    const removeItem = vi.spyOn(storage, "removeItem");
    const store = createStore(storage);
    expect(store.reset()).toEqual({ ok: true });
    expect(removeItem.mock.calls).toEqual([[INTERIOR_PLANS_STORAGE_KEY]]);
    expect(store.getSnapshot()).toEqual({ status: "ok", plans: [] });
    expect(storage.getItem(LISTINGS_STORAGE_KEY)).toBe("[]");
  });
});

describe("접근 불가·쓰기 실패", () => {
  it("getItem이 throw하면 unavailable, 모든 쓰기 unavailable이고 setItem 0회", () => {
    const storage = createMemoryStorage();
    vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    const setItem = vi.spyOn(storage, "setItem");
    const store = createStore(storage);
    const unavailable = { ok: false, reason: "unavailable" };
    expect(store.getSnapshot()).toEqual({ status: "unavailable" });
    expect(store.createPlan(planInput())).toEqual(unavailable);
    expect(store.updatePlan("plan-p", { name: "x" })).toEqual(unavailable);
    expect(store.removePlan("plan-p")).toEqual(unavailable);
    expect(store.addItem("plan-p", itemInput())).toEqual(unavailable);
    expect(store.updateItem("plan-p", "x", itemInput())).toEqual(unavailable);
    expect(store.removeItem("plan-p", "x")).toEqual(unavailable);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("setItem이 throw하면(용량 초과) unavailable, 스냅샷·원문 그대로, 구독자에게 알리지 않음", () => {
    const storage = seededStorage();
    const before = storage.getItem(INTERIOR_PLANS_STORAGE_KEY);
    const store = createStore(storage);
    const snapshot = store.getSnapshot();
    const listener = vi.fn();
    store.subscribe(listener);
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(store.createPlan(planInput())).toEqual({ ok: false, reason: "unavailable" });
    expect(store.addItem("plan-p", itemInput())).toEqual({ ok: false, reason: "unavailable" });
    expect(store.updatePlan("plan-p", { name: "x" })).toEqual({ ok: false, reason: "unavailable" });
    expect(store.getSnapshot()).toBe(snapshot);
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it("removeItem이 throw하면 reset이 unavailable", () => {
    const storage = createMemoryStorage({ [INTERIOR_PLANS_STORAGE_KEY]: "{" });
    vi.spyOn(storage, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(createStore(storage).reset()).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("상한 (U9: 플랜 3 · 항목 100 · 견적 5 · 만들기 items 30)", () => {
  it(`플랜 ${INTERIOR_PLAN_MAX_COUNT - 1}개면 만들 수 있고, ${INTERIOR_PLAN_MAX_COUNT}개면 limit·쓰지 않음`, () => {
    const storage = createMemoryStorage();
    const store = createStore(storage);
    for (let index = 0; index < INTERIOR_PLAN_MAX_COUNT; index += 1) {
      expect(store.createPlan(planInput(`계획 ${index}`)).ok).toBe(true);
    }
    const before = storage.getItem(INTERIOR_PLANS_STORAGE_KEY);
    expect(store.createPlan(planInput("넷째"))).toEqual({ ok: false, reason: "limit" });
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe(before);
    expect(stored(storage).plans).toHaveLength(3);
  });

  it(`항목 ${INTERIOR_ITEM_MAX_COUNT - 1}개면 하나 더, ${INTERIOR_ITEM_MAX_COUNT}개면 limit`, () => {
    const items = Array.from({ length: INTERIOR_ITEM_MAX_COUNT - 1 }, (_, index) => ({
      ...makePlanP().items[3],
      id: `bulk${index}`,
    }));
    const storage = seededStorage([makePlanP({ items })]);
    const store = createStore(storage);
    expect(store.addItem("plan-p", itemInput()).ok).toBe(true);
    expect(stored(storage).plans[0].items).toHaveLength(100);
    expect(store.addItem("plan-p", itemInput())).toEqual({ ok: false, reason: "limit" });
    expect(stored(storage).plans[0].items).toHaveLength(100);
  });

  it(`견적 ${INTERIOR_QUOTE_MAX_COUNT}개 통과, ${INTERIOR_QUOTE_MAX_COUNT + 1}개 invalid`, () => {
    const quotes = (count: number) =>
      Array.from({ length: count }, (_, index) => ({ id: `q${index}`, vendor: "가", amount: 1 }));
    const store = createStore(seededStorage());
    expect(store.addItem("plan-p", itemInput({ quotes: quotes(5) })).ok).toBe(true);
    expect(store.addItem("plan-p", itemInput({ quotes: quotes(6) }))).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it(`만들기 items ${INTERIOR_PLAN_CREATE_MAX_ITEMS}개 통과, ${INTERIOR_PLAN_CREATE_MAX_ITEMS + 1}개 invalid`, () => {
    const items = (count: number) => Array.from({ length: count }, () => itemInput());
    const storage = createMemoryStorage();
    const store = createStore(storage);
    expect(store.createPlan({ ...planInput(), items: items(30) }).ok).toBe(true);
    expect(store.createPlan({ ...planInput(), items: items(31) })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(stored(storage).plans).toHaveLength(1);
  });
});

describe("이 스토어는 자기 키에만 쓴다 (AC-0)", () => {
  it("만들기·수정·항목 쓰기·삭제 동안 setItem·removeItem의 키는 interior-plans뿐", () => {
    const storage = createMemoryStorage({ [LISTINGS_STORAGE_KEY]: "[]" });
    const setItem = vi.spyOn(storage, "setItem");
    const removeItem = vi.spyOn(storage, "removeItem");
    const clear = vi.spyOn(storage, "clear");
    const store = createStore(storage);
    const created = store.createPlan(planInput());
    if (!created.ok) throw new Error("만들기 실패");
    store.updatePlan(created.plan.id, { name: "x" });
    const added = store.addItem(created.plan.id, itemInput());
    if (!added.ok) throw new Error("추가 실패");
    store.updateItem(created.plan.id, added.item.id, itemInput({ budget: 1 }));
    store.removeItem(created.plan.id, added.item.id);
    store.removePlan(created.plan.id);
    store.reset();
    const keys = [...setItem.mock.calls, ...removeItem.mock.calls].map(([key]) => key);
    expect(new Set(keys)).toEqual(new Set([INTERIOR_PLANS_STORAGE_KEY]));
    expect(clear).not.toHaveBeenCalled();
    expect(storage.getItem(LISTINGS_STORAGE_KEY)).toBe("[]");
  });
});
