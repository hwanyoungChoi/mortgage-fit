// @vitest-environment jsdom
// 스펙 platform-home AC-0(a)(b): 홈 허브·하단 탭이 들어와도 기존 14개 키는 읽기만 한다.
// `#/` 홈 → 탭 [계산] → [매물] → [우리 집] → [홈] → 카드 [대출 계산] → 뒤로 가기. 각 화면이 안정된 직후마다(체크포인트)
//   - 로그인 확인 전: setItem·removeItem·clear 0회
//   - 로그아웃 확인 후: 허용되는 쓰기는 removeItem(session-hint) 1종
//   - 로그인 확인 후: 허용되는 쓰기는 setItem(session-hint, "1")
//   - session-hint 외 13개 키는 원문이 시드와 ===, 키 집합 불변(새 키 0개)
// 홈 체크포인트는 카드 요약 줄(태스크 2)이 모드별 값으로 그려진 뒤에 둔다(홈이 실제로 읽은 뒤의 쓰기를 본다).
// 스파이는 두 갈래: storage prop에 주입한 스파이 Storage(4가지 계정 상태) + prop 없이 jsdom localStorage와 Storage.prototype(1개).
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

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
import { createFakePlanApi, PENDING, type FakePlanApi } from "@/test/fakePlanApi";
import { makePlanP } from "@/test/interiorPlanFixture";
import { makeListing } from "@/test/listingFixture";
import { createMemoryStorage } from "@/test/memoryStorage";

/** 스펙 "데이터 모델"의 기존 키 14개 */
const LEGACY_KEYS = [
  "account-imports",
  "budget",
  "budget-imports",
  "draft",
  "interior-plan-imports",
  "interior-plans",
  "listing-order",
  "listing-order-imports",
  "listings",
  "privacy-mode",
  "sent-shares",
  "session-hint",
  "text-size",
  "trade-lookup",
].map((name) => `loan-calculator/${name}`);

const NON_HINT_KEYS = LEGACY_KEYS.filter((key) => key !== SESSION_HINT_STORAGE_KEY);

type Mode = "pending" | "loggedOut" | "solo" | "household";

const USER_ID = { pending: "user-a", loggedOut: null, solo: "user-a", household: "user-b" };

/**
 * 14개 키 전부를 올바른 원문으로 채운다. 모두 들여쓰기(`JSON.stringify(x, null, 2)`)라 앱이 다시 직렬화해 쓰면 ===에서 걸린다.
 * solo: 4개 이전 기록 키에 그 userId의 이전이 끝난 상태. household: 다른 계정 기록만(가구는 이전 4개를 건너뛴다).
 */
