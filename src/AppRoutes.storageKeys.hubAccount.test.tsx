// @vitest-environment jsdom
// 스펙 hub-account AC-0(데이터 보존): 계정·함께 쓰기가 홈으로 오고 가리기가 저장 목록 토글에만 남아도 기존 14개 키는 그대로다.
// 시드: 14개 키 전부를 들여쓴 JSON 원문으로(앱이 다시 직렬화해 쓰면 ===에서 걸린다), privacy-mode는 켜짐("true").
// 모드 4개: 확인 중(pending, /api/me 응답 없음) · 로그아웃 · 로그인 혼자(이전 4키 끝남) · 가구.
// 순회: 홈 → ([함께 쓰기] 시트 열고 [닫기], 다시 열고 뒤로 가기 — 혼자만) → [매물] 저장 목록 [가리기] 끄기·켜기 → [우리 집] 계획
// → [표] → [홈] → 카드 [대출 계산] → 뒤로 가기. 단계마다
//   - 허용 쓰기: 로그아웃 확인 뒤 removeItem(session-hint), 로그인 확인 뒤 setItem(session-hint, "1"), 그리고 대조군 하나
//   - 대조군: 저장 목록 [가리기] 2번 = setItem(privacy-mode,"false") → setItem(privacy-mode,"true") 정확히 이 순서의 2회.
//     [매물] 단계에서만 일어나고 [우리 집]·표·홈 단계의 privacy-mode 쓰기는 0회(removeItem도 0회)
//   - session-hint 외 13개 키 원문 ===(privacy-mode는 마지막으로 쓴 값, 쓰지 않았으면 시드), 키 집합 불변
// 확인 중 모드: 홈 단계까지 쓰기 0회이고 숨긴 자리의 [로그아웃]을 눌러도 요청·쓰기가 없다.
// 추가 갈래: (a) 혼자 → 홈 [로그아웃] → 카드가 이 기기 값, 쓰기는 removeItem(session-hint)뿐(횟수 측정 고정),
//   (b) 가구 → 홈 [나가기] → 로컬 쓰기는 로그인 확인 결과(session-hint "1")뿐, 서버 쓰기는 POST /api/household/leave 1건.
// 스파이는 두 갈래: 주입 스파이 Storage(4모드·갈래) + storage prop 없이 jsdom localStorage와 Storage.prototype(1개).
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { DEFAULT_DRAFT } from "@/lib/constants/draft";
import { ACCOUNT_IMPORTS_STORAGE_KEY } from "@/lib/utils/accountImportStorage";
import { BUDGET_IMPORTS_STORAGE_KEY } from "@/lib/utils/budgetImportStorage";
import { BUDGET_STORAGE_KEY } from "@/lib/utils/budgetStorage";
import { downloadTextFile } from "@/lib/utils/downloadTextFile";
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
import { createFakePlanApi, jsonResponse, PENDING, type FakePlanApi } from "@/test/fakePlanApi";
import { makePlanP } from "@/test/interiorPlanFixture";
import { makeListing } from "@/test/listingFixture";
import { createMemoryStorage } from "@/test/memoryStorage";

vi.mock("@/lib/utils/downloadTextFile", () => ({ downloadTextFile: vi.fn() }));

const download = vi.mocked(downloadTextFile);

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

const USER_ID: Record<Mode, string | null> = {
  pending: "user-a",
  loggedOut: null,
  solo: "user-a",
  household: "user-b",
};

const json = (value: unknown) => JSON.stringify(value, null, 2);

/**
 * 14개 키 전부를 올바른 원문으로 채운다(들여쓰기). privacy-mode는 켜짐.
 * solo·pending: 4개 이전 기록 키에 그 userId의 이전이 끝난 상태. household·loggedOut: 다른 계정 기록만(`owner`로 바꿀 수 있다).
 */
