// @vitest-environment jsdom
// 함께 쓰는 중 기기 예산 자동 이전 건너뛰기(스펙 interior-planner 태스크 0-1·0-2, AC-10).
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BUDGET_IMPORTS_STORAGE_KEY,
  createBudgetImportStore,
} from "@/lib/utils/budgetImportStorage";
import { BUDGET_STORAGE_KEY, createBudgetStore } from "@/lib/utils/budgetStorage";
import { createFakeAccountApi } from "@/test/fakeAccountApi";
import { createMemoryStorage } from "@/test/memoryStorage";

import { useBudgetSource } from "./useBudgetSource";

const USER_ID = "user-b";
const DEVICE_BUDGET = 80000;
const HOUSEHOLD_BUDGET = 70000;

function setup({ isInHousehold }: { isInHousehold: boolean }) {
  const storage = createMemoryStorage({ [BUDGET_STORAGE_KEY]: JSON.stringify(DEVICE_BUDGET) });
  const budgetRaw = storage.getItem(BUDGET_STORAGE_KEY);
  const budgetStore = createBudgetStore({ storage });
  const budgetImportStore = createBudgetImportStore({ storage });
  // 가구면 가구 예산, 혼자면 계정 예산이 비어 있다(기기 예산이 올라간다).
  const api = createFakeAccountApi({
    userId: USER_ID,
    isInHousehold,
    budget: isInHousehold ? HOUSEHOLD_BUDGET : null,
  });
  const setItem = vi.spyOn(storage, "setItem");
  const removeItem = vi.spyOn(storage, "removeItem");
  const onUnauthorized = vi.fn();
  const hook = renderHook(
    () => useBudgetSource({ status: "loggedIn", budgetStore, budgetImportStore, onUnauthorized }),
    { wrapper: api.wrapper },
  );
  const sentImports = () => api.callsTo("POST", "/api/budget/import");
  /** 나가기: 서버에서는 B의 users 예산(수락 전 값, 여기서는 없음)으로 돌아간다. */
  const leave = async () => {
    api.server.budget = null;
    await api.setHousehold(false);
  };
  const join = async () => {
    api.server.budget = HOUSEHOLD_BUDGET;
    await api.setHousehold(true);
  };
  return { storage, budgetRaw, api, setItem, removeItem, hook, sentImports, leave, join };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useBudgetSource — 함께 쓰는 중", () => {
  it("send 0회·기록 0회이고 loading에 멈추지 않고 가구 예산으로 ok", async () => {
    const { hook, sentImports, storage, budgetRaw, setItem, removeItem } = setup({
      isInHousehold: true,
    });

    await waitFor(() =>
      expect(hook.result.current.state).toEqual({ status: "ok", budget: HOUSEHOLD_BUDGET }),
    );
    expect(sentImports()).toHaveLength(0);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(storage.getItem(BUDGET_IMPORTS_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(BUDGET_STORAGE_KEY)).toBe(budgetRaw);
  });

  it("가구 상태의 retry()는 이전을 보내지 않는다(계정 예산만 다시 조회)", async () => {
    const { hook, api, sentImports } = setup({ isInHousehold: true });
    await waitFor(() => expect(hook.result.current.state.status).toBe("ok"));
    const budgetGets = api.callsTo("GET", "/api/budget").length;

    act(() => hook.result.current.retry());

    await waitFor(() => expect(api.callsTo("GET", "/api/budget").length).toBe(budgetGets + 1));
    expect(sentImports()).toHaveLength(0);
    expect(hook.result.current.state).toEqual({ status: "ok", budget: HOUSEHOLD_BUDGET });
  });
});

describe("useBudgetSource — 같은 세션에서 나가기", () => {
  it("household가 null로 바뀌면 기기 예산을 한 번 보내고 기록하며 그 값으로 ok", async () => {
    const { hook, sentImports, storage, leave } = setup({ isInHousehold: true });
    await waitFor(() => expect(hook.result.current.state.status).toBe("ok"));

    await leave();

    await waitFor(() => expect(sentImports()).toHaveLength(1));
    expect(sentImports()[0].body).toEqual({ budget: DEVICE_BUDGET });
    await waitFor(() =>
      expect(hook.result.current.state).toEqual({ status: "ok", budget: DEVICE_BUDGET }),
    );
    expect(JSON.parse(storage.getItem(BUDGET_IMPORTS_STORAGE_KEY)!)).toEqual([USER_ID]);
  });

  it("두 번째 가입 → 나가기 전환에서는 다시 보내지 않는다", async () => {
    const { hook, sentImports, leave, join } = setup({ isInHousehold: true });
    await waitFor(() => expect(hook.result.current.state.status).toBe("ok"));
    await leave();
    await waitFor(() => expect(sentImports()).toHaveLength(1));

    await join();
    await leave();

    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(sentImports()).toHaveLength(1);
    expect(hook.result.current.state.status).toBe("ok");
  });
});

describe("useBudgetSource — 혼자 쓰는 계정(회귀 없음)", () => {
  it("로그인하면 기기 예산을 한 번 보내고 기록한다", async () => {
    const { hook, sentImports, storage } = setup({ isInHousehold: false });
    await waitFor(() =>
      expect(hook.result.current.state).toEqual({ status: "ok", budget: DEVICE_BUDGET }),
    );
    expect(sentImports()).toHaveLength(1);
    expect(JSON.parse(storage.getItem(BUDGET_IMPORTS_STORAGE_KEY)!)).toEqual([USER_ID]);
  });
});
