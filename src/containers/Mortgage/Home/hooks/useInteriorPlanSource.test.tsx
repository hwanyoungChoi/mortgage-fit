// @vitest-environment jsdom
// [인테리어] 출처·서버 목록(스펙 interior-planner AC-7·9 클라이언트, "동기화·이전 규칙", "화면 — 상태", ADR-029 조건 8).
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { interiorPlanListQueryKey } from "@/hooks/useInteriorPlanList";
import { HOUSEHOLD_REFETCH_INTERVAL_MS } from "@/lib/constants/household";
import {
  createInteriorPlanStore,
  INTERIOR_PLANS_STORAGE_KEY,
} from "@/lib/utils/interiorPlanStorage";
import { createSessionHintStore, SESSION_HINT_STORAGE_KEY } from "@/lib/utils/sessionHintStorage";
import { createFakePlanApi, errorResponse, jsonResponse, PENDING } from "@/test/fakePlanApi";
import { makePlanP, pKitchen, pTile, toStoredPlans } from "@/test/interiorPlanFixture";
import { createMemoryStorage } from "@/test/memoryStorage";

import { useInteriorPlanSource } from "./useInteriorPlanSource";

import type { InteriorPlanImport } from "@/hooks/useInteriorPlanImport";
import type {
  InteriorItem,
  InteriorItemInput,
  InteriorPlanWithItems,
} from "@/lib/types/interiorPlan";
import type { InteriorPlanImportState } from "@/lib/types/interiorPlanImport";

const USER_ID = "user-a";
const PLANS_PATH = "/api/interior-plans";

const localPlan = () => makePlanP({ id: "local-plan", name: "기기 계획" });
const serverPlan = () => makePlanP({ id: "plan-p" });

const doneImport = (userId = USER_ID): InteriorPlanImportState => ({
  userId,
  status: "done",
  importedCount: 0,
});

type SetupOptions = {
  userId?: string | null;
  isInHousehold?: boolean;
  serverPlans?: InteriorPlanWithItems[];
  importState?: InteriorPlanImportState | null;
  /** `/api/me`가 응답하지 않는다(로그인 확인 전) */
  isMePending?: boolean;
  hasSessionHint?: boolean;
};

