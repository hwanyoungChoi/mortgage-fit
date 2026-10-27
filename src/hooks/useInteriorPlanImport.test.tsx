// @vitest-environment jsdom
// 로그인 이전(스펙 interior-planner AC-8 클라이언트, AC-10 플랜 이전, "동기화·이전 규칙", ADR-029 조건 5·6).
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { meQueryKey } from "@/hooks/useMe";
import {
  createInteriorPlanImportStore,
  INTERIOR_PLAN_IMPORTS_STORAGE_KEY,
} from "@/lib/utils/interiorPlanImportStorage";
import {
  createInteriorPlanStore,
  INTERIOR_PLANS_STORAGE_KEY,
} from "@/lib/utils/interiorPlanStorage";
import { errorResponse, createFakePlanApi } from "@/test/fakePlanApi";
import { makePlanP, toStoredPlans } from "@/test/interiorPlanFixture";
import { createMemoryStorage } from "@/test/memoryStorage";

import { isInteriorPlanImportSettled, useInteriorPlanImport } from "./useInteriorPlanImport";

import type { InteriorItem, InteriorPlanWithItems } from "@/lib/types/interiorPlan";

const USER_ID = "user-b";
const IMPORT_PATH = "/api/interior-plans/import";
/** 서버 본문 한도(`server/interiorPlans/handleInteriorPlans.ts` IMPORT_MAX_BYTES, 넘으면 413) */
const MAX_BODY_BYTES = 1024 * 1024;

/** 로컬 매물과 연결된 계획(listingId 유지 확인용) */
const planOne = () =>
  makePlanP({ id: "plan-one", name: "래미안 84", listingId: "listing-1", items: [] });
const planTwo = () => makePlanP({ id: "plan-two", name: "두 번째" });

type SetupOptions = {
  isInHousehold?: boolean;
  plans?: InteriorPlanWithItems[];
  /** `interior-plan-imports` 원문 */
  imports?: Record<string, string[]>;
  /** 계정에 이미 있는 계획 */
  serverPlans?: InteriorPlanWithItems[];
  storage?: Storage;
};