function seed14(
  mode: Mode,
  owner = mode === "solo" || mode === "pending" ? "user-a" : "user-old",
): Record<string, string> {
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
    [PRIVACY_MODE_STORAGE_KEY]: "true",
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

/** 모드별로 허용되는 session-hint 쓰기("메서드 키 값"). privacy-mode 쓰기는 따로 순서까지 본다 */
const HINT_WRITES: Record<Mode, string[]> = {
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

const privacyWritesOf = ({ setItem }: WriteSpies) =>
  setItem.mock.calls
    .filter(([key]) => key === PRIVACY_MODE_STORAGE_KEY)
    .map(([, value]) => String(value));

const keysOf = (storage: Storage) =>
  Array.from({ length: storage.length }, (_, index) => storage.key(index) ?? "");

/** 저장 목록 [가리기] 끄기 → 켜기 뒤 */
const PRIVACY_TOGGLED = ["false", "true"] as const;

type Check = (step: string, privacyWrites?: readonly string[]) => void;

/**
 * 체크포인트 한 번: session-hint 허용 쓰기·privacy-mode setItem 밖의 쓰기 0회, privacy-mode 쓰기는 정확히 `privacyWrites`,
 * 13개 키 원문 ===(privacy-mode는 마지막으로 쓴 값, 쓰지 않았으면 시드), 키 집합 불변
 */
function expectUntouched(
  storage: Storage,
  spies: WriteSpies,
  seed: Record<string, string>,
  mode: Mode,
  step: string,
  privacyWrites: readonly string[] = [],
) {
  const allowed = new Set(HINT_WRITES[mode]);
  expect(
    writesOf(spies).filter(
      (write) => !allowed.has(write) && !write.startsWith(`setItem ${PRIVACY_MODE_STORAGE_KEY} `),
    ),
    step,
  ).toEqual([]);
  expect(privacyWritesOf(spies), `${step}: privacy-mode 쓰기`).toEqual(privacyWrites);
  const expected: Record<string, string> = {
    ...seed,
    [PRIVACY_MODE_STORAGE_KEY]: privacyWrites.at(-1) ?? seed[PRIVACY_MODE_STORAGE_KEY],
  };
  for (const key of NON_HINT_KEYS) {
    expect(storage.getItem(key) === expected[key], `${step}: ${key}`).toBe(true);
  }
  expect(
    keysOf(storage)
      .filter((key) => key !== SESSION_HINT_STORAGE_KEY)
      .toSorted(),
    step,
  ).toEqual(NON_HINT_KEYS.toSorted());
}

/** 로그인이면 서버 목록에 매물 하나(저장 목록 [가리기]가 보이게). 확인 중은 /api/me에 답하지 않는다 */
function stubApi(mode: Mode) {
  const api = createFakePlanApi({
    userId: USER_ID[mode],
    isInHousehold: mode === "household",
    plans:
      mode === "household"
        ? [makePlanP({ id: "plan-pa", name: "A 계획" })]
        : mode === "loggedOut"
          ? []
          : [makePlanP()],
  });
  api.server.respond = (call) => {
    if (mode === "pending" && call.path === "/api/me") return PENDING;
    if (call.method === "GET" && call.path === "/api/listings") {
      return jsonResponse(200, { listings: [makeListing({ id: "server-1", name: "서버 매물" })] });
    }
    return undefined;
  };
  return api;
}

type User = ReturnType<typeof userEvent.setup>;

const tab = (name: string) =>
  within(screen.getByRole("navigation", { name: "화면" })).getByRole("link", { name });

/** 계산 카드 매매가는 가리고(•••는 aria-hidden이라 설명에서 빠진다) 우리 집 줄은 가리지 않는다(AC-6) */
const HUB_SUMMARY: Record<Mode, [string, string, string]> = {
  pending: ["작성 중 · 매매가 가려짐", "불러오는 중", "불러오는 중"],
  loggedOut: ["작성 중 · 매매가 가려짐", "저장한 매물 2개", "우리 집 · 지출 예정 15,300,000원"],
  solo: ["작성 중 · 매매가 가려짐", "저장한 매물 1개", "우리 집 · 지출 예정 15,300,000원"],
  household: [
    "작성 중 · 매매가 가려짐",
    "함께 쓰는 목록 · 매물 1개",
    "A 계획 · 지출 예정 15,300,000원",
  ],
};

async function expectHubSummary(mode: Mode) {
  expect(await screen.findByRole("heading", { level: 1, name: "홈" })).toBeInTheDocument();
  expect(window.location.hash).toBe("#/");
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
  // 계산 카드 매매가 원문은 DOM에 없다(가리기는 읽기만 한다)
  expect(main.innerHTML).not.toContain("12억");
}

async function expectListingsSettled(mode: Mode) {
  expect(await screen.findByRole("heading", { level: 1, name: "저장 목록" })).toBeInTheDocument();
  if (mode === "loggedOut") {
    expect(await screen.findByRole("list", { name: "저장한 매물 2개" })).toBeInTheDocument();
  } else if (mode !== "pending") {
    expect(await screen.findByRole("list", { name: "저장한 매물 1개" })).toBeInTheDocument();
  }
}

async function expectHomeSettled(mode: Mode) {
  if (mode === "pending") {
    expect(await screen.findByText("인테리어 계획을 불러오는 중")).toBeInTheDocument();
    return;
  }
  const title = mode === "household" ? "A 계획" : "우리 집";
  expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "샷시 E샷시 열기" })).toBeInTheDocument();
}

