// @vitest-environment jsdom
// AC-0(c)(g) · 태스크 3: 매물 카드 [인테리어 계획] 진입·추가 비용 가져오기·재진입(replace)·연결 해제 흐름에서도
// 허용 목록(새 키 2개) 밖 키에 setItem·removeItem·clear 0회(예외: 기존 session-hint 정리·표시), 기존 12개 키 원문 ===.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { DEFAULT_DRAFT } from "@/lib/constants/draft";
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
import { createFakePlanApi, jsonResponse } from "@/test/fakePlanApi";
import { makeListing } from "@/test/listingFixture";
import { createMemoryStorage } from "@/test/memoryStorage";
import { renderWithQueryClient } from "@/test/renderWithQueryClient";

import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";

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

/** AC-6 예시 매물(메모 포함, 추가 비용 3줄) */
const raemian = makeListing({
  id: "listing-1",
  name: "래미안 84",
  memo: "남향 고층",
  extraCosts: [
    { category: "interior", label: "도배", amount: 300 },
    { category: "interior", label: "샷시", amount: 1200 },
    { category: "appliance", label: "냉장고", amount: 400 },
  ],
});
const xi = makeListing({
  id: "listing-2",
  name: "자이 59",
  salePrice: 90000,
  kbPrice: 90000,
  createdAt: "2026-10-02T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
});