function seed14(mode: Mode): Record<string, string> {
  const isSolo = mode === "solo" || mode === "pending";
  const owner = isSolo ? "user-a" : "user-old";
  const json = (value: unknown) => JSON.stringify(value, null, 2);
  return {
    [ACCOUNT_IMPORTS_STORAGE_KEY]: json({ [owner]: ["listing-1", "listing-2"] }),
    [BUDGET_STORAGE_KEY]: "80000",
    [BUDGET_IMPORTS_STORAGE_KEY]: json([owner]),
    [DRAFT_STORAGE_KEY]: json({ ...DEFAULT_DRAFT, salePrice: "125000", kbPrice: "120000" }),
    [INTERIOR_PLAN_IMPORTS_STORAGE_KEY]: json({ [owner]: ["plan-p"] }),
    [INTERIOR_PLANS_STORAGE_KEY]: json({ plans: [makePlanP()] }),
    [LISTING_ORDER_STORAGE_KEY]: json(["listing-2", "listing-1"]),
    [LISTING_ORDER_IMPORTS_STORAGE_KEY]: json([owner]),
    [LISTINGS_STORAGE_KEY]: json([
      makeListing({ id: "listing-1", name: "래미안 84", memo: "남향 고층" }),
      makeListing({
        id: "listing-2",
        name: "자이 59",
        salePrice: 90000,
        kbPrice: 90000,
        createdAt: "2026-10-02T00:00:00.000Z",
        updatedAt: "2026-10-02T00:00:00.000Z",
      }),
    ]),
    [PRIVACY_MODE_STORAGE_KEY]: "false",
    [SENT_SHARES_STORAGE_KEY]: json([
      {
        token: "AbCdEfGhIjKlMnOpQrStUv",
        kind: "listing",
        ownerKey: "local",
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
    ]),
    [SESSION_HINT_STORAGE_KEY]: "1",
    [TEXT_SIZE_STORAGE_KEY]: "small",
    [TRADE_LOOKUP_STORAGE_KEY]: json({ lawdCd: "11680" }),
  };
}

/** 모드별로 허용되는 쓰기("메서드 키 값") */
const ALLOWED_WRITES: Record<Mode, string[]> = {
  pending: [],
  loggedOut: [`removeItem ${SESSION_HINT_STORAGE_KEY}`],
  solo: [`setItem ${SESSION_HINT_STORAGE_KEY} 1`],
  household: [`setItem ${SESSION_HINT_STORAGE_KEY} 1`],
};

type WriteSpies = {
  setItem: { mock: { calls: unknown[][] } };
  removeItem: { mock: { calls: unknown[][] } };
  clear: { mock: { calls: unknown[][] } };
};

const writesOf = ({ setItem, removeItem, clear }: WriteSpies) => [
  ...setItem.mock.calls.map(([key, value]) => `setItem ${String(key)} ${String(value)}`),
  ...removeItem.mock.calls.map(([key]) => `removeItem ${String(key)}`),
  ...clear.mock.calls.map(() => "clear"),
];

const keysOf = (storage: Storage) =>
  Array.from({ length: storage.length }, (_, index) => storage.key(index) ?? "");

/** 체크포인트 한 번: 허용 밖 쓰기 0회, 13개 키 원문 ===, 키 집합 불변 */
function expectUntouched(
  storage: Storage,
  spies: WriteSpies,
  seed: Record<string, string>,
  mode: Mode,
  step: string,
) {
  const allowed = new Set(ALLOWED_WRITES[mode]);
  expect(
    writesOf(spies).filter((write) => !allowed.has(write)),
    step,
  ).toEqual([]);
  for (const key of NON_HINT_KEYS) expect(storage.getItem(key), `${step}: ${key}`).toBe(seed[key]);
  expect(
    keysOf(storage)
      .filter((key) => key !== SESSION_HINT_STORAGE_KEY)
      .toSorted(),
    step,
  ).toEqual(NON_HINT_KEYS.toSorted());
}

function stubApi(mode: Mode) {
  const userId = USER_ID[mode];
  const api = createFakePlanApi({
    userId,
    isInHousehold: mode === "household",
    plans:
      mode === "household"
        ? [makePlanP({ id: "plan-pa", name: "A 계획" })]
        : mode === "solo"
          ? [makePlanP()]
          : [],
  });
  if (mode === "pending") {
    api.server.respond = (call) => (call.path === "/api/me" ? PENDING : undefined);
  }
  return api;
}

type User = ReturnType<typeof userEvent.setup>;

const tab = (name: string) =>
  within(screen.getByRole("navigation", { name: "화면" })).getByRole("link", { name });

async function expectHub() {
  expect(await screen.findByRole("heading", { level: 1, name: "홈" })).toBeInTheDocument();
  expect(window.location.hash).toBe("#/");
}

/** 홈 카드 요약 줄(AC-6·7, 태스크 2)이 모드별 값으로 그려졌다. 홈이 실제로 저장소·서버를 읽은 뒤에 체크포인트를 둔다 */
const HUB_SUMMARY: Record<Mode, [string, string, string]> = {
  pending: ["작성 중 · 매매가 12억 5,000만원", "불러오는 중", "불러오는 중"],
  loggedOut: [
    "작성 중 · 매매가 12억 5,000만원",
    "저장한 매물 2개",
    "우리 집 · 앞으로 낼 돈 1,250만원",
  ],
  solo: [
    "작성 중 · 매매가 12억 5,000만원",
    "본 매물을 저장해 자기자금·추가 비용을 비교합니다",
    "우리 집 · 앞으로 낼 돈 1,250만원",
  ],
  household: [
    "작성 중 · 매매가 12억 5,000만원",
    "함께 쓰는 목록 · 매물 0개",
    "A 계획 · 앞으로 낼 돈 1,250만원",
  ],
};

async function expectHubSummary(mode: Mode) {
  await expectHub();
  const main = screen.getByRole("main");
  const [calculator, listings, home] = HUB_SUMMARY[mode];
  await waitFor(() => {
    expect(within(main).getByRole("link", { name: "대출 계산" })).toHaveAccessibleDescription(
      calculator,
    );
    expect(within(main).getByRole("link", { name: "매물 모으기" })).toHaveAccessibleDescription(
      listings,
    );
    expect(
      within(main).getByRole("link", { name: "우리 집 인테리어" }),
    ).toHaveAccessibleDescription(home);
  });
}

/** 우리 집 탭이 안정된 화면(계획 1개 → 그 계획). 확인 전에는 "불러오는 중" */
async function expectHomeSettled(mode: Mode) {
  if (mode === "pending") {
    expect(await screen.findByText("인테리어 계획을 불러오는 중")).toBeInTheDocument();
    return;
  }
  if (mode === "household") {
    expect(await screen.findByRole("heading", { level: 1, name: "A 계획" })).toBeInTheDocument();
    return;
  }
  expect(await screen.findByRole("button", { name: "샷시 E샷시 열기" })).toBeInTheDocument();
}

async function expectListingsSettled(mode: Mode) {
  expect(await screen.findByRole("heading", { level: 1, name: "저장 목록" })).toBeInTheDocument();
  if (mode === "loggedOut") {
    expect(await screen.findByRole("list", { name: "저장한 매물 2개" })).toBeInTheDocument();
  } else if (mode !== "pending") {
    // 로그인: 서버 목록(빈 목록)을 받았다. 로컬 2개는 세지 않는다
    expect(await screen.findByText("저장한 매물이 없습니다")).toBeInTheDocument();
  }
}

/** 순회. 각 단계 뒤 check(step) */
async function walk(user: User, api: FakePlanApi, mode: Mode, check: (step: string) => void) {
  await expectHubSummary(mode);
  // 홈 첫 화면이 안정될 때까지: 로그인 확인을 보냈고, 확인 전 모드가 아니면 진행 중인 조회가 모두 끝났다
  await waitFor(() => expect(api.callsTo("GET", "/api/me").length).toBeGreaterThan(0));
  if (mode !== "pending") await waitFor(() => expect(api.queryClient.isFetching()).toBe(0));
  check("홈 첫 화면");

  await user.click(tab("계산"));
  const salePrice = await screen.findByLabelText("매매가");
  expect(window.location.hash).toBe("#/calculator");
  expect(salePrice).toHaveValue("125,000");
  check("탭 [계산]");

  await user.click(tab("매물"));
  await waitFor(() => expect(window.location.hash).toBe("#/listings"));
  await expectListingsSettled(mode);
  check("탭 [매물]");

  await user.click(tab("우리 집"));
  await waitFor(() => expect(window.location.hash).toBe("#/home"));
  await expectHomeSettled(mode);
  check("탭 [우리 집]");

  await user.click(tab("홈"));
  await expectHubSummary(mode);
  check("탭 [홈]");

  await user.click(screen.getByRole("link", { name: "대출 계산" }));
  expect(await screen.findByLabelText("매매가")).toHaveValue("125,000");
  expect(window.location.hash).toBe("#/calculator");
  check("카드 [대출 계산]");

  window.history.back();
  await waitFor(() => expect(window.location.hash).toBe("#/"));
  await expectHubSummary(mode);
  check("뒤로 가기");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("AC-0(a) 홈 허브·하단 탭 순회 동안 기존 14개 키는 그대로 (주입 스파이 Storage)", () => {
  it("시드는 기존 키 14개 전부이고 모두 비어 있지 않다", () => {
    for (const mode of ["pending", "loggedOut", "solo", "household"] as const) {
      const seed = seed14(mode);
      expect(Object.keys(seed).toSorted()).toEqual(LEGACY_KEYS.toSorted());
      expect(Object.values(seed).every((raw) => raw.length > 0)).toBe(true);
    }
  });

  it.each<[Mode, string]>([
    ["pending", "로그인 확인 응답 전: 쓰기 0회"],
    ["loggedOut", "로그아웃 확인 후: removeItem(session-hint)만"],
    ["solo", "로그인(혼자, 이전 4키 끝남): setItem(session-hint, 1)만"],
    ["household", "로그인(가구, 이전 4개 건너뜀): setItem(session-hint, 1)만"],
  ])("%s — %s, 체크포인트마다 13개 원문 ===·새 키 0개", async (mode) => {
    const seed = seed14(mode);
    const storage = createMemoryStorage(seed);
    const spies = {
      setItem: vi.spyOn(storage, "setItem"),
      removeItem: vi.spyOn(storage, "removeItem"),
      clear: vi.spyOn(storage, "clear"),
    };
    const api = stubApi(mode);
    const user = userEvent.setup();
    window.location.hash = "#/";
    render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });

    await walk(user, api, mode, (step) => expectUntouched(storage, spies, seed, mode, step));

    // 이전은 일어나지 않았다(이전 끝남·가구 건너뜀)
    for (const path of [
      "/api/listings/import",
      "/api/budget/import",
      "/api/listing-order/import",
      "/api/interior-plans/import",
    ]) {
      expect(api.callsTo("POST", path), path).toHaveLength(0);
    }
    expect(api.writes()).toEqual([]);
    // 스파이가 살아 있다: 허용된 쓰기는 정확히 그 한 종류로 일어났다(확인 전은 0회)
    expect(new Set(writesOf(spies))).toEqual(new Set(ALLOWED_WRITES[mode]));
  });
});