/** 혼자 모드의 [함께 쓰기] 시트: [닫기]로 한 번, 뒤로 가기로 한 번 닫는다 */
async function walkHouseholdSheet(user: User, check: Check) {
  const main = screen.getByRole("main");
  const button = await within(main).findByRole("button", { name: "함께 쓰기" });
  await user.click(button);
  expect(screen.getByRole("dialog", { name: "함께 쓰기" })).toBeInTheDocument();
  check("[함께 쓰기] 시트 열기");
  await user.click(
    within(screen.getByRole("dialog", { name: "함께 쓰기" })).getByRole("button", {
      name: "닫기",
    }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(button).toHaveFocus();
  check("[함께 쓰기] 시트 닫기");

  await user.click(button);
  expect(screen.getByRole("dialog", { name: "함께 쓰기" })).toBeInTheDocument();
  window.history.back();
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(window.location.hash).toBe("#/");
  check("[함께 쓰기] 시트 뒤로 가기로 닫기");
}

/** 순회. 각 단계 뒤 check(step, 그때까지의 privacy-mode 쓰기) */
async function walk(user: User, api: FakePlanApi, mode: Mode, check: Check) {
  await expectHubSummary(mode);
  await waitFor(() => expect(api.callsTo("GET", "/api/me").length).toBeGreaterThan(0));
  if (mode !== "pending") await waitFor(() => expect(api.queryClient.isFetching()).toBe(0));
  check("홈 첫 화면");

  if (mode === "pending") {
    // 확인 중 자리의 [로그아웃]은 숨긴 자리(inert·aria-hidden)라 눌려도 요청·쓰기가 없다
    const hidden = within(screen.getByRole("main")).getByText("로그아웃", { selector: "button" });
    expect(hidden.closest("[inert]")).toHaveAttribute("aria-hidden", "true");
    await user.click(hidden);
    expect(api.callsTo("POST", "/api/auth/logout")).toHaveLength(0);
    check("확인 중 [로그아웃] 누르기");
  }
  if (mode === "solo") await walkHouseholdSheet(user, check);

  await user.click(tab("매물"));
  await waitFor(() => expect(window.location.hash).toBe("#/listings"));
  await expectListingsSettled(mode);
  check("탭 [매물] 저장 목록");
  const toggled = mode === "pending" ? [] : PRIVACY_TOGGLED;
  if (mode === "pending") {
    // 확인 전에는 목록이 없어 [가리기]도 없다
    expect(screen.queryByRole("button", { name: "가리기" })).not.toBeInTheDocument();
  } else {
    const privacyButton = await screen.findByRole("button", { name: "가리기" });
    expect(privacyButton).toHaveAttribute("aria-pressed", "true");
    await user.click(privacyButton);
    expect(privacyButton).toHaveAttribute("aria-pressed", "false");
    check("저장 목록 [가리기] 끄기", ["false"]);
    await user.click(privacyButton);
    expect(privacyButton).toHaveAttribute("aria-pressed", "true");
    check("저장 목록 [가리기] 켜기", PRIVACY_TOGGLED);
  }

  await user.click(tab("우리 집"));
  await waitFor(() => expect(window.location.hash).toBe("#/home"));
  await expectHomeSettled(mode);
  check("탭 [우리 집] 계획", toggled);

  if (mode !== "pending") {
    await user.click(screen.getByRole("radio", { name: "표" }));
    await waitFor(() => expect(window.location.hash).toBe("#/home?view=table"));
    const csv = screen.getByRole("button", { name: "CSV 내려받기" });
    const print = screen.getByRole("button", { name: "인쇄·PDF" });
    expect(csv).toBeEnabled();
    expect(print).toBeEnabled();
    await user.click(csv);
    await user.click(print);
    expect(download).toHaveBeenCalledTimes(1);
    expect(window.print).toHaveBeenCalledTimes(1);
    check("[표] CSV·인쇄", toggled);
  }

  await user.click(tab("홈"));
  await expectHubSummary(mode);
  check("탭 [홈]", toggled);

  await user.click(screen.getByRole("link", { name: "대출 계산" }));
  expect(await screen.findByLabelText("매매가")).toHaveValue("125,000");
  expect(window.location.hash).toBe("#/calculator");
  check("카드 [대출 계산]", toggled);

  window.history.back();
  await waitFor(() => expect(window.location.hash).toBe("#/"));
  await expectHubSummary(mode);
  check("뒤로 가기", toggled);
}

const IMPORT_PATHS = [
  "/api/listings/import",
  "/api/budget/import",
  "/api/listing-order/import",
  "/api/interior-plans/import",
];

function spyOn(storage: Storage) {
  return {
    setItem: vi.spyOn(storage, "setItem"),
    removeItem: vi.spyOn(storage, "removeItem"),
    clear: vi.spyOn(storage, "clear"),
  };
}

beforeEach(() => {
  download.mockReset();
  vi.spyOn(window, "print").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("AC-0 홈 계정 순회 동안 기존 14개 키는 그대로 (주입 스파이 Storage, privacy-mode 켜짐)", () => {
  it('시드는 기존 키 14개 전부이고 privacy-mode는 "true"다', () => {
    for (const mode of ["pending", "loggedOut", "solo", "household"] as const) {
      const seed = seed14(mode);
      expect(Object.keys(seed).toSorted()).toEqual(LEGACY_KEYS.toSorted());
      expect(Object.values(seed).every((raw) => raw.length > 0)).toBe(true);
      expect(seed[PRIVACY_MODE_STORAGE_KEY]).toBe("true");
    }
  });

  it.each<[Mode, string]>([
    ["pending", "확인 전: 쓰기 0회, 숨긴 [로그아웃]은 눌리지 않는다"],
    ["loggedOut", "로그아웃: removeItem(session-hint)과 대조군 privacy-mode 2회뿐"],
    [
      "solo",
      "로그인 혼자(시트 열고 닫기 포함): setItem(session-hint, 1)과 대조군뿐, 서버 쓰기 0건",
    ],
    ["household", "가구: setItem(session-hint, 1)과 대조군뿐, 서버 쓰기 0건"],
  ])("%s — %s", async (mode) => {
    const seed = seed14(mode);
    const storage = createMemoryStorage(seed);
    const spies = spyOn(storage);
    const api = stubApi(mode);
    const user = userEvent.setup();
    window.location.hash = "#/";
    render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });

    await walk(user, api, mode, (step, privacyWrites) =>
      expectUntouched(storage, spies, seed, mode, step, privacyWrites),
    );

    for (const path of IMPORT_PATHS) expect(api.callsTo("POST", path), path).toHaveLength(0);
    expect(api.writes()).toEqual([]);
    // 스파이가 살아 있다: 허용된 쓰기는 정확히 그 종류로 일어났고, privacy-mode는 removeItem이 아니라 setItem 2회다
    const expected = [
      ...HINT_WRITES[mode],
      ...(mode === "pending"
        ? []
        : PRIVACY_TOGGLED.map((value) => `setItem ${PRIVACY_MODE_STORAGE_KEY} ${value}`)),
    ];
    expect(new Set(writesOf(spies))).toEqual(new Set(expected));
    expect(privacyWritesOf(spies)).toEqual(mode === "pending" ? [] : [...PRIVACY_TOGGLED]);
  });
});

describe("AC-0 주입 경로를 우회하는 직접 쓰기 (jsdom localStorage + Storage.prototype 스파이)", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("storage prop 없이 로그아웃 순회: removeItem(session-hint)·대조군 외 쓰기 0회, 13개 원문 ===", async () => {
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

    await walk(user, api, "loggedOut", (step, privacyWrites) =>
      expectUntouched(localStorage, spies, seed, "loggedOut", step, privacyWrites),
    );

    expect(privacyWritesOf(spies)).toEqual([...PRIVACY_TOGGLED]);
  });
});

/** 서버 값과 이 기기 값이 다르게 보이도록: 서버는 매물 1개·"서버 계획" */
function stubAccountApi(mode: "solo" | "household") {
  const api = createFakePlanApi({
    userId: USER_ID[mode],
    isInHousehold: mode === "household",
    plans: [makePlanP({ id: "plan-server", name: "서버 계획" })],
  });
  return api;
}

describe("AC-0 (a) 홈 [로그아웃]: 이 기기 원문은 그대로, 쓰기는 session-hint 정리뿐", () => {
  it("혼자 → [로그아웃] → 카드는 이 기기 값(매물 2개·우리 집), listings·interior-plans 원문 ===, 쓰기는 removeItem(session-hint) 2회(측정)", async () => {
    const seed = seed14("solo");
    const storage = createMemoryStorage(seed);
    const api = stubAccountApi("solo");
    api.server.respond = (call) => {
      if (call.method === "GET" && call.path === "/api/listings") {
        return jsonResponse(200, {
          listings: [makeListing({ id: "server-1", name: "서버 매물" })],
        });
      }
      if (call.path === "/api/auth/logout") {
        api.server.me = { user: null };
        return new Response(null, { status: 204 });
      }
      return undefined;
    };
    const user = userEvent.setup();
    window.location.hash = "#/";
    render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });
    const main = screen.getByRole("main");
    const logout = await within(main).findByRole("button", { name: "로그아웃" });
    await waitFor(() =>
      expect(
        within(main).getByRole("link", { name: "우리 집 인테리어" }),
      ).toHaveAccessibleDescription("서버 계획 · 지출 예정 15,300,000원"),
    );
    await waitFor(() => expect(api.queryClient.isFetching()).toBe(0));
    const spies = spyOn(storage);

    await user.click(logout);

    expect(await within(main).findByRole("link", { name: "카카오로 로그인" })).toBeInTheDocument();
    await waitFor(() => {
      expect(within(main).getByRole("link", { name: "매물 모으기" })).toHaveAccessibleDescription(
        "저장한 매물 2개",
      );
      expect(
        within(main).getByRole("link", { name: "우리 집 인테리어" }),
      ).toHaveAccessibleDescription("우리 집 · 지출 예정 15,300,000원");
    });
    await waitFor(() => expect(api.queryClient.isFetching()).toBe(0));

    expect(api.writes().map(({ method, path }) => `${method} ${path}`)).toEqual([
      "POST /api/auth/logout",
    ]);
    // 측정값(스펙 AC-0 (a) "횟수는 구현 측정 뒤 고정"): 로그아웃 성공(endSession)과 그 뒤 /api/me 재확인(로그아웃 확정)이
    // 같은 정리를 한 번씩 한다. 종류는 removeItem(session-hint) 하나뿐이다
    expect(writesOf(spies)).toEqual([
      `removeItem ${SESSION_HINT_STORAGE_KEY}`,
      `removeItem ${SESSION_HINT_STORAGE_KEY}`,
    ]);
    expect(storage.getItem(SESSION_HINT_STORAGE_KEY)).toBeNull();
    for (const key of NON_HINT_KEYS) {
      expect(storage.getItem(key) === seed[key], key).toBe(true);
    }

    // 로그아웃한 뒤 저장 목록·우리 집을 열어도 이 기기 원문은 그대로다
    await user.click(tab("매물"));
    expect(await screen.findByRole("list", { name: "저장한 매물 2개" })).toBeInTheDocument();
    await user.click(tab("우리 집"));
    expect(await screen.findByRole("button", { name: "샷시 E샷시 열기" })).toBeInTheDocument();
    // 화면마다 로그아웃 확인이 같은 정리를 할 수 있다(기존 규칙: 로그아웃 확인 뒤 removeItem(session-hint) 1종)
    expect(new Set(writesOf(spies))).toEqual(new Set([`removeItem ${SESSION_HINT_STORAGE_KEY}`]));
    for (const key of NON_HINT_KEYS) {
      expect(storage.getItem(key) === seed[key], `열어 본 뒤 ${key}`).toBe(true);
    }
  });
});

