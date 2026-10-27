// 사용자별 id 기록 저장소 일반화(ea18953) 뒤에도 `account-imports` 키 이름·형식·쓰는 원문이 그대로인지(AC-0),
// 같은 부품을 쓰는 `interior-plan-imports`(스펙 "브라우저 저장소": Record<userId, planId[]>)가 따로 쓰이는지.
import { describe, expect, it, vi } from "vitest";

import { createMemoryStorage } from "@/test/memoryStorage";

import { ACCOUNT_IMPORTS_STORAGE_KEY, createAccountImportStore } from "./accountImportStorage";
import { parseIdsByUser } from "./idsByUserStorage";
import {
  createInteriorPlanImportStore,
  INTERIOR_PLAN_IMPORTS_STORAGE_KEY,
} from "./interiorPlanImportStorage";

/**
 * 일반화 전 `createAccountImportStore`(git ea18953^:src/lib/utils/accountImportStorage.ts)를 그대로 옮긴 기준 구현.
 * 같은 원문·같은 호출에서 새 구현이 바이트 단위로 같은 값을 쓰는지 비교한다.
 */
function legacyAccountImportStore(storage: Storage) {
  const KEY = "loan-calculator/account-imports";
  const isStringArray = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => typeof item === "string");
  const parse = (rawText: string | null): Record<string, string[]> => {
    if (rawText === null) return {};
    let value: unknown;
    try {
      value = JSON.parse(rawText);
    } catch {
      return {};
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, string[]] => isStringArray(entry[1])),
    );
  };
  const read = () => {
    try {
      return parse(storage.getItem(KEY));
    } catch {
      return {};
    }
  };
  return {
    read,
    add(userId: string, ids: string[]) {
      const imports = read();
      const merged = [...new Set([...(imports[userId] ?? []), ...ids])];
      try {
        storage.setItem(KEY, JSON.stringify({ ...imports, [userId]: merged }));
      } catch {
        // 접근 불가·용량 초과
      }
    },
  };
}

const RAW_CASES: { name: string; raw: string | null }[] = [
  { name: "키 없음", raw: null },
  { name: "한 사용자", raw: JSON.stringify({ "user-a": ["l1", "l2"] }) },
  { name: "두 사용자·들여쓰기", raw: JSON.stringify({ "user-a": ["l1"], "user-b": [] }, null, 2) },
  { name: "JSON 아님", raw: "{oops" },
  { name: "배열", raw: JSON.stringify(["user-a"]) },
  { name: "null", raw: "null" },
  { name: "어긋난 항목 섞임", raw: JSON.stringify({ "user-a": ["l1", 3], "user-b": ["l9"] }) },
  { name: "숫자 키·__proto__ 문자열", raw: '{"1":["x"],"__proto__":["y"]}' },
];

const ADD_CASES: { userId: string; ids: string[] }[] = [
  { userId: "user-a", ids: ["l3"] },
  { userId: "user-a", ids: ["l1", "l3", "l3"] },
  { userId: "user-c", ids: [] },
  { userId: "user-b", ids: ["l9", "l1"] },
];