/** 기존 12개 키. 일부는 들여쓰기로 적어 다시 직렬화해 쓰면 원문 비교에서 걸린다 */
function legacySeed(accountImports: Record<string, string[]>): Record<string, string> {
  return {
    [ACCOUNT_IMPORTS_STORAGE_KEY]: JSON.stringify(accountImports, null, 1),
    [BUDGET_STORAGE_KEY]: "80000",
    [BUDGET_IMPORTS_STORAGE_KEY]: JSON.stringify(["user-a"], null, 1),
    [DRAFT_STORAGE_KEY]: JSON.stringify(
      { ...DEFAULT_DRAFT, salePrice: "125000", kbPrice: "120000" },
      null,
      2,
    ),
    [LISTING_ORDER_STORAGE_KEY]: JSON.stringify(["listing-2", "listing-1"], null, 1),
    [LISTING_ORDER_IMPORTS_STORAGE_KEY]: JSON.stringify(["user-a"], null, 1),
    [LISTINGS_STORAGE_KEY]: JSON.stringify([raemian, xi], null, 2),
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

function createSpiedStorage(seed: Record<string, string>) {
  const storage = createMemoryStorage(seed);
  const setItem = vi.spyOn(storage, "setItem");
  const removeItem = vi.spyOn(storage, "removeItem");
  const clear = vi.spyOn(storage, "clear");
  /** 허용 목록 밖 키에 대한 쓰기 "메서드 키 [값]" */
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

async function clickCardLink(user: User, name: string) {
  const list = await screen.findByRole("list", { name: /^저장한 매물/ });
  await user.click(
    await within(list).findByRole("button", { name: new RegExp(`^${name}`), expanded: false }),
  );
  await user.click(await screen.findByRole("link", { name: `${name} 인테리어 계획` }));
}

/**
 * 앱 시작(#/) → 저장 목록 → 카드 [인테리어 계획] → 만들기(가져오기 체크) → 저장 목록 → 같은 카드(replace) →
 * ⋯ [매물 연결 해제] → 계산
 */
async function walkCardEntry(user: User) {
  expect(await screen.findByLabelText("매매가")).toBeInTheDocument();
  await user.click(screen.getByRole("link", { name: "저장 목록" }));
  await waitFor(() => expect(window.location.hash).toBe("#/listings"));

  await clickCardLink(user, "래미안 84");
  const sheet = await screen.findByRole("dialog", { name: "인테리어 계획 만들기" });
  expect(
    within(sheet).getByRole("checkbox", { name: "추가 비용 인테리어 2줄 가져오기" }),
  ).toBeChecked();
  await user.click(within(sheet).getByRole("button", { name: "만들기" }));
  await waitFor(() => expect(window.location.hash).toMatch(/^#\/home\/[0-9a-z]+$/));
  const planHash = window.location.hash;
  expect(await screen.findByRole("button", { name: "전체 샷시 열기" })).toBeInTheDocument();

  await user.click(screen.getByRole("link", { name: "저장 목록" }));
  await clickCardLink(user, "래미안 84");
  await waitFor(() => expect(window.location.hash).toBe(planHash));

  vi.spyOn(window, "confirm").mockReturnValue(true);
  await user.click(await screen.findByRole("button", { name: "계획 관리" }));
  await user.click(screen.getByRole("button", { name: "매물 연결 해제" }));
  expect(await screen.findByText("매물 연결을 해제했습니다")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "닫기" }));

  await user.click(screen.getByRole("link", { name: "계산" }));
  expect(await screen.findByLabelText("매매가")).toBeInTheDocument();
}

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe("AC-0(c)(g) 매물 카드 진입·가져오기 흐름에서도 기존 12개 키는 그대로", () => {
  beforeEach(() => {
    window.location.hash = "#/";
    // 펼친 카드의 메모(ListingMemo)가 ResizeObserver를 쓴다. jsdom에는 없다
    vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.location.hash = "#/";
  });

  it("로그아웃: 허용 목록 밖 쓰기는 session-hint 정리(removeItem, 기존 동작)뿐, 11개 원문 ===, 새 키는 interior-plans뿐", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) =>
        String(input) === "/api/me"
          ? jsonResponse(200, { user: null })
          : jsonResponse(404, { error: "notFound" }),
      ),
    );
    const seed = legacySeed({ "user-a": ["listing-old"] });
    const { storage, setItem, forbiddenWrites } = createSpiedStorage(seed);
    const user = userEvent.setup();
    renderWithQueryClient(<AppRoutes storage={storage} />);

    await walkCardEntry(user);

    expect(new Set(forbiddenWrites())).toEqual(new Set([`removeItem ${SESSION_HINT_STORAGE_KEY}`]));
    for (const key of LEGACY_KEYS.filter((name) => name !== SESSION_HINT_STORAGE_KEY)) {
      expect(storage.getItem(key)).toBe(seed[key]);
    }
    // 스파이가 살아 있다: 새 키에는 썼고, 그 계획은 가져온 항목 2개를 가진 채 연결만 풀렸다
    expect(setItem).toHaveBeenCalledWith(INTERIOR_PLANS_STORAGE_KEY, expect.any(String));
    const { plans } = JSON.parse(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)!) as {
      plans: InteriorPlanWithItems[];
    };
    expect(plans).toHaveLength(1);
    expect(plans[0].items.map((item) => item.trade)).toEqual(["도배", "샷시"]);
    expect("listingId" in plans[0]).toBe(false);
    expect(storedKeys(storage).filter((key) => !LEGACY_KEYS.includes(key))).toEqual([
      INTERIOR_PLANS_STORAGE_KEY,
    ]);
  });

  it("로그인(혼자, 기기 매물은 이미 옮긴 기록): 허용 목록 밖 쓰기는 session-hint 표시(같은 값 1)뿐, 12개 원문 ===, 새 키 없음", async () => {
    const userId = "user-a";
    const seed = legacySeed({ [userId]: ["listing-1", "listing-2"] });
    const { storage, setItem, forbiddenWrites } = createSpiedStorage(seed);
    const api = createFakePlanApi({ userId });
    api.server.respond = (call) =>
      call.method === "GET" && call.path === "/api/listings"
        ? jsonResponse(200, { listings: [raemian, xi] })
        : undefined;
    const user = userEvent.setup();
    render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });

    await walkCardEntry(user);

    expect(api.callsTo("POST", "/api/interior-plans")).toHaveLength(1);
    expect(api.server.calls.filter((call) => call.path.startsWith("/api/listings"))).toEqual(
      api.callsTo("GET", "/api/listings"),
    );
    expect(
      forbiddenWrites().filter((write) => write !== `setItem ${SESSION_HINT_STORAGE_KEY} 1`),
    ).toEqual([]);
    for (const key of LEGACY_KEYS) expect(storage.getItem(key)).toBe(seed[key]);
    // 로그인 중에는 서버가 원본: 로컬 계획 키를 만들지 않는다(옮길 기기 계획도 없어 기록 키도 없음)
    expect(setItem.mock.calls.filter(([key]) => ALLOWED_KEYS.has(key))).toEqual([]);
    expect(storedKeys(storage).filter((key) => !LEGACY_KEYS.includes(key))).toEqual([]);
  });
});
