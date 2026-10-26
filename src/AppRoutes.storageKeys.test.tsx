// @vitest-environment jsdom
// AC-0(c)(g): [우리 집]을 만들고 써도 기존 12개 키는 읽기만 한다. 허용 목록(새 키 2개) 밖의 키에
// setItem·removeItem·clear가 0회이고, 시드한 원문이 `===`로 같다(같은 값을 다시 쓰는 것은 스파이만 잡는다).
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { DEFAULT_DRAFT } from "@/lib/constants/draft";
import { ACCOUNT_IMPORTS_STORAGE_KEY } from "@/lib/utils/accountImportStorage";
import { BUDGET_IMPORTS_STORAGE_KEY } from "@/lib/utils/budgetImportStorage";
import { BUDGET_STORAGE_KEY } from "@/lib/utils/budgetStorage";
import { DRAFT_STORAGE_KEY } from "@/lib/utils/draftStorage";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { LISTING_ORDER_IMPORTS_STORAGE_KEY } from "@/lib/utils/listingOrderImportStorage";
import { LISTING_ORDER_STORAGE_KEY } from "@/lib/utils/listingOrderStorage";
import { LISTINGS_STORAGE_KEY } from "@/lib/utils/listingStorage";
import { PRIVACY_MODE_STORAGE_KEY } from "@/lib/utils/privacyModeStorage";
import { SENT_SHARES_STORAGE_KEY } from "@/lib/utils/sentShareStorage";
import { SESSION_HINT_STORAGE_KEY } from "@/lib/utils/sessionHintStorage";
import { TEXT_SIZE_STORAGE_KEY } from "@/lib/utils/textSizeStorage";
import { TRADE_LOOKUP_STORAGE_KEY } from "@/lib/utils/tradeLookupStorage";
import { makeListing } from "@/test/listingFixture";
import { createMemoryStorage } from "@/test/memoryStorage";
import { renderWithQueryClient } from "@/test/renderWithQueryClient";

/** 새 키 2개만 쓸 수 있다(스펙 "브라우저 저장소") */
const ALLOWED_KEYS = new Set([
  "loan-calculator/interior-plans",
  "loan-calculator/interior-plan-imports",
]);

/**
 * 배포 전 main으로 매물·메모·예산·순서·작성 중 입력·가리기·글자 크기를 넣은 브라우저의 기존 12개 키.
 * 일부는 앱이 쓰는 모양과 다르게(들여쓰기) 적어, 다시 직렬화해 쓰면 원문 비교에서 걸리게 한다.
 */
