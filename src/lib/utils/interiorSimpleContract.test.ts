// 스펙 interior-simple AC-0(e) 옛 번들 계약(qa, ADR-032 A5): 새 화면의 쓰기 함수로 만든·고친 저장소 원문은
// 옛 번들의 읽기(`parseInteriorPlans` → 알려진 키만 복사)를 거쳐도 값이 하나도 바뀌지 않고, 옛 번들이 다시 써도 원문이 같다.
// 옛 번들의 읽기·쓰기 코드(`interiorPlanStorage.ts`·`validateInteriorPlan.ts`)는 merge-base와 diff 0이라 이 모듈이 곧 옛 번들의 것이다.
import { describe, expect, it } from "vitest";

import { makePlanP } from "@/test/interiorPlanFixture";
import { makePlanL } from "@/test/interiorSimpleFixture";
import { createHexIds, createPlanPWithNewWrites, rawPlans } from "@/test/interiorSimpleStore";
import { createMemoryStorage } from "@/test/memoryStorage";

import {
  addLineInput,
  editLineInput,
  removeLineWrite,
  toggleLineConfirmInput,
} from "./interiorLineWrites";
import { buildInteriorPlanRows } from "./interiorPlanRows";
import {
  createInteriorPlanStore,
  INTERIOR_PLANS_STORAGE_KEY,
  parseInteriorPlans,
} from "./interiorPlanStorage";

import type { InteriorItem, InteriorPlanWithItems } from "@/lib/types/interiorPlan";
import type { InteriorPlanStore } from "@/lib/types/interiorPlanStore";

/** 옛 번들이 이 원문을 읽은 값이 원문 그대로이고, 그 값을 다시 쓰면 원문이 글자까지 같다 */
function expectOldBundleKeepsRaw(raw: string | null) {
  const snapshot = parseInteriorPlans(raw);
  if (snapshot.status !== "ok") throw new Error(`옛 번들이 읽지 못함: ${snapshot.status}`);
  expect(snapshot.plans).toStrictEqual(rawPlans(raw));
  // 옛 스토어의 commit은 JSON.stringify({ plans })다
  expect(JSON.stringify({ plans: snapshot.plans })).toBe(raw);
}

/** 옛 번들이 항목마다 그대로 다시 저장(PUT과 같은 전체 교체)해도 id·시각 외 값이 같다 */
function expectOldBundleRewriteKeepsItems(storage: Storage, planId: string) {
  const oldStore = createInteriorPlanStore({
    storage,
    createId: () => "old-bundle-id",
    now: () => "2026-10-28T00:00:00.000Z",
  });
  const before = rawPlans(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).find(
    (plan) => plan.id === planId,
  )!;
  for (const item of before.items) {
    const { id, createdAt, updatedAt, ...fields } = item;
    void [createdAt, updatedAt];
    expect(oldStore.updateItem(planId, id, fields)).toEqual({ ok: true });
  }
  const after = rawPlans(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).find(
    (plan) => plan.id === planId,
  )!;
  const withoutTime = ({ updatedAt, ...rest }: InteriorItem) => {
    void updatedAt;
    return rest;
  };
  expect(after.items.map(withoutTime)).toStrictEqual(before.items.map(withoutTime));
}

const itemOf = (store: InteriorPlanStore, planId: string, itemId: string) => {
  const snapshot = store.getSnapshot();
  if (snapshot.status !== "ok") throw new Error(snapshot.status);
  const item = snapshot.plans
    .find((plan) => plan.id === planId)
    ?.items.find((candidate) => candidate.id === itemId);
  if (item === undefined) throw new Error(`없는 항목 ${itemId}`);
  return item;
};

describe("AC-0(e) 새 쓰기 함수가 만든 P: 옛 번들이 읽고 다시 써도 같은 값", () => {
  it("로그아웃에서 [줄 추가] R1~R5로 만든 P → 옛 번들 읽기 결과 === 원문, 다시 써도 글자까지 같다", () => {
    const { raw, storage, planId } = createPlanPWithNewWrites();
    const [plan] = rawPlans(raw);
    // 새 줄 = 견적 1개 항목, 공간은 [전체] 하나, 상태 계획, 비고 없음(memo 키 없음)
    expect(plan.items).toHaveLength(5);
    for (const item of plan.items) {
      expect(item.spaceId).toBe(plan.spaces[0].id);
      expect(item.status).toBe("planned");
      expect(item.quotes).toHaveLength(1);
      expect(Object.hasOwn(item, "memo")).toBe(false);
    }
    expect(buildInteriorPlanRows(plan).plannedTotalWon).toBe(8_000_000);
    expectOldBundleKeepsRaw(raw);
    expectOldBundleRewriteKeepsItems(storage, planId);
    expectOldBundleKeepsRaw(storage.getItem(INTERIOR_PLANS_STORAGE_KEY));
  });
});

