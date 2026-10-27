// @vitest-environment jsdom
// AC-0(c)(g) 로그인 상태: 혼자·가구 모두 앱 시작·탭 이동·[우리 집] 사용·로그인 이전·이전 건너뛰기 동안
// 허용 목록(새 키 2개) 밖 키에 setItem·removeItem·clear 0회, 시드한 기존 12개 키 원문 ===.
// 예외: 이번 사이클 전부터 있던 로그인 확인 결과에 따른 session-hint 표시(useListingSource, 같은 값 "1").
import { screen, waitFor, within, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { DEFAULT_DRAFT } from "@/lib/constants/draft";
import { PATHS } from "@/lib/constants/paths";
import { ACCOUNT_IMPORTS_STORAGE_KEY } from "@/lib/utils/accountImportStorage";
import { BUDGET_IMPORTS_STORAGE_KEY } from "@/lib/utils/budgetImportStorage";
import { BUDGET_STORAGE_KEY } from "@/lib/utils/budgetStorage";
import { DRAFT_STORAGE_KEY } from "@/lib/utils/draftStorage";
import { INTERIOR_PLAN_IMPORTS_STORAGE_KEY } from "@/lib/utils/interiorPlanImportStorage";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { LISTING_ORDER_IMPORTS_STORAGE_KEY } from "@/lib/utils/listingOrderImportStorage";
import { LISTING_ORDER_STORAGE_KEY } from "@/lib/utils/listingOrderStorage";
import { LISTINGS_STORAGE_KEY } from "@/lib/utils/listingStorage";
import { PRIVACY_MODE_STORAGE_KEY } from "@/lib/utils/privacyModeStorage";
import { SENT_SHARES_STORAGE_KEY } from "@/lib/utils/sentShareStorage";
import { SESSION_HINT_STORAGE_KEY } from "@/lib/utils/sessionHintStorage";
import { TEXT_SIZE_STORAGE_KEY } from "@/lib/utils/textSizeStorage";
import { TRADE_LOOKUP_STORAGE_KEY } from "@/lib/utils/tradeLookupStorage";
import { createFakePlanApi, type FakePlanApi } from "@/test/fakePlanApi";
import { makePlanP, toStoredPlans } from "@/test/interiorPlanFixture";
import { makeListing } from "@/test/listingFixture";
import { createMemoryStorage } from "@/test/memoryStorage";

const ALLOWED_KEYS = new Set([INTERIOR_PLANS_STORAGE_KEY, INTERIOR_PLAN_IMPORTS_STORAGE_KEY]);

const LEGACY_KEYS = [
  "account-imports",
  "budget",
  "budget-imports",
  "draft",
  "listing-order",
  "listing-order-imports",
  "listings",
  "privacy-mode",
  "sent-shares",
  "session-hint",
  "text-size",
  "trade-lookup",
].map((name) => `loan-calculator/${name}`);

/**
 * 기존 12개 키. `imports`는 이 기기의 이전 기록 3개(혼자: 이미 옮긴 기록, 가구: 다른 계정 기록만)
 * 일부는 들여쓰기로 적어, 다시 직렬화해 쓰면 원문 비교에서 걸리게 한다.
 */
function legacySeed(imports: {
  accountImports: Record<string, string[]>;
  budgetImports: string[];
  listingOrderImports: string[];
}): Record<string, string> {
  return {
    [ACCOUNT_IMPORTS_STORAGE_KEY]: JSON.stringify(imports.accountImports, null, 1),
    [BUDGET_STORAGE_KEY]: "80000",
    [BUDGET_IMPORTS_STORAGE_KEY]: JSON.stringify(imports.budgetImports, null, 1),
    [DRAFT_STORAGE_KEY]: JSON.stringify(
      { ...DEFAULT_DRAFT, salePrice: "125000", kbPrice: "120000" },
      null,
      2,
    ),
    [LISTING_ORDER_STORAGE_KEY]: JSON.stringify(["listing-2", "listing-1"], null, 1),
    [LISTING_ORDER_IMPORTS_STORAGE_KEY]: JSON.stringify(imports.listingOrderImports, null, 1),
    [LISTINGS_STORAGE_KEY]: JSON.stringify(
      [
        makeListing({ id: "listing-1", name: "래미안 84", memo: "남향 고층" }),
        makeListing({
          id: "listing-2",
          name: "자이 59",
          salePrice: 90000,
          kbPrice: 90000,
          createdAt: "2026-10-02T00:00:00.000Z",
          updatedAt: "2026-10-02T00:00:00.000Z",
        }),
      ],
      null,
      2,
    ),
    [PRIVACY_MODE_STORAGE_KEY]: "false",
    [SENT_SHARES_STORAGE_KEY]: JSON.stringify([
      {
        token: "AbCdEfGhIjKlMnOpQrStUv",
        kind: "listing",
        ownerKey: "local",
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
    ]),
    [SESSION_HINT_STORAGE_KEY]: "1",
    [TEXT_SIZE_STORAGE_KEY]: "small",
    [TRADE_LOOKUP_STORAGE_KEY]: JSON.stringify({ lawdCd: "11680" }),
  };
}

const devicePlan = () => makePlanP({ id: "device-plan", name: "기기 계획", items: [] });

function createSpiedStorage(seed: Record<string, string>) {
  const storage = createMemoryStorage(seed);
  const setItem = vi.spyOn(storage, "setItem");
  const removeItem = vi.spyOn(storage, "removeItem");
  const clear = vi.spyOn(storage, "clear");
  /** 허용 목록 밖 키에 대한 쓰기 "메서드 키 값" */
  const forbiddenWrites = () => [
    ...setItem.mock.calls
      .filter(([key]) => !ALLOWED_KEYS.has(key))
      .map(([key, value]) => `setItem ${key} ${value}`),
    ...removeItem.mock.calls
      .filter(([key]) => !ALLOWED_KEYS.has(key))
      .map(([key]) => `removeItem ${key}`),
    ...clear.mock.calls.map(() => "clear"),
  ];
  return { storage, setItem, forbiddenWrites };
}

const storedKeys = (storage: Storage) =>
  Array.from({ length: storage.length }, (_, index) => storage.key(index) ?? "");

type User = ReturnType<typeof userEvent.setup>;

/** 앱 시작(#/calculator) → 저장 목록 → 우리 집(줄 추가) → 계산 → 우리 집 */
async function walkLoggedIn(user: User, api: FakePlanApi, planName: string) {
  expect(await screen.findByLabelText("매매가")).toBeInTheDocument();
  await user.click(screen.getByRole("link", { name: "매물" }));
  await waitFor(() => expect(window.location.hash).toBe("#/listings"));
  // 로그인 상태 목록(서버, 빈 목록)이 화면에 뜬 뒤(이전이 끝났거나 건너뛰었다).
  // `/api/listings` 호출은 앞 화면에서 이미 일어날 수 있어 호출 횟수만으로는 이 화면의 동기화 지점이 되지 않는다.
  expect(await screen.findByText("저장한 매물이 없습니다")).toBeInTheDocument();
  await waitFor(() => expect(api.callsTo("GET", "/api/listings").length).toBeGreaterThan(0));

  await user.click(screen.getByRole("link", { name: "우리 집" }));
  expect(await screen.findByRole("heading", { name: planName })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "줄 추가" }));
  const itemSheet = screen.getByRole("dialog", { name: "줄 추가" });
  await user.type(within(itemSheet).getByLabelText("구분"), "도배");
  await user.type(within(itemSheet).getByLabelText("업체"), "육문수");
  await user.type(within(itemSheet).getByLabelText("견적"), "300");
  await user.click(within(itemSheet).getByRole("button", { name: "저장" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "도배 육문수 열기" })).toBeInTheDocument();

  await user.click(screen.getByRole("link", { name: "계산" }));
  expect(await screen.findByLabelText("매매가")).toBeInTheDocument();
  await user.click(screen.getByRole("link", { name: "우리 집" }));
  expect(await screen.findByRole("button", { name: "도배 육문수 열기" })).toBeInTheDocument();
}

