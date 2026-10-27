// @vitest-environment jsdom
// 스펙 interior-simple AC-0(d)(ADR-032 조건 3): 새 [우리 집] 화면은 열기만 하면 저장소에 쓰지 않는다.
// 시드: 기존 14개 키 전부, `interior-plans`는 들여쓴 JSON(옛 계획 L + 옛 P) — 앱이 다시 직렬화해 쓰면 ===에서 걸린다.
// 단계: 홈 → [우리 집] → 계획 L 목록 → 줄 시트 열었다 닫기 → [표] → CSV·인쇄 → 가리기 켜기/끄기 → [목록] → [홈] → 뒤로 가기.
// 단계마다 허용 목록 밖 setItem·removeItem·clear 0회, session-hint 외 13개 키 원문 ===(가리기 중 privacy-mode만 예외), 새 키 0개.
// 모드: 로그아웃(주입 스파이 · Storage.prototype 스파이) / 로그인 혼자(서버 GET이 L) / 가구 — 로그인·가구는 서버 쓰기 0건.
// 대조군(스파이가 살아 있음): 순회 뒤 L의 욕실나라 체크 1번 → 로컬 setItem 정확히 1회 또는 PUT 정확히 1건, 그 항목 외 값 그대로.
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
import { createFakePlanApi, type FakePlanApi } from "@/test/fakePlanApi";
import { makePlanP } from "@/test/interiorPlanFixture";
import { legacyX, makePlanL } from "@/test/interiorSimpleFixture";
import { makeListing } from "@/test/listingFixture";
import { createMemoryStorage } from "@/test/memoryStorage";

import type { InteriorItem, InteriorPlanWithItems } from "@/lib/types/interiorPlan";

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

type Mode = "loggedOut" | "solo" | "household";

const USER_ID: Record<Mode, string | null> = {
  loggedOut: null,
  solo: "user-a",
  household: "user-b",
};

const json = (value: unknown) => JSON.stringify(value, null, 2);

/** L(옛 화면에서 만든 계획, 다견적·지급·날짜·연락처) + 옛 P(지급·상태 5종·날짜·연락처). L이 먼저다 */
const seedPlans = (): InteriorPlanWithItems[] => [makePlanL(), makePlanP()];

/**
 * 14개 키 전부를 올바른 원문으로 채운다. 모두 들여쓰기라 앱이 다시 직렬화해 쓰면 ===에서 걸린다.
 * solo: 이전 4개 기록에 그 userId의 이전이 끝난 상태(계획 2개 모두). household: 다른 계정 기록만(가구는 이전을 건너뛴다).
 */