describe("AC-0 (b) 홈 [나가기]: 로컬 원문 그대로, 서버 쓰기는 나가기 1건", () => {
  it("가구 → [나가기](확인 수락) → 로컬 쓰기는 로그인 확인 결과 setItem(session-hint, 1)뿐, 서버 쓰기는 POST /api/household/leave 1건", async () => {
    // 이 기기 데이터의 이전 기록이 이미 user-b로 끝나 있다. 다른 계정 기록이면 나간 뒤 혼자가 되어 기존 규칙대로 이전을 묻는다
    // (ADR-028·029, AppRoutes.householdPlans.test). 이 갈래는 나가기 자체의 쓰기만 본다
    const seed = seed14("household", "user-b");
    const storage = createMemoryStorage(seed);
    const api = stubAccountApi("household");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    window.location.hash = "#/";
    render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });
    const main = screen.getByRole("main");
    const leave = await within(main).findByRole("button", { name: "함께 쓰기에서 나가기" });
    await waitFor(() => expect(api.queryClient.isFetching()).toBe(0));
    const spies = spyOn(storage);

    await user.click(leave);

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(await within(main).findByText("함께 쓰기에서 나왔습니다")).toBeInTheDocument();
    expect(await within(main).findByRole("button", { name: "함께 쓰기" })).toBeInTheDocument();
    await waitFor(() => expect(api.queryClient.isFetching()).toBe(0));

    expect(api.writes().map(({ method, path }) => `${method} ${path}`)).toEqual([
      "POST /api/household/leave",
    ]);
    // 나간 뒤 혼자가 되어도 이전은 이미 끝나 다시 보내지 않는다
    for (const path of IMPORT_PATHS) expect(api.callsTo("POST", path), path).toHaveLength(0);
    expect(
      writesOf(spies).filter((write) => write !== `setItem ${SESSION_HINT_STORAGE_KEY} 1`),
    ).toEqual([]);
    for (const key of NON_HINT_KEYS) {
      expect(storage.getItem(key) === seed[key], key).toBe(true);
    }
  });
});