const LEGACY_SEED: Record<string, string> = {
  [ACCOUNT_IMPORTS_STORAGE_KEY]: JSON.stringify({ "user-a": ["listing-old"] }),
  [BUDGET_STORAGE_KEY]: "80000",
  [BUDGET_IMPORTS_STORAGE_KEY]: JSON.stringify(["user-a"]),
  [DRAFT_STORAGE_KEY]: JSON.stringify(
    { ...DEFAULT_DRAFT, salePrice: "125000", kbPrice: "120000" },
    null,
    2,
  ),
  [LISTING_ORDER_STORAGE_KEY]: JSON.stringify(["listing-2", "listing-1"], null, 1),
  [LISTING_ORDER_IMPORTS_STORAGE_KEY]: JSON.stringify(["user-a"]),
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

type FetchMode = "pending" | "loggedOut";

/** pending: 로그인 확인(`/api/me`) 응답 전. loggedOut: user null */
function stubApi(mode: FetchMode) {
  const fetchMock = vi.fn((input: string) => {
    if (String(input) === "/api/me") {
      if (mode === "pending") return new Promise<Response>(() => {});
      return Promise.resolve(
        new Response(JSON.stringify({ user: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify({ error: "notFound", message: String(input) }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
}

function createSpiedStorage(seed: Record<string, string>) {
  const storage = createMemoryStorage(seed);
  const setItem = vi.spyOn(storage, "setItem");
  const removeItem = vi.spyOn(storage, "removeItem");
  const clear = vi.spyOn(storage, "clear");
  /** 허용 목록 밖 키에 대한 쓰기 [메서드, 키] */
  const forbiddenWrites = () => [
    ...setItem.mock.calls
      .filter(([key]) => !ALLOWED_KEYS.has(key))
      .map(([key]) => ["setItem", key]),
    ...removeItem.mock.calls
      .filter(([key]) => !ALLOWED_KEYS.has(key))
      .map(([key]) => ["removeItem", key]),
    ...clear.mock.calls.map(() => ["clear", "*"]),
  ];
  return { storage, setItem, forbiddenWrites };
}

/** 앱 시작(#/) → 저장 목록 → 우리 집(만들기·항목 추가) → #/home 직접 → 계산 */
async function walkThroughTabs(user: ReturnType<typeof userEvent.setup>) {
  // 앱 시작: 첫 화면은 계산
  expect(await screen.findByLabelText("매매가")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "계산" })).toHaveAttribute("aria-current", "page");

  await user.click(screen.getByRole("link", { name: "저장 목록" }));
  await waitFor(() => expect(window.location.hash).toBe("#/listings"));

  await user.click(screen.getByRole("link", { name: "우리 집" }));
  await waitFor(() => expect(window.location.hash).toBe("#/home"));
  await user.click(await screen.findByRole("button", { name: "계획 만들기" }));
  const createSheet = screen.getByRole("dialog", { name: "인테리어 계획 만들기" });
  await user.type(within(createSheet).getByRole("textbox", { name: "계획 이름" }), "우리 집");
  await user.click(within(createSheet).getByRole("button", { name: "만들기" }));
  await waitFor(() => expect(window.location.hash).toMatch(/^#\/home\/[0-9a-f]{32}$/));

  await user.click(screen.getByRole("button", { name: "항목 추가" }));
  const itemSheet = screen.getByRole("dialog", { name: "항목 추가" });
  await user.click(
    within(within(itemSheet).getByRole("group", { name: "공종 고르기" })).getByRole("button", {
      name: "도배",
    }),
  );
  await user.type(within(itemSheet).getByLabelText("예산(선택)"), "300");
  await user.click(within(itemSheet).getByRole("button", { name: "저장" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "전체 도배 열기" })).toBeInTheDocument();

  // 탭으로 다시 들어오면(#/home) 하나뿐인 플랜을 연다
  await user.click(screen.getByRole("link", { name: "우리 집" }));
  await waitFor(() => expect(window.location.hash).toBe("#/home"));
  expect(screen.getByRole("button", { name: "전체 도배 열기" })).toBeInTheDocument();

  await user.click(screen.getByRole("link", { name: "계산" }));
  expect(await screen.findByLabelText("매매가")).toBeInTheDocument();
}

describe("AC-0(c)(g) 기존 12개 키는 [우리 집]을 써도 그대로", () => {
  beforeEach(() => {
    window.location.hash = "#/";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.location.hash = "#/";
  });

  it("시드는 코드의 기존 키 12개 전부다", () => {
    expect(Object.keys(LEGACY_SEED).toSorted()).toEqual(LEGACY_KEYS.toSorted());
  });

  it("로그인 확인 응답 전: 앱 시작·각 탭·[우리 집] 만들기·항목 추가 동안 허용 목록 밖 쓰기 0회, 12개 원문 === 그대로, 새 키는 interior-plans뿐", async () => {
    stubApi("pending");
    const user = userEvent.setup();
    const { storage, setItem, forbiddenWrites } = createSpiedStorage(LEGACY_SEED);
    renderWithQueryClient(<AppRoutes storage={storage} />);

    await walkThroughTabs(user);

    expect(forbiddenWrites()).toEqual([]);
    for (const key of LEGACY_KEYS) expect(storage.getItem(key)).toBe(LEGACY_SEED[key]);
    // 스파이가 살아 있다: 새 키에는 썼다
    expect(setItem).toHaveBeenCalledWith(INTERIOR_PLANS_STORAGE_KEY, expect.any(String));
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
    expect(keys.filter((key) => !LEGACY_KEYS.includes(key ?? ""))).toEqual([
      INTERIOR_PLANS_STORAGE_KEY,
    ]);
  });

  it("로그아웃 확인 뒤(/api/me user null): session-hint 정리(기존 동작)를 뺀 11개 키 쓰기 0회·원문 ===", async () => {
    stubApi("loggedOut");
    const user = userEvent.setup();
    const { storage, forbiddenWrites } = createSpiedStorage(LEGACY_SEED);
    renderWithQueryClient(<AppRoutes storage={storage} />);

    await walkThroughTabs(user);
    // 로그아웃 상태 목록이 뜬 뒤까지 본다
    await user.click(screen.getByRole("link", { name: "저장 목록" }));
    expect(await screen.findByRole("list", { name: "저장한 매물 2개" })).toBeInTheDocument();

    // 로그인 확인이 user null이면 useListingSource가 session-hint를 지운다(이번 사이클 전부터의 동작).
    // 그 외 허용 목록 밖 쓰기는 없다.
    expect(forbiddenWrites().filter(([, key]) => key !== SESSION_HINT_STORAGE_KEY)).toEqual([]);
    // 그 정리는 removeItem(session-hint)뿐이다(setItem·clear 없음).
    expect(forbiddenWrites().length).toBeGreaterThan(0);
    expect(new Set(forbiddenWrites().map((write) => write.join(" ")))).toEqual(
      new Set([`removeItem ${SESSION_HINT_STORAGE_KEY}`]),
    );
    for (const key of LEGACY_KEYS.filter((name) => name !== SESSION_HINT_STORAGE_KEY)) {
      expect(storage.getItem(key)).toBe(LEGACY_SEED[key]);
    }
  });
});