describe("AC-0(e) 옛 계획 L을 새 화면의 쓰기로 고친 원문: 옛 번들이 읽고 다시 써도 같은 값", () => {
  /** L(+ 옛 P)을 저장소에 두고, 새 화면이 하는 쓰기를 차례로 한다. 쓰기마다 옛 번들 계약을 본다 */
  function setup() {
    const storage = createMemoryStorage({
      [INTERIOR_PLANS_STORAGE_KEY]: JSON.stringify({ plans: [makePlanL(), makePlanP()] }),
    });
    const createId = createHexIds("b");
    const store = createInteriorPlanStore({
      storage,
      createId,
      now: () => "2026-10-27T09:00:00.000Z",
    });
    return { storage, store, createId };
  }

  const values = (patch: Partial<Parameters<typeof addLineInput>[2]>) => ({
    trade: "욕실",
    vendor: "욕실나라",
    amountWon: 4_000_000,
    isConfirmed: false,
    ...patch,
  });

  it("D2 a 제자리 수정·빈 줄 채우기·확정 옮김/해제·견적 삭제·항목 삭제·줄 추가: 쓰기마다 옛 번들 읽기 === 원문", () => {
    const { storage, store, createId } = setup();
    const raw = () => storage.getItem(INTERIOR_PLANS_STORAGE_KEY);
    const writes: [string, () => { ok: boolean }][] = [
      [
        "욕실나라 견적 400만 → 3,800,000원(X 제자리)",
        () =>
          store.updateItem(
            "plan-l",
            "item-x",
            editLineInput(
              itemOf(store, "plan-l", "item-x"),
              "q2",
              values({ amountWon: 3_800_000, note: "폐기물 포함" }),
              createId,
            ),
          ),
      ],
      [
        "Y에 육문수·1,800,000원 채우기",
        () =>
          store.updateItem(
            "plan-l",
            "item-y",
            editLineInput(
              itemOf(store, "plan-l", "item-y"),
              null,
              values({ trade: "도배", vendor: "육문수", amountWon: 1_800_000 }),
              createId,
            ),
          ),
      ],
      [
        "욕실나라 체크(X 확정 q1 → q2)",
        () =>
          store.updateItem(
            "plan-l",
            "item-x",
            toggleLineConfirmInput(itemOf(store, "plan-l", "item-x"), "q2", true),
          ),
      ],
      [
        "욕실나라 해제(X 확정 키 삭제)",
        () =>
          store.updateItem(
            "plan-l",
            "item-x",
            toggleLineConfirmInput(itemOf(store, "plan-l", "item-x"), "q2", false),
          ),
      ],
      [
        "옛 P 샷시(견적 2개)의 확정 E 줄 삭제",
        () => {
          const removal = removeLineWrite(itemOf(store, "plan-p", "item-sash"), "q-e");
          if (removal.kind !== "updateItem") throw new Error(removal.kind);
          return store.updateItem("plan-p", "item-sash", removal.input);
        },
      ],
      [
        "타일 덧방 삭제(Z 항목째)",
        () => {
          const removal = removeLineWrite(itemOf(store, "plan-l", "item-z"), "q3");
          if (removal.kind !== "removeItem") throw new Error(removal.kind);
          return store.removeItem("plan-l", "item-z");
        },
      ],
      [
        "L에 줄 추가(첫 공간 s0)",
        () =>
          store.addItem(
            "plan-l",
            addLineInput(
              "s0",
              createId(),
              values({ trade: "도배", vendor: "동네도배", detail: "합지", isConfirmed: true }),
            ),
          ),
      ],
    ];
    for (const [name, write] of writes) {
      expect(write(), name).toMatchObject({ ok: true });
      expectOldBundleKeepsRaw(raw());
    }
    expectOldBundleRewriteKeepsItems(storage, "plan-l");
    expectOldBundleRewriteKeepsItems(storage, "plan-p");

    // 숨은 값은 끝까지 남아 있다(X의 예산·지급·상태·날짜·연락처·공간, Y의 예산·상태·공간)
    const plans: InteriorPlanWithItems[] = rawPlans(raw());
    const [x, y] = plans[0].items;
    expect(x).toMatchObject({
      id: "item-x",
      spaceId: "s1",
      budget: 350,
      status: "inProgress",
      startDate: "2026-11-03",
      endDate: "2026-11-07",
      memo: "폐기물 포함",
      payments: makePlanL().items[0].payments,
    });
    expect(x.quotes?.[0]).toStrictEqual(makePlanL().items[0].quotes?.[0]);
    expect(Object.hasOwn(x, "confirmedQuoteId")).toBe(false);
    expect(y).toMatchObject({ id: "item-y", spaceId: "s0", budget: 200, status: "planned" });
    // 옛 P에서 확정 견적을 지우면 확정 키도 빠진다(검증이 quotes 밖 확정 id를 거부)
    const sash = plans[1].items.find((item) => item.id === "item-sash")!;
    expect(sash.quotes?.map((quote) => quote.id)).toEqual(["q-d"]);
    expect(Object.hasOwn(sash, "confirmedQuoteId")).toBe(false);
  });
});