function seed14(mode: Mode): Record<string, string> {
  const owner = mode === "solo" ? "user-a" : "user-old";
  return {
    [ACCOUNT_IMPORTS_STORAGE_KEY]: json({ [owner]: ["listing-1"] }),
    [BUDGET_STORAGE_KEY]: "80000",
    [BUDGET_IMPORTS_STORAGE_KEY]: json([owner]),
    [DRAFT_STORAGE_KEY]: json({ ...DEFAULT_DRAFT, salePrice: "125000", kbPrice: "120000" }),
    [INTERIOR_PLAN_IMPORTS_STORAGE_KEY]: json({ [owner]: ["plan-l", "plan-p"] }),
    [INTERIOR_PLANS_STORAGE_KEY]: json({ plans: seedPlans() }),
    [LISTING_ORDER_STORAGE_KEY]: json(["listing-1"]),
    [LISTING_ORDER_IMPORTS_STORAGE_KEY]: json([owner]),
    [LISTINGS_STORAGE_KEY]: json([makeListing({ id: "listing-1", name: "래미안 84" })]),
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

/** 모드별로 허용되는 쓰기("메서드 키 값"). 가리기 토글은 privacy-mode에 "true"/"false"를 쓴다(기존 규칙) */
const PRIVACY_WRITES = [
  `setItem ${PRIVACY_MODE_STORAGE_KEY} true`,
  `setItem ${PRIVACY_MODE_STORAGE_KEY} false`,
];
const ALLOWED_WRITES: Record<Mode, string[]> = {
  loggedOut: [`removeItem ${SESSION_HINT_STORAGE_KEY}`, ...PRIVACY_WRITES],
  solo: [`setItem ${SESSION_HINT_STORAGE_KEY} 1`, ...PRIVACY_WRITES],
  household: [`setItem ${SESSION_HINT_STORAGE_KEY} 1`, ...PRIVACY_WRITES],
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

/** 나중 쓰기 목록에서 먼저 있던 쓰기를 하나씩 뺀 것(메서드별로 묶여 있어 순서로 자를 수 없다) */
function writesSince(before: string[], after: string[]) {
  const rest = [...before];
  return after.filter((write) => {
    const index = rest.indexOf(write);
    if (index === -1) return true;
    rest.splice(index, 1);
    return false;
  });
}

const keysOf = (storage: Storage) =>
  Array.from({ length: storage.length }, (_, index) => storage.key(index) ?? "");

type Check = (step: string, privacy?: "true" | "false") => void;

/** 체크포인트 한 번: 허용 밖 쓰기 0회, 13개 키 원문 ===(가리기 중이면 privacy-mode는 "true"), 키 집합 불변 */
function expectUntouched(
  storage: Storage,
  spies: WriteSpies,
  seed: Record<string, string>,
  mode: Mode,
  step: string,
  privacy: "true" | "false" = "false",
) {
  const allowed = new Set(ALLOWED_WRITES[mode]);
  expect(
    writesOf(spies).filter((write) => !allowed.has(write)),
    step,
  ).toEqual([]);
  const expected: Record<string, string> = { ...seed, [PRIVACY_MODE_STORAGE_KEY]: privacy };
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

function stubApi(mode: Mode) {
  return createFakePlanApi({
    userId: USER_ID[mode],
    isInHousehold: mode === "household",
    plans: mode === "loggedOut" ? [] : seedPlans(),
  });
}

type User = ReturnType<typeof userEvent.setup>;

const tab = (name: string) =>
  within(screen.getByRole("navigation", { name: "화면" })).getByRole("link", { name });

const X_Q2_CHECK = "욕실 욕실나라 확정";

/** 홈 카드 [우리 집]의 계획별 줄(L 370, 옛 P 1,530)이 그려졌다 */
async function expectHubPlanLines() {
  expect(await screen.findByRole("heading", { level: 1, name: "홈" })).toBeInTheDocument();
  await waitFor(() =>
    expect(
      within(screen.getByRole("link", { name: "우리 집 인테리어" }))
        .queryAllByText(/지출 예정/)
        .map((line) => line.textContent),
    ).toEqual(["옛 계획 · 지출 예정 370만원", "우리 집 · 지출 예정 1,530만원"]),
  );
}

/** 계획 L 목록이 다 그려졌다(지출 예정 370, 욕실나라 줄 체크 꺼짐) */
async function expectPlanLList() {
  expect(await screen.findByRole("checkbox", { name: X_Q2_CHECK })).not.toBeChecked();
  expect(screen.getByRole("checkbox", { name: "욕실 하루바스 철거·방수 확정" })).toBeChecked();
  expect(screen.getByRole("heading", { level: 1, name: "옛 계획" })).toBeInTheDocument();
}

/** 순회. 각 단계 뒤 check(step) */
async function walk(user: User, api: FakePlanApi, check: Check) {
  await expectHubPlanLines();
  await waitFor(() => expect(api.callsTo("GET", "/api/me").length).toBeGreaterThan(0));
  await waitFor(() => expect(api.queryClient.isFetching()).toBe(0));
  check("홈 첫 화면");

  await user.click(tab("우리 집"));
  expect(await screen.findByRole("heading", { name: "계획 고르기" })).toBeInTheDocument();
  check("탭 [우리 집] 계획 고르기");

  await user.click(screen.getByRole("link", { name: /옛 계획/ }));
  await waitFor(() => expect(window.location.hash).toBe("#/home/plan-l"));
  await expectPlanLList();
  check("계획 L 목록");

  await user.click(screen.getByRole("button", { name: "욕실 욕실나라 열기" }));
  const sheet = screen.getByRole("dialog", { name: "줄" });
  expect(within(sheet).getByLabelText("견적")).toHaveValue("400");
  check("줄 시트 열기");
  await user.click(within(sheet).getByRole("button", { name: "취소" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  check("줄 시트 닫기");

  await user.click(screen.getByRole("radio", { name: "표" }));
  await waitFor(() => expect(window.location.hash).toBe("#/home/plan-l?view=table"));
  expect(screen.getByRole("table", { name: "옛 계획 인테리어 계획" })).toBeInTheDocument();
  check("[표]");

  await user.click(screen.getByRole("button", { name: "CSV 내려받기" }));
  await user.click(screen.getByRole("button", { name: "인쇄·PDF" }));
  expect(download).toHaveBeenCalledTimes(1);
  expect(window.print).toHaveBeenCalledTimes(1);
  check("CSV·인쇄");

  await user.click(screen.getByRole("button", { name: "가리기" }));
  expect(screen.getByRole("button", { name: "가리기" })).toHaveAttribute("aria-pressed", "true");
  check("가리기 켜기", "true");
  await user.click(screen.getByRole("button", { name: "가리기" }));
  expect(screen.getByRole("button", { name: "가리기" })).toHaveAttribute("aria-pressed", "false");
  check("가리기 끄기");

  await user.click(screen.getByRole("radio", { name: "목록" }));
  await waitFor(() => expect(window.location.hash).toBe("#/home/plan-l"));
  await expectPlanLList();
  check("[목록]");

  await user.click(tab("홈"));
  await expectHubPlanLines();
  check("탭 [홈]");

  // 탭은 replace로 옮기므로(TabNav) 뒤로 가면 계획 L 링크를 누르기 전 자리(#/home 계획 고르기)다
  window.history.back();
  await waitFor(() => expect(window.location.hash).toBe("#/home"));
  expect(await screen.findByRole("heading", { name: "계획 고르기" })).toBeInTheDocument();
  check("뒤로 가기");

  await user.click(screen.getByRole("link", { name: /옛 계획/ }));
  await expectPlanLList();
  check("다시 계획 L");
}

/** 대조군: L의 욕실나라를 체크해 X의 확정을 q2로 옮긴 값(그 밖의 키는 그대로) */
const confirmedX = () => {
  const { id, createdAt, updatedAt, ...fields } = legacyX();
  void [id, createdAt, updatedAt];
  return { ...fields, confirmedQuoteId: "q2" };
};

/** 저장소 원문의 계획에서 X만 빼고, X는 id·시각을 뺀 값 */
function splitX(raw: string | null) {
  const { plans } = JSON.parse(raw ?? "null") as { plans: InteriorPlanWithItems[] };
  let x: InteriorItem | undefined;
  const rest = plans.map((plan) => ({
    ...plan,
    items: plan.items.filter((item) => {
      if (item.id !== "item-x") return true;
      x = item;
      return false;
    }),
  }));
  if (x === undefined) throw new Error("X 없음");
  const { id, createdAt, updatedAt, ...fields } = x;
  void [id, createdAt, updatedAt];
  return { rest, x: fields, xId: id, xCreatedAt: createdAt };
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

describe("AC-0(d) 새 우리 집을 열기만 하면 기존 14개 키는 그대로 (주입 스파이 Storage)", () => {
  it("시드는 기존 키 14개 전부이고 interior-plans는 들여쓴 JSON(L·옛 P)이다", () => {
    for (const mode of ["loggedOut", "solo", "household"] as const) {
      const seed = seed14(mode);
      expect(Object.keys(seed).toSorted()).toEqual(LEGACY_KEYS.toSorted());
      expect(Object.values(seed).every((raw) => raw.length > 0)).toBe(true);
      const raw = seed[INTERIOR_PLANS_STORAGE_KEY];
      expect(raw).not.toBe(JSON.stringify(JSON.parse(raw)));
      expect(
        (JSON.parse(raw) as { plans: InteriorPlanWithItems[] }).plans.map((plan) => plan.id),
      ).toEqual(["plan-l", "plan-p"]);
    }
  });

  it.each<[Mode, string]>([
    ["loggedOut", "로그아웃: removeItem(session-hint)·가리기(privacy-mode)만"],
    ["solo", "로그인 혼자(서버 GET이 L·옛 P): setItem(session-hint, 1)·가리기만, 서버 쓰기 0건"],
    ["household", "가구: setItem(session-hint, 1)·가리기만, 서버 쓰기 0건"],
  ])("%s — %s → 대조군 체크 1번이면 정확히 1회 쓴다", async (mode) => {
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

    await walk(user, api, (step, privacy) =>
      expectUntouched(storage, spies, seed, mode, step, privacy),
    );

    // 이전은 일어나지 않았고(이전 끝남·가구 건너뜀·로그아웃) 서버 쓰기 0건
    expect(api.callsTo("POST", "/api/interior-plans/import")).toHaveLength(0);
    expect(api.writes()).toEqual([]);
    // 스파이가 살아 있다: 허용된 쓰기는 정확히 그 종류로 일어났다
    expect(new Set(writesOf(spies))).toEqual(new Set(ALLOWED_WRITES[mode]));

    // 대조군: L의 욕실나라 체크 1번
    const before = writesOf(spies);
    await user.click(screen.getByRole("checkbox", { name: X_Q2_CHECK }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: X_Q2_CHECK })).toBeChecked());
    const newWrites = writesSince(before, writesOf(spies));
    if (mode === "loggedOut") {
      expect(newWrites).toHaveLength(1);
      expect(newWrites[0].startsWith(`setItem ${INTERIOR_PLANS_STORAGE_KEY} `)).toBe(true);
      expect(api.writes()).toEqual([]);
      const after = splitX(storage.getItem(INTERIOR_PLANS_STORAGE_KEY));
      const original = splitX(seed[INTERIOR_PLANS_STORAGE_KEY]);
      expect(after.x).toStrictEqual(confirmedX());
      expect([after.xId, after.xCreatedAt]).toEqual([original.xId, original.xCreatedAt]);
      // 그 항목 외(옛 P 전체, L의 Y·Z·계획 필드)는 값 그대로
      expect(after.rest).toStrictEqual(original.rest);
    } else {
      expect(newWrites).toEqual([]);
      expect(api.writes()).toHaveLength(1);
      expect([api.writes()[0].method, api.writes()[0].path]).toEqual([
        "PUT",
        "/api/interior-plans/plan-l/items/item-x",
      ]);
      expect((api.writes()[0].body as { item: unknown }).item).toStrictEqual(confirmedX());
      // 로컬 원문은 끝까지 그대로
      expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY) === seed[INTERIOR_PLANS_STORAGE_KEY]).toBe(
        true,
      );
    }
  });
});

describe("AC-0(d) 주입 경로를 우회하는 직접 쓰기 (jsdom localStorage + Storage.prototype 스파이)", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("storage prop 없이 로그아웃 순회: 허용 밖 쓰기 0회, 13개 원문 === → 대조군 체크 1번이면 setItem 1회", async () => {
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

    await walk(user, api, (step, privacy) =>
      expectUntouched(localStorage, spies, seed, "loggedOut", step, privacy),
    );
    expect(new Set(writesOf(spies))).toEqual(new Set(ALLOWED_WRITES.loggedOut));

    const before = writesOf(spies);
    await user.click(screen.getByRole("checkbox", { name: X_Q2_CHECK }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: X_Q2_CHECK })).toBeChecked());
    const newWrites = writesSince(before, writesOf(spies));
    expect(newWrites).toHaveLength(1);
    expect(newWrites[0].startsWith(`setItem ${INTERIOR_PLANS_STORAGE_KEY} `)).toBe(true);
    expect(splitX(localStorage.getItem(INTERIOR_PLANS_STORAGE_KEY)).x).toStrictEqual(confirmedX());
  });
});