function setup({
  userId = USER_ID,
  isInHousehold = false,
  serverPlans = [serverPlan()],
  importState = doneImport(),
  isMePending = false,
  hasSessionHint = userId !== null,
}: SetupOptions = {}) {
  const storage = createMemoryStorage({
    [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans([localPlan()]),
    ...(hasSessionHint ? { [SESSION_HINT_STORAGE_KEY]: "1" } : {}),
  });
  const localRaw = storage.getItem(INTERIOR_PLANS_STORAGE_KEY);
  const store = createInteriorPlanStore({
    storage,
    createId: () => "local-new",
    now: () => "2026-10-27T09:00:00.000Z",
  });
  const sessionHintStore = createSessionHintStore({ storage });
  const api = createFakePlanApi({ userId, isInHousehold, plans: serverPlans });
  if (isMePending) {
    api.server.respond = (call) => (call.path === "/api/me" ? PENDING : undefined);
  }
  let planImport: InteriorPlanImport = { state: importState, retry: vi.fn() };
  const hook = renderHook(() => useInteriorPlanSource({ store, sessionHintStore, planImport }), {
    wrapper: api.wrapper,
  });
  return {
    storage,
    localRaw,
    store,
    api,
    hook,
    source: () => hook.result.current,
    plansGets: () => api.callsTo("GET", PLANS_PATH).length,
    cachedPlans: () =>
      api.queryClient.getQueryData<InteriorPlanWithItems[]>(interiorPlanListQueryKey()),
    setImportState(state: InteriorPlanImportState | null) {
      planImport = { state, retry: vi.fn() };
      hook.rerender();
    },
  };
}

/** 항목 → PUT 본문(시트가 보내는 입력 전체) */
const toInput = ({ id: _id, createdAt: _c, updatedAt: _u, ...input }: InteriorItem) => {
  void _id;
  void _c;
  void _u;
  return input as InteriorItemInput;
};

async function loggedIn(options: SetupOptions = {}) {
  const ctx = setup(options);
  await waitFor(() => expect(ctx.source().list.status).toBe("ok"));
  return ctx;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("출처 선택", () => {
  it("로그인 확인(me) 응답 전: loading, 서버 계획 GET 0건, 쓰기는 notReady(로컬로 몰래 쓰지 않음)", async () => {
    const { source, plansGets, storage, localRaw } = setup({ isMePending: true });
    expect(source().status).toBe("loading");
    expect(source().list).toEqual({ status: "loading" });
    await act(async () => {
      expect(await source().removePlan("local-plan")).toEqual({ ok: false, reason: "notReady" });
    });
    expect(plansGets()).toBe(0);
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe(localRaw);
  });

  it("로그아웃(user null): loggedOut, 목록 = 로컬 원본, 서버 계획 GET 0건", async () => {
    const { source, plansGets } = setup({ userId: null, importState: null });
    await waitFor(() => expect(source().status).toBe("loggedOut"));
    expect(source().list).toEqual({ status: "ok", plans: [localPlan()] });
    expect(source().household).toBeNull();
    expect(plansGets()).toBe(0);
  });

  it("로그인했지만 이전이 끝나기 전(state null·running): loading, 서버 GET 0건. 끝나면 loggedIn·서버 목록", async () => {
    const ctx = setup({ importState: null });
    await waitFor(() => expect(ctx.api.callsTo("GET", "/api/me")).toHaveLength(1));
    await act(async () => {});
    expect(ctx.source().status).toBe("loading");
    ctx.setImportState({ userId: USER_ID, status: "running" });
    expect(ctx.source().status).toBe("loading");
    expect(ctx.plansGets()).toBe(0);

    ctx.setImportState(doneImport());
    await waitFor(() => expect(ctx.source().list).toEqual({ status: "ok", plans: [serverPlan()] }));
    expect(ctx.source().status).toBe("loggedIn");
    expect(ctx.plansGets()).toBe(1);
  });

  it("다른 사용자의 이전 결과로는 loggedIn이 되지 않는다", async () => {
    const ctx = setup({ importState: doneImport("someone-else") });
    await waitFor(() => expect(ctx.api.callsTo("GET", "/api/me")).toHaveLength(1));
    await act(async () => {});
    expect(ctx.source().status).toBe("loading");
    expect(ctx.plansGets()).toBe(0);
  });

  it("이전이 건너뜀(household)·실패여도 settled라 서버 목록을 연다(loading에 멈추지 않음)", async () => {
    for (const importState of [
      { userId: USER_ID, status: "skipped", reason: "household" },
      { userId: USER_ID, status: "failed", reason: "network", failedCount: 1 },
    ] as InteriorPlanImportState[]) {
      const ctx = setup({ importState, isInHousehold: importState.status === "skipped" });
      await waitFor(() => expect(ctx.source().list.status).toBe("ok"));
      ctx.hook.unmount();
    }
  });

  it("로그인 상태(혼자): loggedIn, 목록은 서버 것(로컬 계획 아님), household null, 로컬 원문 그대로", async () => {
    const { source, storage, localRaw } = await loggedIn();
    expect(source().status).toBe("loggedIn");
    expect(source().list).toEqual({ status: "ok", plans: [serverPlan()] });
    expect(source().household).toBeNull();
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe(localRaw);
  });

  it("로그인 상태(가구): household = { memberCount: 2 }", async () => {
    const { source } = await loggedIn({ isInHousehold: true });
    expect(source().household).toEqual({ memberCount: 2 });
  });

  it("로그인했던 브라우저인데 me 실패: error(accountError), retry()는 me를 다시 묻는다", async () => {
    const ctx = setup({ importState: null });
    ctx.api.server.respond = (call) =>
      call.path === "/api/me" ? errorResponse(500, "internal") : undefined;
    await ctx.api.queryClient.resetQueries();
    await waitFor(() => expect(ctx.source().status).toBe("error"));
    expect(ctx.source().list).toEqual({ status: "accountError" });
    const before = ctx.api.callsTo("GET", "/api/me").length;
    act(() => ctx.source().retry());
    await waitFor(() => expect(ctx.api.callsTo("GET", "/api/me").length).toBe(before + 1));
  });
});

describe("최신화: staleTime 0 + 포커스, 가구일 때만 30초(AC-7·9)", () => {
  it("혼자 쓰는 사용자: 30초·90초가 지나도 계획 GET 추가 0건(주기 요청 없음)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { plansGets, api } = await loggedIn();
    expect(plansGets()).toBe(1);
    const meBefore = api.callsTo("GET", "/api/me").length;
    await act(() => vi.advanceTimersByTimeAsync(HOUSEHOLD_REFETCH_INTERVAL_MS + 1000));
    await act(() => vi.advanceTimersByTimeAsync(HOUSEHOLD_REFETCH_INTERVAL_MS * 2));
    expect(plansGets()).toBe(1);
    expect(api.callsTo("GET", "/api/me").length).toBe(meBefore);
  });

  it("함께 쓰는 중: 30초마다 계획 GET 1건씩", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { plansGets } = await loggedIn({ isInHousehold: true });
    const first = plansGets();
    await act(() => vi.advanceTimersByTimeAsync(HOUSEHOLD_REFETCH_INTERVAL_MS));
    await waitFor(() => expect(plansGets()).toBe(first + 1));
    await act(() => vi.advanceTimersByTimeAsync(HOUSEHOLD_REFETCH_INTERVAL_MS));
    await waitFor(() => expect(plansGets()).toBe(first + 2));
  });

  it("창 포커스(visibilitychange)면 혼자여도 바로 다시 조회하고, 다른 기기가 바꾼 값을 보인다", async () => {
    const { plansGets, api, source } = await loggedIn();
    api.editItemOnServer("plan-p", "item-tile", { budget: 700 });
    act(() => {
      window.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(plansGets()).toBe(2));
    await waitFor(() => {
      const list = source().list;
      expect(list.status === "ok" && list.plans[0].items[1].budget).toBe(700);
    });
  });
});

describe("상태 안내(화면 — 상태)", () => {
  it("계획 GET 401: 세션 만료(isSessionExpired), 로그아웃 상태로, session-hint 정리", async () => {
    const ctx = setup();
    ctx.api.server.respond = (call) =>
      call.path === PLANS_PATH && call.method === "GET"
        ? errorResponse(401, "unauthorized")
        : undefined;
    await waitFor(() => expect(ctx.source().isSessionExpired).toBe(true));
    expect(ctx.source().status).toBe("loggedOut");
    expect(ctx.storage.getItem(SESSION_HINT_STORAGE_KEY)).toBeNull();
    expect(ctx.cachedPlans()).toBeUndefined();
  });

  it("계획 GET 500(받아 둔 목록 없음): loadFailed, retry() 뒤 성공하면 ok", async () => {
    const ctx = setup();
    ctx.api.server.respond = (call) =>
      call.path === PLANS_PATH ? errorResponse(500, "internal") : undefined;
    await waitFor(() => expect(ctx.source().list).toEqual({ status: "loadFailed" }));
    expect(ctx.source().isRefreshFailed).toBe(false);

    ctx.api.server.respond = undefined;
    act(() => ctx.source().retry());
    await waitFor(() => expect(ctx.source().list.status).toBe("ok"));
    expect(ctx.plansGets()).toBe(2);
  });

  it("응답 형식이 어긋난 계획이 하나라도 있으면 loadFailed(화면 계산에 넣지 않음)", async () => {
    const ctx = setup();
    ctx.api.server.respond = (call) =>
      call.path === PLANS_PATH
        ? jsonResponse(200, { plans: [serverPlan(), { ...serverPlan(), id: "bad", spaces: [] }] })
        : undefined;
    await waitFor(() => expect(ctx.source().list).toEqual({ status: "loadFailed" }));
  });

  it("받아 둔 목록이 있는데 재조회만 실패: 목록 유지 + isRefreshFailed", async () => {
    const ctx = await loggedIn();
    ctx.api.server.respond = (call) =>
      call.path === PLANS_PATH ? errorResponse(500, "internal") : undefined;
    await act(() => ctx.api.queryClient.refetchQueries({ queryKey: interiorPlanListQueryKey() }));
    await waitFor(() => expect(ctx.source().isRefreshFailed).toBe(true));
    expect(ctx.source().list).toEqual({ status: "ok", plans: [serverPlan()] });
  });

  it("함께 쓰는 중 항목 PUT 404 → deletedInHousehold, 혼자면 notFound", async () => {
    for (const isInHousehold of [true, false]) {
      const ctx = await loggedIn({ isInHousehold });
      ctx.api.server.respond = (call) =>
        call.method === "PUT" ? errorResponse(404, "notFound") : undefined;
      const tile = pTile();
      let result: unknown;
      await act(async () => {
        result = await ctx.source().updateItem("plan-p", tile.id, toInput(tile), tile.updatedAt);
      });
      expect(result).toEqual({
        ok: false,
        reason: isInHousehold ? "deletedInHousehold" : "notFound",
      });
      ctx.hook.unmount();
    }
  });

  it("쓰기 401 → unauthorized, 세션 만료 안내", async () => {
    const ctx = await loggedIn();
    ctx.api.server.respond = (call) =>
      call.method === "PATCH" ? errorResponse(401, "unauthorized") : undefined;
    let result: unknown;
    await act(async () => {
      result = await ctx.source().updatePlan("plan-p", { name: "새 이름" });
    });
    expect(result).toEqual({ ok: false, reason: "unauthorized" });
    await waitFor(() => expect(ctx.source().isSessionExpired).toBe(true));
  });
});

describe("쓰기 응답으로 캐시 고치기(setQueryData, 목록 전체를 다시 받지 않음)", () => {
  it("계획 PATCH: 응답의 계획 필드만 바꾸고 받아 둔 items는 그대로, GET 추가 0건", async () => {
    const ctx = await loggedIn();
    const itemsBefore = ctx.cachedPlans()![0].items;
    let result: unknown;
    await act(async () => {
      result = await ctx.source().updatePlan("plan-p", { name: "새 이름", budget: null });
    });
    expect(result).toEqual({ ok: true });
    expect(ctx.api.callsTo("PATCH", `${PLANS_PATH}/plan-p`)).toHaveLength(1);
    const after = ctx.cachedPlans()![0];
    expect(after.name).toBe("새 이름");
    expect(after).not.toHaveProperty("budget");
    expect(after.items).toEqual(itemsBefore);
    expect(after.items).toHaveLength(4);
    expect(ctx.plansGets()).toBe(1);
  });

  it("항목 PUT: 그 항목만 응답 값으로 바뀌고 다른 항목·계획 필드는 그대로, GET 추가 0건", async () => {
    const ctx = await loggedIn();
    const before = ctx.cachedPlans()![0];
    const tile = pTile();
    await act(async () => {
      await ctx
        .source()
        .updateItem("plan-p", tile.id, { ...toInput(tile), budget: 650 }, tile.updatedAt);
    });
    const after = ctx.cachedPlans()![0];
    const updated = after.items.find((item) => item.id === tile.id)!;
    expect(updated.budget).toBe(650);
    expect(updated.updatedAt).not.toBe(tile.updatedAt);
    expect(updated).toEqual(ctx.api.server.plans[0].items[1]);
    expect(after.items.filter((item) => item.id !== tile.id)).toEqual(
      before.items.filter((item) => item.id !== tile.id),
    );
    const { items: _a, ...fieldsAfter } = after;
    const { items: _b, ...fieldsBefore } = before;
    void _a;
    void _b;
    expect(fieldsAfter).toEqual(fieldsBefore);
    expect(ctx.plansGets()).toBe(1);
  });

  it("항목 POST는 그 계획 끝에 붙이고, 항목 DELETE는 그 항목만 뺀다", async () => {
    const ctx = await loggedIn();
    let created: InteriorItem | undefined;
    await act(async () => {
      const result = await ctx.source().addItem("plan-p", toInput(pKitchen()));
      if (result.ok) created = result.item;
    });
    expect(created?.id).toMatch(/^srvitem/);
    expect(ctx.cachedPlans()![0].items.map((item) => item.id)).toEqual([
      "item-wallpaper",
      "item-tile",
      "item-sash",
      "item-kitchen",
      created!.id,
    ]);
    await act(async () => {
      await ctx.source().removeItem("plan-p", "item-tile");
    });
    expect(ctx.cachedPlans()![0].items.map((item) => item.id)).toEqual([
      "item-wallpaper",
      "item-sash",
      "item-kitchen",
      created!.id,
    ]);
    expect(ctx.plansGets()).toBe(1);
  });

  it("계획 POST는 목록 끝에, 계획 DELETE는 목록에서 뺀다. 로그인 중 로컬 원문은 그대로", async () => {
    const ctx = await loggedIn();
    let planId = "";
    await act(async () => {
      const result = await ctx.source().createPlan({
        name: "둘째",
        spaces: [{ id: "s1", name: "전체" }],
      });
      if (result.ok) planId = result.plan.id;
    });
    expect(ctx.cachedPlans()!.map((plan) => plan.id)).toEqual(["plan-p", planId]);
    await act(async () => {
      await ctx.source().removePlan("plan-p");
    });
    expect(ctx.cachedPlans()!.map((plan) => plan.id)).toEqual([planId]);
    expect(ctx.storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe(ctx.localRaw);
  });
});

describe("같은 항목 동시 편집(AC-9 클라이언트, ADR-029 조건 8)", () => {
  it("시트를 연 뒤 캐시의 updatedAt이 바뀌면(재조회로 다른 사람 저장이 들어옴) conflict, PUT 0회", async () => {
    const ctx = await loggedIn({ isInHousehold: true });
    const opened = pTile();
    ctx.api.editItemOnServer("plan-p", opened.id, { budget: 900 });
    await act(() => ctx.api.queryClient.refetchQueries({ queryKey: interiorPlanListQueryKey() }));

    let result: unknown;
    await act(async () => {
      result = await ctx
        .source()
        .updateItem("plan-p", opened.id, { ...toInput(opened), budget: 610 }, opened.updatedAt);
    });
    expect(result).toEqual({ ok: false, reason: "conflict" });
    expect(ctx.api.callsTo("PUT", `${PLANS_PATH}/plan-p/items/${opened.id}`)).toHaveLength(0);
    // 덮어쓰지 않았다
    expect(ctx.api.server.plans[0].items[1].budget).toBe(900);
  });

  it("그린 값이 아니라 저장 직전 캐시를 본다(재렌더 전 캐시만 바뀐 경우도 conflict)", async () => {
    const ctx = await loggedIn({ isInHousehold: true });
    const opened = pTile();
    const updateItem = ctx.source().updateItem;
    ctx.api.queryClient.setQueryData<InteriorPlanWithItems[]>(interiorPlanListQueryKey(), (plans) =>
      plans?.map((plan) => ({
        ...plan,
        items: plan.items.map((item) =>
          item.id === opened.id ? { ...item, updatedAt: "2026-10-27T05:00:00.000Z" } : item,
        ),
      })),
    );
    let result: unknown;
    await act(async () => {
      result = await updateItem("plan-p", opened.id, toInput(opened), opened.updatedAt);
    });
    expect(result).toEqual({ ok: false, reason: "conflict" });
    expect(ctx.api.writes()).toHaveLength(0);
  });

  it("최신 updatedAt으로 다시 열고 저장하면 PUT 1회", async () => {
    const ctx = await loggedIn({ isInHousehold: true });
    const latest = ctx.api.editItemOnServer("plan-p", "item-tile", { budget: 900 });
    await act(() => ctx.api.queryClient.refetchQueries({ queryKey: interiorPlanListQueryKey() }));
    let result: unknown;
    await act(async () => {
      result = await ctx
        .source()
        .updateItem("plan-p", latest.id, { ...toInput(latest), budget: 950 }, latest.updatedAt);
    });
    expect(result).toEqual({ ok: true });
    expect(ctx.api.callsTo("PUT", `${PLANS_PATH}/plan-p/items/item-tile`)).toHaveLength(1);
    expect(ctx.api.server.plans[0].items[1].budget).toBe(950);
  });

  it("다른 항목이 바뀐 것은 충돌이 아니다(둘 다 남는다)", async () => {
    const ctx = await loggedIn({ isInHousehold: true });
    const opened = pTile();
    ctx.api.editItemOnServer("plan-p", "item-kitchen", { budget: 800 });
    await act(() => ctx.api.queryClient.refetchQueries({ queryKey: interiorPlanListQueryKey() }));
    let result: unknown;
    await act(async () => {
      result = await ctx
        .source()
        .updateItem("plan-p", opened.id, { ...toInput(opened), budget: 610 }, opened.updatedAt);
    });
    expect(result).toEqual({ ok: true });
    expect(ctx.api.server.plans[0].items.map((item) => item.budget)).toEqual([300, 610, 1200, 800]);
  });

  it("로그아웃 상태에서도 다른 탭이 같은 항목을 저장했으면 conflict(로컬 원문 그대로)", async () => {
    const ctx = setup({ userId: null, importState: null });
    await waitFor(() => expect(ctx.source().status).toBe("loggedOut"));
    const opened = localPlan().items[1];
    // 다른 탭이 저장: 원문에서 그 항목의 updatedAt이 바뀜
    const otherTab = localPlan();
    otherTab.items[1] = {
      ...otherTab.items[1],
      budget: 999,
      updatedAt: "2026-10-27T05:00:00.000Z",
    };
    ctx.storage.setItem(INTERIOR_PLANS_STORAGE_KEY, toStoredPlans([otherTab]));
    const rawAfterOtherTab = ctx.storage.getItem(INTERIOR_PLANS_STORAGE_KEY);
    let result: unknown;
    await act(async () => {
      result = await ctx
        .source()
        .updateItem("local-plan", opened.id, toInput(opened), opened.updatedAt);
    });
    expect(result).toEqual({ ok: false, reason: "conflict" });
    expect(ctx.storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe(rawAfterOtherTab);
  });
});