function setup({
  isInHousehold = false,
  plans = [planOne(), planTwo()],
  imports,
  serverPlans = [],
  storage: givenStorage,
}: SetupOptions = {}) {
  const storage =
    givenStorage ??
    createMemoryStorage({
      [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans(plans),
      ...(imports === undefined
        ? {}
        : { [INTERIOR_PLAN_IMPORTS_STORAGE_KEY]: JSON.stringify(imports) }),
    });
  const plansRaw = storage.getItem(INTERIOR_PLANS_STORAGE_KEY);
  const importsRaw = storage.getItem(INTERIOR_PLAN_IMPORTS_STORAGE_KEY);
  const interiorPlanStore = createInteriorPlanStore({
    storage,
    createId: () => "local-new",
    now: () => "2026-10-27T00:00:00.000Z",
  });
  const interiorPlanImportStore = createInteriorPlanImportStore({ storage });
  const api = createFakePlanApi({ userId: USER_ID, isInHousehold, plans: serverPlans });
  const onImported = vi.fn();
  const setItem = vi.spyOn(storage, "setItem");
  const removeItem = vi.spyOn(storage, "removeItem");
  const hook = renderHook(
    () => useInteriorPlanImport({ interiorPlanStore, interiorPlanImportStore, onImported }),
    { wrapper: api.wrapper },
  );
  const sent = () => api.callsTo("POST", IMPORT_PATH);
  const sentIds = () => sent().map((call) => (call.body as { plan: { id: string } }).plan.id);
  const records = () =>
    JSON.parse(storage.getItem(INTERIOR_PLAN_IMPORTS_STORAGE_KEY) ?? "null") as Record<
      string,
      string[]
    > | null;
  const state = () => hook.result.current.state;
  const settled = () => isInteriorPlanImportSettled(state(), USER_ID);
  return {
    storage,
    plansRaw,
    importsRaw,
    api,
    onImported,
    setItem,
    removeItem,
    hook,
    sent,
    sentIds,
    records,
    state,
    settled,
  };
}

/** 같은 저장소로 앱을 다시 띄운다(로그아웃 → 재로그인, 새로고침) */
function relogin(storage: Storage, serverPlans: InteriorPlanWithItems[]) {
  return setup({ storage, serverPlans });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useInteriorPlanImport — 혼자 쓰는 계정(AC-8)", () => {
  it("기록에 없는 로컬 계획을 1개씩 보내고(본문 = 로컬 원문 그대로, listingId 포함) 보낼 때마다 Record<userId, planId[]>에 기록, 알림 1회", async () => {
    const { sent, records, onImported, state, settled, plansRaw, storage } = setup();

    await waitFor(() =>
      expect(state()).toEqual({ userId: USER_ID, status: "done", importedCount: 2 }),
    );
    expect(settled()).toBe(true);
    expect(sent()).toHaveLength(2);
    // 1개씩, id·시각·항목 그대로
    expect(sent().map((call) => call.body)).toEqual([{ plan: planOne() }, { plan: planTwo() }]);
    expect((sent()[0].body as { plan: InteriorPlanWithItems }).plan.listingId).toBe("listing-1");
    expect(records()).toEqual({ [USER_ID]: ["plan-one", "plan-two"] });
    expect(onImported).toHaveBeenCalledTimes(1);
    // 로컬 원본은 읽기만 한다
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe(plansRaw);
  });

  it("쓰기는 interior-plan-imports 키에만 한다(setItem 대상), removeItem 0회", async () => {
    const { setItem, removeItem, state } = setup();
    await waitFor(() => expect(state()?.status).toBe("done"));
    expect(new Set(setItem.mock.calls.map(([key]) => key))).toEqual(
      new Set([INTERIOR_PLAN_IMPORTS_STORAGE_KEY]),
    );
    expect(removeItem).not.toHaveBeenCalled();
  });

  it("재로그인(같은 저장소): 기록에 있는 계획은 다시 보내지 않고 알림도 없다", async () => {
    const first = setup();
    await waitFor(() => expect(first.state()?.status).toBe("done"));
    const serverPlans = first.api.server.plans;
    first.hook.unmount();

    const second = relogin(first.storage, serverPlans);
    await waitFor(() =>
      expect(second.state()).toEqual({ userId: USER_ID, status: "done", importedCount: 0 }),
    );
    expect(second.sent()).toHaveLength(0);
    expect(second.onImported).not.toHaveBeenCalled();
    expect(second.api.server.plans.map((plan) => plan.id)).toEqual(["plan-one", "plan-two"]);
  });

  it("로그인 뒤 로그아웃 상태에서 새로 만든(기록에 없는) 계획은 다음 로그인에 그것만 올라간다", async () => {
    const plans = [planOne(), planTwo(), makePlanP({ id: "plan-later", name: "나중" })];
    const { sentIds, records, state, onImported } = setup({
      plans,
      imports: { [USER_ID]: ["plan-one", "plan-two"] },
    });
    await waitFor(() =>
      expect(state()).toEqual({ userId: USER_ID, status: "done", importedCount: 1 }),
    );
    expect(sentIds()).toEqual(["plan-later"]);
    expect(records()).toEqual({ [USER_ID]: ["plan-one", "plan-two", "plan-later"] });
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it("다른 계정의 기록은 이 계정 이전을 막지 않고, 그 기록도 그대로 남는다", async () => {
    const { sentIds, records, state } = setup({ imports: { "user-a": ["plan-one"] } });
    await waitFor(() => expect(state()?.status).toBe("done"));
    expect(sentIds()).toEqual(["plan-one", "plan-two"]);
    expect(records()).toEqual({ "user-a": ["plan-one"], [USER_ID]: ["plan-one", "plan-two"] });
  });

  it("계정에 같은 id가 이미 있으면(imported 0) 기록은 하고 알림은 없다(importedCount 0)", async () => {
    const { sent, records, state, onImported } = setup({ serverPlans: [planOne(), planTwo()] });
    await waitFor(() =>
      expect(state()).toEqual({ userId: USER_ID, status: "done", importedCount: 0 }),
    );
    expect(sent()).toHaveLength(2);
    expect(records()).toEqual({ [USER_ID]: ["plan-one", "plan-two"] });
    expect(onImported).not.toHaveBeenCalled();
  });

  it("일부만 새로 들어가도(imported 1·0) 둘 다 기록하고 알림 1회, importedCount 1", async () => {
    const { records, state, onImported } = setup({ serverPlans: [planOne()] });
    await waitFor(() =>
      expect(state()).toEqual({ userId: USER_ID, status: "done", importedCount: 1 }),
    );
    expect(records()).toEqual({ [USER_ID]: ["plan-one", "plan-two"] });
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it("로컬 계획 0개면 요청 0건·기록 0건·done(0)", async () => {
    const { sent, setItem, state, onImported } = setup({ plans: [] });
    await waitFor(() =>
      expect(state()).toEqual({ userId: USER_ID, status: "done", importedCount: 0 }),
    );
    expect(sent()).toHaveLength(0);
    expect(setItem).not.toHaveBeenCalled();
    expect(onImported).not.toHaveBeenCalled();
  });

  it("손상된 로컬 원문이면 보내지 않고 skipped(corrupt), 원문·기록 그대로, settled 참", async () => {
    const storage = createMemoryStorage({ [INTERIOR_PLANS_STORAGE_KEY]: "{not json" });
    const { sent, setItem, removeItem, state, settled } = setup({ storage });
    await waitFor(() =>
      expect(state()).toEqual({ userId: USER_ID, status: "skipped", reason: "corrupt" }),
    );
    expect(settled()).toBe(true);
    expect(sent()).toHaveLength(0);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe("{not json");
  });
});

describe("useInteriorPlanImport — 실패", () => {
  it("첫 계획에서 400(계정 3개 상한)이면 멈춘다: failed(limit, 2개), 요청 1건, 기록 0건, 알림 없음", async () => {
    const { api, sent, setItem, state, settled, onImported } = setup();
    api.server.respond = (call) =>
      call.path === IMPORT_PATH ? errorResponse(400, "invalidParams") : undefined;
    await waitFor(() =>
      expect(state()).toEqual({
        userId: USER_ID,
        status: "failed",
        reason: "limit",
        failedCount: 2,
      }),
    );
    expect(settled()).toBe(true);
    expect(sent()).toHaveLength(1);
    expect(setItem).not.toHaveBeenCalled();
    expect(onImported).not.toHaveBeenCalled();
  });

  it("두 번째 계획에서 400이면 첫 계획만 기록하고 failed(limit, 1개). retry()는 남은 것만 보낸다", async () => {
    const { api, sentIds, records, state, hook } = setup();
    api.server.respond = (call) =>
      call.path === IMPORT_PATH && (call.body as { plan: { id: string } }).plan.id === "plan-two"
        ? errorResponse(400, "invalidParams")
        : undefined;
    await waitFor(() =>
      expect(state()).toEqual({
        userId: USER_ID,
        status: "failed",
        reason: "limit",
        failedCount: 1,
      }),
    );
    expect(sentIds()).toEqual(["plan-one", "plan-two"]);
    expect(records()).toEqual({ [USER_ID]: ["plan-one"] });

    api.server.respond = undefined;
    act(() => hook.result.current.retry());
    await waitFor(() =>
      expect(state()).toEqual({ userId: USER_ID, status: "done", importedCount: 1 }),
    );
    expect(sentIds()).toEqual(["plan-one", "plan-two", "plan-two"]);
    expect(records()).toEqual({ [USER_ID]: ["plan-one", "plan-two"] });
  });

  it("연결 실패(fetch reject)면 failed(network), 기록 0건", async () => {
    const { api, setItem, state } = setup();
    api.server.respond = (call) =>
      call.path === IMPORT_PATH ? Promise.reject(new TypeError("Failed to fetch")) : undefined;
    await waitFor(() =>
      expect(state()).toEqual({
        userId: USER_ID,
        status: "failed",
        reason: "network",
        failedCount: 2,
      }),
    );
    expect(setItem).not.toHaveBeenCalled();
  });

  it("500이면 failed(network)", async () => {
    const { api, state } = setup();
    api.server.respond = (call) =>
      call.path === IMPORT_PATH ? errorResponse(500, "internal") : undefined;
    await waitFor(() => expect(state()).toMatchObject({ status: "failed", reason: "network" }));
  });
});

describe("useInteriorPlanImport — 서버 409 inHousehold(ADR-029 조건 5)", () => {
  it("me가 혼자로 보여도 서버가 409면 기록하지 않고 skipped(serverHousehold), me를 다시 받는다, 되풀이하지 않는다", async () => {
    const { api, sent, setItem, state, settled, onImported } = setup();
    // 클라이언트의 me는 혼자인데 서버는 가구(낡은 me)
    api.server.respond = (call) =>
      call.path === IMPORT_PATH ? errorResponse(409, "inHousehold") : undefined;
    const meCallsBefore = () => api.callsTo("GET", "/api/me").length;

    await waitFor(() =>
      expect(state()).toEqual({ userId: USER_ID, status: "skipped", reason: "serverHousehold" }),
    );
    expect(settled()).toBe(true);
    expect(sent()).toHaveLength(1);
    expect(setItem).not.toHaveBeenCalled();
    expect(onImported).not.toHaveBeenCalled();
    await waitFor(() => expect(meCallsBefore()).toBeGreaterThanOrEqual(2));
    // me가 계속 혼자여도 같은 세션에서 다시 보내지 않는다
    await act(() => api.queryClient.refetchQueries({ queryKey: meQueryKey() }));
    expect(sent()).toHaveLength(1);
  });

  it("409 뒤 me가 가구를 보이면 household로 바뀌고, 나가면 그때 한 번 보낸다", async () => {
    const { api, sentIds, records, state } = setup();
    api.server.respond = (call) =>
      call.path === IMPORT_PATH ? errorResponse(409, "inHousehold") : undefined;
    await waitFor(() => expect(state()).toMatchObject({ reason: "serverHousehold" }));

    api.server.respond = undefined;
    await api.setHousehold(true);
    await waitFor(() =>
      expect(state()).toEqual({ userId: USER_ID, status: "skipped", reason: "household" }),
    );
    expect(sentIds()).toEqual(["plan-one"]);

    await api.setHousehold(false);
    await waitFor(() =>
      expect(state()).toEqual({ userId: USER_ID, status: "done", importedCount: 2 }),
    );
    expect(sentIds()).toEqual(["plan-one", "plan-one", "plan-two"]);
    expect(records()).toEqual({ [USER_ID]: ["plan-one", "plan-two"] });
  });
});

describe("useInteriorPlanImport — 함께 쓰는 중(AC-10)", () => {
  it("요청 0건·기록 0건·skipped(household)·settled 참, 로컬 원문 그대로, 알림 없음", async () => {
    const { sent, setItem, removeItem, state, settled, storage, plansRaw, onImported } = setup({
      isInHousehold: true,
    });
    await waitFor(() =>
      expect(state()).toEqual({ userId: USER_ID, status: "skipped", reason: "household" }),
    );
    expect(settled()).toBe(true);
    expect(sent()).toHaveLength(0);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe(plansRaw);
    expect(storage.getItem(INTERIOR_PLAN_IMPORTS_STORAGE_KEY)).toBeNull();
    expect(onImported).not.toHaveBeenCalled();
  });

  it("다른 계정의 기록이 있어도 그 원문 그대로(바이트 같음)", async () => {
    const { storage, importsRaw, state, sent } = setup({
      isInHousehold: true,
      imports: { "user-a": ["plan-one"] },
    });
    await waitFor(() => expect(state()?.status).toBe("skipped"));
    expect(sent()).toHaveLength(0);
    expect(storage.getItem(INTERIOR_PLAN_IMPORTS_STORAGE_KEY)).toBe(importsRaw);
  });

  it("가구 상태의 retry()는 send 0회", async () => {
    const { hook, sent, setItem, state } = setup({ isInHousehold: true });
    await waitFor(() => expect(state()?.status).toBe("skipped"));
    act(() => hook.result.current.retry());
    await waitFor(() => expect(state()?.status).toBe("skipped"));
    expect(sent()).toHaveLength(0);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("같은 userId에서 household가 null로 바뀌면 1회 실행(계획마다 1요청), 기록, 알림 1회", async () => {
    const { api, sentIds, records, state, onImported } = setup({ isInHousehold: true });
    await waitFor(() => expect(state()?.status).toBe("skipped"));

    await api.setHousehold(false);

    await waitFor(() =>
      expect(state()).toEqual({ userId: USER_ID, status: "done", importedCount: 2 }),
    );
    expect(sentIds()).toEqual(["plan-one", "plan-two"]);
    expect(records()).toEqual({ [USER_ID]: ["plan-one", "plan-two"] });
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it("두 번째 가입 → 나가기 전환에서 중복 전송 없음(가입 중 skipped로 되돌아가지 않음)", async () => {
    const { api, sent, state, onImported } = setup({ isInHousehold: true });
    await waitFor(() => expect(state()?.status).toBe("skipped"));
    await api.setHousehold(false);
    await waitFor(() => expect(state()?.status).toBe("done"));
    expect(sent()).toHaveLength(2);

    await api.setHousehold(true);
    await api.setHousehold(false);
    await waitFor(() => expect(state()?.status).toBe("done"));
    expect(sent()).toHaveLength(2);
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it("혼자 → 가입 전환은 다시 실행하지 않는다(이미 done)", async () => {
    const { api, sent, state } = setup();
    await waitFor(() => expect(state()?.status).toBe("done"));
    await api.setHousehold(true);
    await api.setHousehold(false);
    expect(sent()).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------------------------
// 1MB 실측(스펙 "크기 상한 계산"): 보낼 본문 = JSON.stringify({ plan })의 UTF-8 바이트.
// 짝 없는 서로게이트는 JSON에서 `\udXXX` 6바이트라, 항목 100개 한도 안에서도 1MB를 넘길 수 있다.

const LONE = "\ud800";
const bodyBytes = (plan: InteriorPlanWithItems) =>
  new TextEncoder().encode(JSON.stringify({ plan })).byteLength;

/** 텍스트 칸 길이(코드포인트 상한) 순서. 앞 칸부터 ASCII로 바꾼다 */
const FIELD_LENGTHS = { memo: 500, trade: 30, vendor: 30, contact: 30, quoteMemo: 200, label: 10 };
const CHARS_PER_ITEM =
  FIELD_LENGTHS.memo + FIELD_LENGTHS.trade + 5 * (30 + 30 + 200) + 5 * FIELD_LENGTHS.label;

/** 텍스트가 모두 상한 길이인 항목. 앞에서부터 `ascii`자는 'a'(1바이트), 나머지는 짝 없는 서로게이트(6바이트) */
function heavyItem(index: number, ascii: number): InteriorItem {
  let left = Math.max(0, ascii);
  const text = (length: number) => {
    const plain = Math.min(left, length);
    left -= plain;
    return "a".repeat(plain) + LONE.repeat(length - plain);
  };
  const memo = text(FIELD_LENGTHS.memo);
  const trade = text(FIELD_LENGTHS.trade);
  const quotes = Array.from({ length: 5 }, (_, quote) => ({
    id: `q${quote}`,
    vendor: text(FIELD_LENGTHS.vendor),
    contact: text(FIELD_LENGTHS.contact),
    amount: 100,
    memo: text(FIELD_LENGTHS.quoteMemo),
  }));
  const payments = Array.from({ length: 5 }, (_, payment) => ({
    id: `pay${payment}`,
    label: text(FIELD_LENGTHS.label),
    amount: 10,
    isPaid: false,
  }));
  return {
    id: `heavy${String(index).padStart(3, "0")}`,
    spaceId: "sp-all",
    trade,
    quotes,
    payments,
    status: "quoting",
    memo,
    createdAt: "2026-10-26T00:00:00.000Z",
    updatedAt: "2026-10-26T00:00:00.000Z",
  };
}

/** 보낼 본문이 정확히 `target` 바이트인 계획(검증 한도 안: 항목 ≤100, 칸 ≤ 상한) */
function planWithBodyBytes(id: string, target: number): InteriorPlanWithItems {
  const build = (count: number, ascii: number, trimmed: number) => {
    let left = ascii;
    const items = Array.from({ length: count }, (_, index) => {
      const share = Math.min(left, CHARS_PER_ITEM);
      left -= share;
      return heavyItem(index, share);
    });
    // 첫 항목 메모 앞의 ASCII를 `trimmed`자 덜어 1바이트씩 맞춘다
    items[0] = { ...items[0], memo: items[0].memo!.slice(trimmed) };
    return makePlanP({ id, items });
  };
  // 항목을 늘려 처음으로 target 이상이 되는 개수를 찾고, 넘친 만큼 서로게이트→ASCII(−5바이트)와 메모 앞 ASCII 덜기(−1바이트)로 맞춘다
  let count = 1;
  for (;;) {
    const excess = bodyBytes(build(count, 0, 0)) - target;
    if (excess >= 0 && Math.floor(excess / 5) >= excess % 5) {
      const plan = build(count, Math.floor(excess / 5), excess % 5);
      if (plan.items.length > 100) throw new Error("항목 100개 안에서 만들 수 없음");
      return plan;
    }
    count += 1;
  }
}

describe("useInteriorPlanImport — 본문 1MB 실측", () => {
  it("(준비 확인) 만든 계획의 본문 크기가 정확하고 로컬 검증을 통과한다", () => {
    const over = planWithBodyBytes("plan-over", MAX_BODY_BYTES + 1);
    const at = planWithBodyBytes("plan-at", MAX_BODY_BYTES);
    expect(bodyBytes(over)).toBe(MAX_BODY_BYTES + 1);
    expect(bodyBytes(at)).toBe(MAX_BODY_BYTES);
    expect(over.items.length).toBeLessThanOrEqual(100);
    const storage = createMemoryStorage({
      [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans([over, at]),
    });
    const snapshot = createInteriorPlanStore({
      storage,
      createId: () => "x",
      now: () => "2026-10-27T00:00:00.000Z",
    }).getSnapshot();
    expect(snapshot.status).toBe("ok");
    // 한글만이면(3바이트) 항목 100개 최악도 1MB 안이다(스펙 계산 ~0.7MB 확인)
    const korean = makePlanP({
      id: "plan-korean",
      items: Array.from({ length: 100 }, (_, index) => {
        const item = heavyItem(index, 0);
        const swap = (text: string) => text.replaceAll(LONE, "가");
        return {
          ...item,
          trade: swap(item.trade),
          memo: swap(item.memo!),
          quotes: item.quotes!.map((quote) => ({
            ...quote,
            vendor: swap(quote.vendor),
            contact: swap(quote.contact!),
            memo: swap(quote.memo!),
          })),
          payments: item.payments!.map((payment) => ({ ...payment, label: swap(payment.label) })),
        };
      }),
    });
    expect(bodyBytes(korean)).toBeLessThan(MAX_BODY_BYTES);
    expect(bodyBytes(korean)).toBeGreaterThan(600_000);
  });

  it("1,048,577바이트 계획은 보내지 않고 다음 계획은 보낸다: failed(tooLarge, 1개), 기록은 보낸 것만", async () => {
    const over = planWithBodyBytes("plan-over", MAX_BODY_BYTES + 1);
    const small = planTwo();
    const { sentIds, records, state, onImported } = setup({ plans: [over, small] });
    await waitFor(() =>
      expect(state()).toEqual({
        userId: USER_ID,
        status: "failed",
        reason: "tooLarge",
        failedCount: 1,
      }),
    );
    expect(sentIds()).toEqual(["plan-two"]);
    expect(records()).toEqual({ [USER_ID]: ["plan-two"] });
    // 크기 초과는 실패로 안내하므로 "옮겼습니다" 알림은 띄우지 않는다(현재 동작 고정)
    expect(onImported).not.toHaveBeenCalled();
  });

  it("정확히 1,048,576바이트면 보낸다(서버도 > 한도만 413)", async () => {
    const at = planWithBodyBytes("plan-at", MAX_BODY_BYTES);
    const { sent, state } = setup({ plans: [at] });
    await waitFor(() =>
      expect(state()).toEqual({ userId: USER_ID, status: "done", importedCount: 1 }),
    );
    expect(sent()).toHaveLength(1);
    expect(new TextEncoder().encode(JSON.stringify(sent()[0].body)).byteLength).toBe(
      MAX_BODY_BYTES,
    );
  });
});