describe("account-imports: 일반화 전후 같은 원문을 읽고 쓴다", () => {
  it("키 이름은 그대로 loan-calculator/account-imports", () => {
    expect(ACCOUNT_IMPORTS_STORAGE_KEY).toBe("loan-calculator/account-imports");
  });

  for (const { name, raw } of RAW_CASES) {
    it(`${name}: read()가 일반화 전과 같고, add() 뒤 원문이 바이트 단위로 같다`, () => {
      for (const { userId, ids } of ADD_CASES) {
        const seed: Record<string, string> =
          raw === null ? {} : { [ACCOUNT_IMPORTS_STORAGE_KEY]: raw };
        const legacyStorage = createMemoryStorage(seed);
        const currentStorage = createMemoryStorage(seed);
        const legacy = legacyAccountImportStore(legacyStorage);
        const current = createAccountImportStore({ storage: currentStorage });

        expect(current.read()).toEqual(legacy.read());
        legacy.add(userId, ids);
        current.add(userId, ids);
        expect(currentStorage.getItem(ACCOUNT_IMPORTS_STORAGE_KEY)).toBe(
          legacyStorage.getItem(ACCOUNT_IMPORTS_STORAGE_KEY),
        );
        expect(currentStorage.length).toBe(legacyStorage.length);
      }
    });
  }

  it("배포 전 브라우저의 원문을 그대로 읽는다(형식 Record<userId, id[]>)", () => {
    const storage = createMemoryStorage({
      [ACCOUNT_IMPORTS_STORAGE_KEY]: '{"user-a":["listing-old","listing-1"]}',
    });
    expect(createAccountImportStore({ storage }).read()).toEqual({
      "user-a": ["listing-old", "listing-1"],
    });
  });

  it("read()는 쓰지 않는다(setItem·removeItem 0회)", () => {
    const storage = createMemoryStorage({ [ACCOUNT_IMPORTS_STORAGE_KEY]: "{oops" });
    const setItem = vi.spyOn(storage, "setItem");
    const removeItem = vi.spyOn(storage, "removeItem");
    createAccountImportStore({ storage }).read();
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(storage.getItem(ACCOUNT_IMPORTS_STORAGE_KEY)).toBe("{oops");
  });

  it("저장소 접근 불가(getItem·setItem throw)여도 던지지 않는다", () => {
    const storage = createMemoryStorage();
    vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const store = createAccountImportStore({ storage });
    expect(store.read()).toEqual({});
    expect(() => store.add("user-a", ["l1"])).not.toThrow();
  });
});

describe("interior-plan-imports: 같은 형식, 다른 키", () => {
  it("키 이름은 loan-calculator/interior-plan-imports, 형식은 Record<userId, planId[]>", () => {
    expect(INTERIOR_PLAN_IMPORTS_STORAGE_KEY).toBe("loan-calculator/interior-plan-imports");
    const storage = createMemoryStorage();
    const store = createInteriorPlanImportStore({ storage });
    store.add("user-a", ["p1"]);
    store.add("user-a", ["p2", "p1"]);
    store.add("user-b", ["p1"]);
    expect(storage.getItem(INTERIOR_PLAN_IMPORTS_STORAGE_KEY)).toBe(
      '{"user-a":["p1","p2"],"user-b":["p1"]}',
    );
    expect(store.read()).toEqual({ "user-a": ["p1", "p2"], "user-b": ["p1"] });
  });

  it("계획 기록은 account-imports를 건드리지 않고, 매물 기록은 interior-plan-imports를 건드리지 않는다", () => {
    const accountRaw = '{"user-a":["listing-1"]}';
    const storage = createMemoryStorage({ [ACCOUNT_IMPORTS_STORAGE_KEY]: accountRaw });
    const setItem = vi.spyOn(storage, "setItem");
    createInteriorPlanImportStore({ storage }).add("user-a", ["plan-1"]);
    expect(setItem.mock.calls.map(([key]) => key)).toEqual([INTERIOR_PLAN_IMPORTS_STORAGE_KEY]);
    expect(storage.getItem(ACCOUNT_IMPORTS_STORAGE_KEY)).toBe(accountRaw);
    expect(createAccountImportStore({ storage }).read()).toEqual({ "user-a": ["listing-1"] });
    expect(createInteriorPlanImportStore({ storage }).read()).toEqual({ "user-a": ["plan-1"] });
  });
});

describe("parseIdsByUser 경계", () => {
  it.each([
    [null, {}],
    ["", {}],
    ["   ", {}],
    ["[]", {}],
    ['"text"', {}],
    ["42", {}],
    ["{}", {}],
    ['{"u":[]}', { u: [] }],
    ['{"u":"p1"}', {}],
    ['{"u":[null]}', {}],
    ['{"u":["p1"],"v":{"x":1}}', { u: ["p1"] }],
  ])("%j → %j", (raw, expected) => {
    expect(parseIdsByUser(raw)).toEqual(expected);
  });
});
