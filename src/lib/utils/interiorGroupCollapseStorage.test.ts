// 스펙 interior-group-collapse 태스크 1-1: 원문(AC-3)과 읽기·쓰기 실패·손상(AC-4)
import { describe, expect, it, vi } from "vitest";

import { createMemoryStorage } from "@/test/memoryStorage";

import {
  createInteriorGroupCollapseStore,
  INTERIOR_COLLAPSED_GROUPS_STORAGE_KEY as KEY,
} from "./interiorGroupCollapseStorage";

const TRADES = ["도배", "욕실", "주방"];

const storeWith = (raw?: string) => {
  const storage = createMemoryStorage(raw === undefined ? {} : { [KEY]: raw });
  return { storage, store: createInteriorGroupCollapseStore({ storage }) };
};

const collapse = (
  store: ReturnType<typeof storeWith>["store"],
  planId: string,
  trade: string,
  isCollapsed = true,
) => store.setCollapsed({ planId, trade, isCollapsed, presentTrades: TRADES });

describe("interiorGroupCollapseStorage 원문(AC-3)", () => {
  it("P에서 도배를 접으면 원문이 {P:[도배]}, 다시 펴면 P 키가 없다", () => {
    const { storage, store } = storeWith();
    collapse(store, "P", "도배");
    expect(storage.getItem(KEY)).toBe('{"P":["도배"]}');
    collapse(store, "P", "도배", false);
    expect(storage.getItem(KEY)).toBe("{}");
  });

  it("같은 storage로 다시 만들면 접힘이 복원되고, 다른 계획은 따로다", () => {
    const { storage, store } = storeWith();
    collapse(store, "P", "도배");
    const reloaded = createInteriorGroupCollapseStore({ storage }).getSnapshot();
    expect(reloaded.get("P")).toStrictEqual(["도배"]);
    expect(reloaded.get("Q")).toBeUndefined();
  });

  it("쓸 때 지금 화면에 없는 구분(이름이 바뀐 묶음)은 정리한다", () => {
    const { storage, store } = storeWith('{"P":["도배","옛이름"]}');
    collapse(store, "P", "주방");
    expect(storage.getItem(KEY)).toBe('{"P":["도배","주방"]}');
  });

  it("계획 id가 __proto__여도 다른 계획처럼 다룬다", () => {
    const { store } = storeWith('{"__proto__":["도배"]}');
    expect(store.getSnapshot().get("__proto__")).toStrictEqual(["도배"]);
  });
});

describe("interiorGroupCollapseStorage 읽기·쓰기 실패(AC-4)", () => {
  it.each(["{", "[]", "null", '{"P":"도배"}'])("원문 %s는 모두 펼침이다", (raw) => {
    expect(storeWith(raw).store.getSnapshot().size).toBe(0);
  });

  it("배열 안 문자열이 아닌 값만 버린다({P:[1,도배]} → 도배만 접힘)", () => {
    expect(storeWith('{"P":[1,"도배"]}').store.getSnapshot().get("P")).toStrictEqual(["도배"]);
  });

  it("모든 호출이 throw하는 storage: 모두 펼침으로 시작하고 접기는 이 탭에서 동작한다", () => {
    const storage = createMemoryStorage();
    vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const store = createInteriorGroupCollapseStore({ storage });
    expect(store.getSnapshot().size).toBe(0);
    collapse(store, "P", "도배");
    expect(store.getSnapshot().get("P")).toStrictEqual(["도배"]);
  });

  it("setItem만 throw: 알림이 가고 이 탭에서 접힘이 유지된다", () => {
    const { storage, store } = storeWith();
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const listener = vi.fn();
    store.subscribe(listener);
    collapse(store, "P", "도배");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().get("P")).toStrictEqual(["도배"]);
  });

  it("한 계획 값이 깨진 원문 위에서 다른 계획을 접으면 깨진 계획은 버려진 채 정상 JSON이 써진다", () => {
    const { storage, store } = storeWith('{"P":"도배","Q":["주방"]}');
    collapse(store, "Q", "욕실");
    expect(storage.getItem(KEY)).toBe('{"Q":["주방","욕실"]}');
  });
});