describe("AC-0(a) 주입 경로를 우회하는 직접 쓰기 (jsdom localStorage + Storage.prototype 스파이)", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("storage prop 없이 로그아웃 순회: removeItem(session-hint) 외 쓰기 0회, 13개 원문 ===", async () => {
    const seed = seed14("loggedOut");
    localStorage.clear();
    for (const [key, value] of Object.entries(seed)) localStorage.setItem(key, value);
    const spies = {
      setItem: vi.spyOn(Storage.prototype, "setItem"),
      removeItem: vi.spyOn(Storage.prototype, "removeItem"),
      clear: vi.spyOn(Storage.prototype, "clear"),
    };
    const api = stubApi("loggedOut");
    const user = userEvent.setup();
    window.location.hash = "#/";
    render(<AppRoutes />, { wrapper: api.wrapper });

    await walk(user, api, "loggedOut", (step) =>
      expectUntouched(localStorage, spies, seed, "loggedOut", step),
    );

    // 스파이가 jsdom localStorage 호출을 실제로 잡는다
    expect(new Set(writesOf(spies))).toEqual(new Set(ALLOWED_WRITES.loggedOut));
  });
});

describe("AC-0(b) 옛 #/ 북마크: 홈에 도착하고 작성 중 계산은 남는다", () => {
  it("draft salePrice 125000 → #/ 홈 → [계산] 탭 매매가 125,000, draft 원문 ===", async () => {
    const draft = JSON.stringify({ ...DEFAULT_DRAFT, salePrice: "125000" }, null, 2);
    const storage = createMemoryStorage({ [DRAFT_STORAGE_KEY]: draft });
    const api = stubApi("loggedOut");
    const user = userEvent.setup();
    window.location.hash = "#/";
    render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });

    await expectHub();
    expect(screen.queryByLabelText("매매가")).not.toBeInTheDocument();
    await user.click(tab("계산"));
    expect(await screen.findByLabelText("매매가")).toHaveValue("125,000");
    expect(storage.getItem(DRAFT_STORAGE_KEY)).toBe(draft);
  });
});
