// @vitest-environment jsdom
// 함께 쓰는 중 기기 매물 자동 이전 건너뛰기(스펙 interior-planner 태스크 0-1·0-2, AC-10).
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ACCOUNT_IMPORTS_STORAGE_KEY,
  createAccountImportStore,
} from "@/lib/utils/accountImportStorage";
import { LISTINGS_STORAGE_KEY, saveListings } from "@/lib/utils/listingStorage";
import { createListingStore } from "@/lib/utils/listingStore";
import { createFakeAccountApi } from "@/test/fakeAccountApi";
import { makeListing } from "@/test/listingFixture";
import { createMemoryStorage } from "@/test/memoryStorage";

import { isAccountImportSettled, useAccountImport } from "./useAccountImport";

const USER_ID = "user-b";

function setup({
  isInHousehold,
  imports,
}: {
  isInHousehold: boolean;
  /** `account-imports` 원문(다른 계정 기록 등) */
  imports?: Record<string, string[]>;
}) {
  const storage = createMemoryStorage(
    imports === undefined ? {} : { [ACCOUNT_IMPORTS_STORAGE_KEY]: JSON.stringify(imports) },
  );
  saveListings(storage, [makeListing({ id: "l1" }), makeListing({ id: "l2", name: "두 번째" })]);
  const listingsRaw = storage.getItem(LISTINGS_STORAGE_KEY);
  const importsRaw = storage.getItem(ACCOUNT_IMPORTS_STORAGE_KEY);
  const listingStore = createListingStore({
    storage,
    createId: () => "new-id",
    now: () => "2026-10-26T00:00:00.000Z",
  });
  const accountImportStore = createAccountImportStore({ storage });
  const api = createFakeAccountApi({ userId: USER_ID, isInHousehold });
  const onImported = vi.fn();
  const setItem = vi.spyOn(storage, "setItem");
  const removeItem = vi.spyOn(storage, "removeItem");
  const hook = renderHook(
    () => useAccountImport({ listingStore, accountImportStore, onImported }),
    { wrapper: api.wrapper },
  );
  const sentImports = () => api.callsTo("POST", "/api/listings/import");
  return {
    storage,
    listingsRaw,
    importsRaw,
    api,
    onImported,
    setItem,
    removeItem,
    hook,
    sentImports,
  };
}

const settled = (state: ReturnType<typeof useAccountImport>["state"]) =>
  isAccountImportSettled(state, USER_ID);

let confirmSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useAccountImport — 함께 쓰는 중", () => {
  it("send 0회·기록 0회·skipped(household)이고 settled가 참, 기기 원본·기록 키 원문 그대로", async () => {
    const { hook, sentImports, storage, listingsRaw, setItem, removeItem, onImported } = setup({
      isInHousehold: true,
    });

    await waitFor(() =>
      expect(hook.result.current.state).toEqual({
        userId: USER_ID,
        status: "skipped",
        reason: "household",
      }),
    );
    expect(settled(hook.result.current.state)).toBe(true);
    expect(sentImports()).toHaveLength(0);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(storage.getItem(ACCOUNT_IMPORTS_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(LISTINGS_STORAGE_KEY)).toBe(listingsRaw);
    expect(onImported).not.toHaveBeenCalled();
  });

  it("다른 계정의 기록이 있어도 확인창을 띄우지 않고 기록 원문도 그대로", async () => {
    const { hook, sentImports, storage, importsRaw } = setup({
      isInHousehold: true,
      imports: { "user-a": ["x"] },
    });
    await waitFor(() => expect(hook.result.current.state?.status).toBe("skipped"));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(sentImports()).toHaveLength(0);
    expect(storage.getItem(ACCOUNT_IMPORTS_STORAGE_KEY)).toBe(importsRaw);
  });

  it("가구 상태의 retry()도 send 0회", async () => {
    const { hook, sentImports, setItem } = setup({ isInHousehold: true });
    await waitFor(() => expect(hook.result.current.state?.status).toBe("skipped"));

    act(() => hook.result.current.retry());

    await waitFor(() => expect(hook.result.current.state?.status).toBe("skipped"));
    expect(sentImports()).toHaveLength(0);
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe("useAccountImport — 같은 세션에서 나가기", () => {
  it("household가 null로 바뀌면 한 번 보내고 기록하며 onImported(2) 1회", async () => {
    const { hook, api, sentImports, storage, onImported } = setup({ isInHousehold: true });
    await waitFor(() => expect(hook.result.current.state?.status).toBe("skipped"));

    await api.setHousehold(false);

    await waitFor(() =>
      expect(hook.result.current.state).toEqual({
        userId: USER_ID,
        status: "done",
        importedCount: 2,
      }),
    );
    expect(sentImports()).toHaveLength(1);
    expect(
      (sentImports()[0].body as { listings: { id: string }[] }).listings.map(({ id }) => id),
    ).toEqual(["l1", "l2"]);
    expect(JSON.parse(storage.getItem(ACCOUNT_IMPORTS_STORAGE_KEY)!)).toEqual({
      [USER_ID]: ["l1", "l2"],
    });
    expect(onImported).toHaveBeenCalledTimes(1);
    expect(onImported).toHaveBeenCalledWith(2);
  });

  it("두 번째 가입 → 나가기 전환에서는 다시 보내지 않는다", async () => {
    const { hook, api, sentImports, onImported } = setup({ isInHousehold: true });
    await waitFor(() => expect(hook.result.current.state?.status).toBe("skipped"));
    await api.setHousehold(false);
    await waitFor(() => expect(hook.result.current.state?.status).toBe("done"));

    await api.setHousehold(true);
    await api.setHousehold(false);

    // 효과가 다시 돌 시간을 준 뒤에도 그대로인지 본다.
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(sentImports()).toHaveLength(1);
    expect(onImported).toHaveBeenCalledTimes(1);
    expect(hook.result.current.state?.status).toBe("done");
  });
});

describe("useAccountImport — 혼자 쓰는 계정(회귀 없음)", () => {
  it("로그인하면 한 번 보내고 기록한다", async () => {
    const { hook, sentImports, storage, onImported } = setup({ isInHousehold: false });
    await waitFor(() => expect(hook.result.current.state?.status).toBe("done"));
    expect(sentImports()).toHaveLength(1);
    expect(JSON.parse(storage.getItem(ACCOUNT_IMPORTS_STORAGE_KEY)!)).toEqual({
      [USER_ID]: ["l1", "l2"],
    });
    expect(onImported).toHaveBeenCalledWith(2);
  });

  it("다른 계정 기록이 있고 이 계정이 처음이면 한 번 묻는다(기존 동작)", async () => {
    const { hook } = setup({ isInHousehold: false, imports: { "user-a": ["x"] } });
    await waitFor(() => expect(hook.result.current.state?.status).toBe("done"));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
  });
});