/** session-hint 예외(같은 값 "1" 표시)만 남았는지 */
function expectOnlySessionHintMark(forbiddenWrites: string[]) {
  expect(
    forbiddenWrites.filter((write) => write !== `setItem ${SESSION_HINT_STORAGE_KEY} 1`),
  ).toEqual([]);
}

describe("AC-0(c)(g) 로그인 상태에서도 기존 12개 키는 그대로", () => {
  beforeEach(() => {
    window.location.hash = PATHS.calculator;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.location.hash = "#/";
  });

  it("혼자 쓰는 계정(이 기기 매물·예산·순서는 이미 옮긴 기록): 계획 로그인 이전·[우리 집] 사용 동안 허용 목록 밖 쓰기 0회, 12개 원문 ===", async () => {
    const userId = "user-a";
    const seed: Record<string, string> = {
      ...legacySeed({
        accountImports: { [userId]: ["listing-1", "listing-2"] },
        budgetImports: [userId],
        listingOrderImports: [userId],
      }),
      [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans([devicePlan()]),
    };
    const { storage, setItem, forbiddenWrites } = createSpiedStorage(seed);
    const api = createFakePlanApi({ userId });
    const user = userEvent.setup();
    render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });

    await walkLoggedIn(user, api, "기기 계획");

    expect(api.callsTo("POST", "/api/interior-plans/import")).toHaveLength(1);
    expect(api.callsTo("POST", "/api/interior-plans/device-plan/items")).toHaveLength(1);
    expectOnlySessionHintMark(forbiddenWrites());
    for (const key of LEGACY_KEYS) expect(storage.getItem(key)).toBe(seed[key]);
    // 로그인 중 로컬 계획 원문은 읽기만 한다
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe(seed[INTERIOR_PLANS_STORAGE_KEY]);
    // 스파이가 살아 있다: 새 기록 키에는 썼다
    expect(setItem).toHaveBeenCalledWith(INTERIOR_PLAN_IMPORTS_STORAGE_KEY, expect.any(String));
    expect(JSON.parse(storage.getItem(INTERIOR_PLAN_IMPORTS_STORAGE_KEY)!)).toEqual({
      [userId]: ["device-plan"],
    });
    expect(
      storedKeys(storage)
        .filter((key) => !LEGACY_KEYS.includes(key))
        .toSorted(),
    ).toEqual([INTERIOR_PLAN_IMPORTS_STORAGE_KEY, INTERIOR_PLANS_STORAGE_KEY].toSorted());
  });

  it("가구 계정(이 기기에 옮기지 않은 매물·예산·순서·계획이 있음): 이전 4개 모두 건너뛰고 허용 목록 밖 쓰기 0회, 새 기록 키도 생기지 않음", async () => {
    const userId = "user-b";
    const confirm = vi.spyOn(window, "confirm");
    const seed: Record<string, string> = {
      ...legacySeed({
        accountImports: { "user-a": ["listing-old"] },
        budgetImports: ["user-a"],
        listingOrderImports: ["user-a"],
      }),
      [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans([devicePlan()]),
    };
    const { storage, setItem, forbiddenWrites } = createSpiedStorage(seed);
    const api = createFakePlanApi({
      userId,
      isInHousehold: true,
      plans: [makePlanP({ id: "plan-pa", name: "A 계획", items: [] })],
    });
    const user = userEvent.setup();
    render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });

    await walkLoggedIn(user, api, "A 계획");

    for (const path of [
      "/api/listings/import",
      "/api/budget/import",
      "/api/listing-order/import",
      "/api/interior-plans/import",
    ]) {
      expect(api.callsTo("POST", path)).toHaveLength(0);
    }
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.queryByText("이 기기의 인테리어 계획을 계정으로 옮겼습니다")).toBeNull();
    expectOnlySessionHintMark(forbiddenWrites());
    for (const key of LEGACY_KEYS) expect(storage.getItem(key)).toBe(seed[key]);
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe(seed[INTERIOR_PLANS_STORAGE_KEY]);
    expect(storage.getItem(INTERIOR_PLAN_IMPORTS_STORAGE_KEY)).toBeNull();
    expect(setItem.mock.calls.filter(([key]) => ALLOWED_KEYS.has(key))).toEqual([]);
    expect(storedKeys(storage).filter((key) => !LEGACY_KEYS.includes(key))).toEqual([
      INTERIOR_PLANS_STORAGE_KEY,
    ]);
  });
});
