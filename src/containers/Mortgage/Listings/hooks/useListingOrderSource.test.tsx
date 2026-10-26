// @vitest-environment jsdom
// 함께 쓰는 중 기기 직접 순서 자동 이전 건너뛰기(스펙 interior-planner 태스크 0-1·0-2, AC-10).
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createListingOrderImportStore,
  LISTING_ORDER_IMPORTS_STORAGE_KEY,
} from "@/lib/utils/listingOrderImportStorage";
import {
  createListingOrderStore,
  LISTING_ORDER_STORAGE_KEY,
} from "@/lib/utils/listingOrderStorage";
import { createFakeAccountApi } from "@/test/fakeAccountApi";
import { createMemoryStorage } from "@/test/memoryStorage";

import { useListingOrderSource } from "./useListingOrderSource";

const USER_ID = "user-b";
const DEVICE_ORDER = ["l2", "l1"];
const HOUSEHOLD_ORDER = ["a1"];

function setup({ isInHousehold }: { isInHousehold: boolean }) {
  const storage = createMemoryStorage({
    [LISTING_ORDER_STORAGE_KEY]: JSON.stringify(DEVICE_ORDER),
  });
  const orderRaw = storage.getItem(LISTING_ORDER_STORAGE_KEY);
  // 실제 스토어: getSnapshot은 바뀌기 전까지 같은 배열을 돌려준다(useSyncExternalStore 무한 갱신 방지).
  const listingOrderStore = createListingOrderStore({ storage });
  const listingOrderImportStore = createListingOrderImportStore({ storage });
  const api = createFakeAccountApi({
    userId: USER_ID,
    isInHousehold,
    ids: isInHousehold ? HOUSEHOLD_ORDER : null,
  });
  const setItem = vi.spyOn(storage, "setItem");
  const removeItem = vi.spyOn(storage, "removeItem");
  const onUnauthorized = vi.fn();
  const hook = renderHook(
    () =>
      useListingOrderSource({
        status: "loggedIn",
        listingOrderStore,
        listingOrderImportStore,
        onUnauthorized,
      }),
    { wrapper: api.wrapper },
  );
  const sentImports = () => api.callsTo("POST", "/api/listing-order/import");
  /** 나가기: 서버에서는 B의 users 순서(수락 전 값, 여기서는 없음)로 돌아간다. */
  const leave = async () => {
    api.server.ids = null;
    await api.setHousehold(false);
  };
  const join = async () => {
    api.server.ids = HOUSEHOLD_ORDER;
    await api.setHousehold(true);
  };
  return { storage, orderRaw, api, setItem, removeItem, hook, sentImports, leave, join };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useListingOrderSource — 함께 쓰는 중", () => {
  it("send 0회·기록 0회이고 loading에 멈추지 않고 가구 순서로 ok", async () => {
    const { hook, sentImports, storage, orderRaw, setItem, removeItem } = setup({
      isInHousehold: true,
    });

    await waitFor(() =>
      expect(hook.result.current.state).toEqual({ status: "ok", ids: HOUSEHOLD_ORDER }),
    );
    expect(sentImports()).toHaveLength(0);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(storage.getItem(LISTING_ORDER_IMPORTS_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(LISTING_ORDER_STORAGE_KEY)).toBe(orderRaw);
  });

  it("가구 상태의 retry()는 이전을 보내지 않는다(계정 순서만 다시 조회)", async () => {
    const { hook, api, sentImports } = setup({ isInHousehold: true });
    await waitFor(() => expect(hook.result.current.state.status).toBe("ok"));
    const orderGets = api.callsTo("GET", "/api/listing-order").length;

    act(() => hook.result.current.retry());

    await waitFor(() =>
      expect(api.callsTo("GET", "/api/listing-order").length).toBe(orderGets + 1),
    );
    expect(sentImports()).toHaveLength(0);
    expect(hook.result.current.state).toEqual({ status: "ok", ids: HOUSEHOLD_ORDER });
  });
});

describe("useListingOrderSource — 같은 세션에서 나가기", () => {
  it("household가 null로 바뀌면 기기 순서를 한 번 보내고 기록하며 그 값으로 ok", async () => {
    const { hook, sentImports, storage, leave } = setup({ isInHousehold: true });
    await waitFor(() => expect(hook.result.current.state.status).toBe("ok"));

    await leave();

    await waitFor(() => expect(sentImports()).toHaveLength(1));
    expect(sentImports()[0].body).toEqual({ ids: DEVICE_ORDER });
    await waitFor(() =>
      expect(hook.result.current.state).toEqual({ status: "ok", ids: DEVICE_ORDER }),
    );
    expect(JSON.parse(storage.getItem(LISTING_ORDER_IMPORTS_STORAGE_KEY)!)).toEqual([USER_ID]);
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

describe("useListingOrderSource — 혼자 쓰는 계정(회귀 없음)", () => {
  it("로그인하면 기기 순서를 한 번 보내고 기록한다", async () => {
    const { hook, sentImports, storage } = setup({ isInHousehold: false });
    await waitFor(() =>
      expect(hook.result.current.state).toEqual({ status: "ok", ids: DEVICE_ORDER }),
    );
    expect(sentImports()).toHaveLength(1);
    expect(JSON.parse(storage.getItem(LISTING_ORDER_IMPORTS_STORAGE_KEY)!)).toEqual([USER_ID]);
  });
});
