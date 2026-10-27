// @vitest-environment jsdom
// 스펙 platform-home AC-6·AC-7 화면: 홈 카드의 내 현황 요약 줄. AppRoutes로 그려 출처 훅(useListingSource·
// useInteriorPlanListSource)·useDraft·privacyModeStore → summarizeHub → 카드 연결을 본다.
// 요약 줄은 카드 링크의 설명(aria-describedby)이라 toHaveAccessibleDescription으로 읽는다.
// 순수 함수의 상태표·경계는 summarizeHub.test.ts가 촘촘히 본다.
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { DEFAULT_DRAFT } from "@/lib/constants/draft";
import { HOUSEHOLD_REFETCH_INTERVAL_MS } from "@/lib/constants/household";
import { ACCOUNT_IMPORTS_STORAGE_KEY } from "@/lib/utils/accountImportStorage";
import { BUDGET_IMPORTS_STORAGE_KEY } from "@/lib/utils/budgetImportStorage";
import { DRAFT_STORAGE_KEY } from "@/lib/utils/draftStorage";
import { INTERIOR_PLAN_IMPORTS_STORAGE_KEY } from "@/lib/utils/interiorPlanImportStorage";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { LISTING_ORDER_IMPORTS_STORAGE_KEY } from "@/lib/utils/listingOrderImportStorage";
import { LISTINGS_STORAGE_KEY } from "@/lib/utils/listingStorage";
import { PRIVACY_MODE_STORAGE_KEY } from "@/lib/utils/privacyModeStorage";
import { SESSION_HINT_STORAGE_KEY } from "@/lib/utils/sessionHintStorage";
import {
  createFakePlanApi,
  errorResponse,
  jsonResponse,
  PENDING,
  type PlanApiCall,
} from "@/test/fakePlanApi";
import {
  confirmSashD,
  makePlanP,
  pSash,
  pTime,
  toStoredPlans,
  withItem,
} from "@/test/interiorPlanFixture";
import { makeSimplePlanP } from "@/test/interiorSimpleFixture";
import { makeListing } from "@/test/listingFixture";
import { createMemoryStorage } from "@/test/memoryStorage";

import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";
import type { Listing } from "@/lib/types/listing";

const USER_ID = "user-a";

const INTRO = {
  calculator: "매매가와 KB시세로 예상 한도와 필요한 자기자금을 계산합니다",
  listings: "본 매물을 저장해 자기자금·추가 비용을 비교합니다",
  home: "공정별 업체 견적을 모아 확정한 금액을 예산과 비교합니다",
};

const CARD = {
  calculator: "대출 계산",
  listings: "매물 모으기",
  home: "우리 집 인테리어",
} as const;
type CardKey = keyof typeof CARD;

const listingsOf = (count: number, prefix = "local") =>
  Array.from({ length: count }, (_, index) =>
    makeListing({ id: `${prefix}-${index + 1}`, name: `${prefix} 매물 ${index + 1}` }),
  );

const draftRaw = (salePrice: string, listingId: string | null = null) =>
  JSON.stringify({ ...DEFAULT_DRAFT, salePrice, kbPrice: "120000", listingId });

/** 로그인 시드: 이 기기 데이터의 이전 4개가 이 사용자로 끝난 상태(AC-0 혼자 쓰는 계정과 같은 형태) + 로그인했던 브라우저 */
function settledImports(listingIds: string[], planIds: string[]): Record<string, string> {
  return {
    [ACCOUNT_IMPORTS_STORAGE_KEY]: JSON.stringify({ [USER_ID]: listingIds }),
    [BUDGET_IMPORTS_STORAGE_KEY]: JSON.stringify([USER_ID]),
    [LISTING_ORDER_IMPORTS_STORAGE_KEY]: JSON.stringify([USER_ID]),
    [INTERIOR_PLAN_IMPORTS_STORAGE_KEY]: JSON.stringify({ [USER_ID]: planIds }),
    [SESSION_HINT_STORAGE_KEY]: "1",
  };
}

type RenderOptions = {
  seed?: Record<string, string>;
  storage?: Storage;
  userId?: string | null;
  isInHousehold?: boolean;
  serverPlans?: InteriorPlanWithItems[];
  /** GET /api/listings 응답 목록(기본: 가짜 API의 빈 목록) */
  serverListings?: Listing[];
  respond?: (call: PlanApiCall) => Response | Promise<Response> | typeof PENDING | undefined;
};

function renderHub({
  seed = {},
  storage = createMemoryStorage(seed),
  userId = null,
  isInHousehold = false,
  serverPlans = [],
  serverListings,
  respond,
}: RenderOptions = {}) {
  const api = createFakePlanApi({ userId, isInHousehold, plans: serverPlans });
  api.server.respond = (call) => {
    const overridden = respond?.(call);
    if (overridden !== undefined) return overridden;
    if (serverListings !== undefined && call.method === "GET" && call.path === "/api/listings") {
      return jsonResponse(200, { listings: serverListings });
    }
    return undefined;
  };
  const spies = {
    setItem: vi.spyOn(storage, "setItem"),
    removeItem: vi.spyOn(storage, "removeItem"),
    clear: vi.spyOn(storage, "clear"),
  };
  window.location.hash = "#/";
  render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });
  return { api, storage, spies };
}

async function findHub() {
  expect(await screen.findByRole("heading", { level: 1, name: "홈" })).toBeInTheDocument();
  return screen.getByRole("main");
}

const card = (key: CardKey) =>
  within(screen.getByRole("main")).getByRole("link", { name: CARD[key] });

/** 카드의 요약 줄(aria-describedby가 가리키는 요소) */
function summaryOf(key: CardKey): HTMLElement {
  const id = card(key).getAttribute("aria-describedby");
  const element = id === null ? null : document.getElementById(id);
  if (element === null) throw new Error(`${CARD[key]} 카드에 요약 줄이 없다`);
  return element;
}

/** 우리 집 카드의 계획 줄(DOM 순서) */
const planLines = () =>
  within(card("home"))
    .queryAllByText(/지출 예정/)
    .map((element) => element.textContent);

async function expectDescription(key: CardKey, text: string) {
  await waitFor(() => expect(card(key)).toHaveAccessibleDescription(text));
}

async function expectPlanLines(lines: string[]) {
  await waitFor(() => expect(planLines()).toEqual(lines));
}

const isBusy = (key: CardKey) => summaryOf(key).getAttribute("aria-busy") === "true";

/** 원하는 순간에 응답하는 /api/me */
function deferredMe(user: { id: string; household: null } | null) {
  let open: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  return {
    respond: (call: PlanApiCall) =>
      call.method === "GET" && call.path === "/api/me"
        ? gate.then(() => jsonResponse(200, { user }))
        : undefined,
    resolve: () => act(async () => open()),
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("AC-6 내 현황 요약 (로그아웃, 이 기기 데이터)", () => {
  it("매물 3개 + 옛 계획 P + draft 125000 → 작성 중 · 매매가 12억 5,000만원 / 저장한 매물 3개 / 우리 집 · 지출 예정 1,530만원", async () => {
    renderHub({
      seed: {
        [LISTINGS_STORAGE_KEY]: JSON.stringify(listingsOf(3)),
        [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans([makePlanP()]),
        [DRAFT_STORAGE_KEY]: draftRaw("125000"),
      },
    });
    const hub = await findHub();

    await expectDescription("listings", "저장한 매물 3개");
    await expectDescription("calculator", "작성 중 · 매매가 12억 5,000만원");
    // "우리 집"은 탭 이름과 겹치므로 카드 안으로 좁힌다
    expect(within(card("home")).getByText("우리 집 · 지출 예정 15,300,000원")).toBeInTheDocument();
    expect(planLines()).toEqual(["우리 집 · 지출 예정 15,300,000원"]);
    expect(card("home")).toHaveAccessibleDescription("우리 집 · 지출 예정 15,300,000원");
    // 링크 이름은 제목 그대로(요약은 설명으로만 읽힌다)
    expect(card("listings")).toHaveAccessibleName("매물 모으기");
    expect(hub.querySelector('[aria-busy="true"]')).toBeNull();
    // 규제값으로 계산한 수치(한도·LTV·자기자금)는 홈에 없다. draft에 KB시세까지 있어도 매매가만 보인다
    expect(hub.textContent).not.toMatch(/LTV|%/);
    expect(hub.textContent).not.toMatch(/(한도|자기자금)\D{0,12}\d/);
  });

  it("샷시 확정을 E→D(confirmSashD)로 바꾼 옛 P → 지출 예정 14,300,000원(summarizeInteriorPlan 그대로)", async () => {
    renderHub({
      seed: {
        [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans([
          withItem(makePlanP(), "item-sash", confirmSashD),
        ]),
      },
    });
    await findHub();
    await expectPlanLines(["우리 집 · 지출 예정 14,300,000원"]);
  });

  it("예시 P(새 화면) → 우리 집 · 지출 예정 8,000,000원, 지출 예정 10,000 → 100,000,000원", async () => {
    const tenThousand = makeSimplePlanP({
      id: "plan-big",
      name: "큰 계획",
      items: [
        { ...makeSimplePlanP().items[0], quotes: [{ id: "rq1", vendor: "육문수", amount: 10000 }] },
      ],
    });
    renderHub({
      seed: { [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans([makeSimplePlanP(), tenThousand]) },
    });
    await findHub();
    await expectPlanLines(["우리 집 · 지출 예정 8,000,000원", "큰 계획 · 지출 예정 100,000,000원"]);
  });

  it("계획 3개는 목록(저장) 순서 그대로 3줄이고 표기 경계 12500 → 125,000,000원, 0 → 0원", async () => {
    const bigPlan = makePlanP({
      id: "plan-c",
      name: "다 계획",
      createdAt: pTime(5),
      items: [
        { ...pSash(), quotes: [{ id: "q-e", vendor: "E샷시", amount: 12500 }], payments: [] },
      ],
    });
    const plans = [
      bigPlan,
      withItem(
        makePlanP({ id: "plan-a", name: "가 계획", createdAt: pTime(1) }),
        "item-sash",
        confirmSashD,
      ),
      makePlanP({ id: "plan-b", name: "나 계획", createdAt: pTime(9), items: [] }),
    ];
    renderHub({ seed: { [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans(plans) } });
    await findHub();
    await expectPlanLines([
      "다 계획 · 지출 예정 125,000,000원",
      "가 계획 · 지출 예정 14,300,000원",
      "나 계획 · 지출 예정 0원",
    ]);
  });

  it("0개: 매물 0개·계획 0개·draft 빈 값이면 세 카드 모두 소개 문구 / 매물 1개는 저장한 매물 1개", async () => {
    renderHub({
      seed: {
        [LISTINGS_STORAGE_KEY]: JSON.stringify([]),
        [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans([]),
        [DRAFT_STORAGE_KEY]: draftRaw(""),
      },
    });
    await findHub();
    await waitFor(() =>
      expect(screen.getByRole("main").querySelector('[aria-busy="true"]')).toBeNull(),
    );
    expect(card("calculator")).toHaveAccessibleDescription(INTRO.calculator);
    expect(card("listings")).toHaveAccessibleDescription(INTRO.listings);
    expect(card("home")).toHaveAccessibleDescription(INTRO.home);
  });

  it("매물 1개 → 저장한 매물 1개", async () => {
    renderHub({ seed: { [LISTINGS_STORAGE_KEY]: JSON.stringify(listingsOf(1)) } });
    await findHub();
    await expectDescription("listings", "저장한 매물 1개");
  });

  it.each<[string, string]>([
    ["125000", "작성 중 · 매매가 12억 5,000만원"],
    ["1", "작성 중 · 매매가 1만원"],
    ["10000", "작성 중 · 매매가 1억원"],
    ["125,000", "작성 중 · 매매가 12억 5,000만원"],
    [" 125000 ", "작성 중 · 매매가 12억 5,000만원"],
    ["999999999", "작성 중 · 매매가 99,999억 9,999만원"],
    ["0", INTRO.calculator],
    ["12.5", INTRO.calculator],
    ["12a", INTRO.calculator],
    ["", INTRO.calculator],
    ["1000000000", INTRO.calculator],
  ])("금액 경계표: draft.salePrice %j → %s", async (salePrice, expected) => {
    renderHub({ seed: { [DRAFT_STORAGE_KEY]: draftRaw(salePrice) } });
    await findHub();
    await waitFor(() =>
      expect(screen.getByRole("main").querySelector('[aria-busy="true"]')).toBeNull(),
    );
    expect(card("calculator")).toHaveAccessibleDescription(expected);
  });

  it("listingId가 붙은 draft(저장한 매물을 수정 중)도 작성 중으로 보인다", async () => {
    renderHub({
      seed: {
        [LISTINGS_STORAGE_KEY]: JSON.stringify([
          makeListing({ id: "listing-r", salePrice: 98000 }),
        ]),
        [DRAFT_STORAGE_KEY]: draftRaw("98000", "listing-r"),
      },
    });
    await findHub();
    await expectDescription("calculator", "작성 중 · 매매가 9억 8,000만원");
    await expectDescription("listings", "저장한 매물 1개");
  });
});

describe("AC-6 가리기(privacy-mode 읽기만)", () => {
  const seed = {
    [LISTINGS_STORAGE_KEY]: JSON.stringify(listingsOf(3)),
    [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans([makePlanP()]),
    [DRAFT_STORAGE_KEY]: draftRaw("125000"),
    [PRIVACY_MODE_STORAGE_KEY]: "true",
  };

  it("계산 카드 매매가는 •••·가려짐이고 innerHTML에 12억이 없다. 우리 집 줄·3개는 보인다(U6). 저장소에 쓰지 않는다", async () => {
    const { spies } = renderHub({ seed });
    const hub = await findHub();
    // 요약이 그려진 뒤(개수는 가리지 않는다)에 본다. 로딩 중이면 금액이 없어 거짓 통과한다
    await expectDescription("listings", "저장한 매물 3개");
    await waitFor(() =>
      expect(within(card("home")).getByText(/우리 집 · 지출 예정/)).toBeInTheDocument(),
    );

    expect(hub.innerHTML).not.toContain("12억");
    expect(hub.innerHTML).not.toContain("125,000");
    expect(summaryOf("calculator").textContent).toBe("작성 중 · 매매가 •••가려짐");
    expect(summaryOf("home").textContent).toBe("우리 집 · 지출 예정 15,300,000원");
    expect(within(card("calculator")).getByText("•••")).toHaveAttribute("aria-hidden", "true");
    expect(within(card("home")).queryByText("가려짐")).not.toBeInTheDocument();
    // 홈에는 가리기 토글이 없다(U11)
    expect(within(hub).queryAllByRole("button")).toEqual([]);
    // 가리기 원문은 읽기만(로그아웃 확인 뒤 session-hint 정리 외 쓰기 없음)
    expect(spies.setItem).not.toHaveBeenCalled();
    expect(spies.clear).not.toHaveBeenCalled();
    expect(spies.removeItem.mock.calls.filter(([key]) => key !== SESSION_HINT_STORAGE_KEY)).toEqual(
      [],
    );
  });

  it("가리기를 켠 채 로딩(/api/me 응답 전)이어도 불러오는 중 문구는 그대로 보인다", async () => {
    renderHub({
      seed: { ...seed, [SESSION_HINT_STORAGE_KEY]: "1" },
      respond: (call) => (call.path === "/api/me" ? PENDING : undefined),
    });
    await findHub();
    expect(card("listings")).toHaveAccessibleDescription("불러오는 중");
    expect(card("home")).toHaveAccessibleDescription("불러오는 중");
  });

  it("가리기를 켠 채 실패(/api/me 500 + session-hint)여도 불러오지 못했습니다 문구는 그대로 보인다", async () => {
    renderHub({
      seed: { ...seed, [SESSION_HINT_STORAGE_KEY]: "1" },
      respond: (call) => (call.path === "/api/me" ? errorResponse(500, "internal") : undefined),
    });
    await findHub();
    await expectDescription("listings", "불러오지 못했습니다");
    await expectDescription("home", "불러오지 못했습니다");
  });
});

describe("AC-7 카드별 상태 (화면)", () => {
  const localSeed = {
    [LISTINGS_STORAGE_KEY]: JSON.stringify(listingsOf(5)),
    [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans([
      makePlanP({ id: "local-plan", name: "기기 계획" }),
    ]),
    [DRAFT_STORAGE_KEY]: draftRaw("125000"),
  };
  /** 로그인 이전 끝남(로컬 매물 5개·계획 1개는 이미 옮긴 기록) */
  const loggedInSeed = {
    ...localSeed,
    ...settledImports(
      listingsOf(5).map((listing) => listing.id),
      ["local-plan"],
    ),
  };
  const serverPlan = () => makePlanP({ id: "plan-s", name: "서버 계획" });
  const SERVER_LINE = "서버 계획 · 지출 예정 15,300,000원";
  const LOCAL_LINE = "기기 계획 · 지출 예정 15,300,000원";

  it("행 1: 로그아웃, 모두 정상 → 로컬 개수·로컬 계획 줄·작성 중", async () => {
    renderHub({ seed: localSeed });
    await findHub();
    await expectDescription("listings", "저장한 매물 5개");
    await expectPlanLines([LOCAL_LINE]);
    expect(card("calculator")).toHaveAccessibleDescription("작성 중 · 매매가 12억 5,000만원");
  });

  it('행 2·(e): listings 원문 "{" → 매물 카드만 저장 데이터를 확인해 주세요, 초기화 버튼 없음, 원문 그대로', async () => {
    const { storage, spies } = renderHub({ seed: { ...localSeed, [LISTINGS_STORAGE_KEY]: "{" } });
    const hub = await findHub();
    await expectDescription("listings", "저장 데이터를 확인해 주세요");
    await expectPlanLines([LOCAL_LINE]);
    expect(card("calculator")).toHaveAccessibleDescription("작성 중 · 매매가 12억 5,000만원");
    expect(within(hub).queryAllByRole("button")).toEqual([]);
    expect(storage.getItem(LISTINGS_STORAGE_KEY)).toBe("{");
    expect(spies.setItem).not.toHaveBeenCalled();
    expect(spies.clear).not.toHaveBeenCalled();
    expect(spies.removeItem.mock.calls.filter(([key]) => key !== SESSION_HINT_STORAGE_KEY)).toEqual(
      [],
    );
    // 링크는 동작한다
    expect(card("listings")).toHaveAttribute("href", "#/listings");
  });

  it("행 3: interior-plans 원문 깨짐 → 우리 집 카드만 저장 데이터를 확인해 주세요, 원문 그대로", async () => {
    const { storage } = renderHub({
      seed: { ...localSeed, [INTERIOR_PLANS_STORAGE_KEY]: '{"plans":' },
    });
    const hub = await findHub();
    await expectDescription("home", "저장 데이터를 확인해 주세요");
    await expectDescription("listings", "저장한 매물 5개");
    expect(card("calculator")).toHaveAccessibleDescription("작성 중 · 매매가 12억 5,000만원");
    expect(within(hub).queryAllByRole("button")).toEqual([]);
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe('{"plans":');
  });

  it("행 4·(a)·(b) 로딩 플래시: /api/me 응답 전에는 로컬 5개·기기 계획이 DOM에 없고 불러오는 중(aria-busy), 응답 뒤에야 서버 2개", async () => {
    const me = deferredMe({ id: USER_ID, household: null });
    const seen: string[] = [];
    const observer = new MutationObserver(() => {
      seen.push(document.body.textContent ?? "");
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    const { api } = renderHub({
      seed: loggedInSeed,
      userId: USER_ID,
      serverPlans: [serverPlan()],
      serverListings: listingsOf(2, "server"),
      respond: me.respond,
    });
    const hub = await findHub();
    await waitFor(() => expect(api.callsTo("GET", "/api/me").length).toBeGreaterThan(0));

    // 첫 렌더 직후: 로컬 값이 없다
    expect(hub.textContent).not.toContain("5개");
    expect(hub.textContent).not.toContain("기기 계획");
    expect(card("listings")).toHaveAccessibleDescription("불러오는 중");
    expect(card("home")).toHaveAccessibleDescription("불러오는 중");
    expect(isBusy("listings")).toBe(true);
    expect(isBusy("home")).toBe(true);
    // 대출 계산 카드는 로컬 draft 그대로(로딩 아님)
    expect(card("calculator")).toHaveAccessibleDescription("작성 중 · 매매가 12억 5,000만원");
    expect(isBusy("calculator")).toBe(false);
    // 카드 링크는 로딩 중에도 주소를 갖는다
    expect(card("listings")).toHaveAttribute("href", "#/listings");
    expect(card("home")).toHaveAttribute("href", "#/home");

    await me.resolve();
    await expectDescription("listings", "저장한 매물 2개");
    await expectPlanLines([SERVER_LINE]);
    expect(hub.querySelector('[aria-busy="true"]')).toBeNull();
    observer.disconnect();

    // 응답 전·중간 어느 순간에도 로컬 값을 그렸다 바꾸지 않았다
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.filter((text) => text.includes("저장한 매물 5개"))).toEqual([]);
    expect(seen.filter((text) => text.includes("기기 계획"))).toEqual([]);
    // 로그인 이전은 끝난 상태라 일어나지 않았다
    expect(api.writes()).toEqual([]);
  });

  it("행 4: 로딩 중에도 카드 링크는 동작한다([매물 모으기] → #/listings, push)", async () => {
    const user = userEvent.setup();
    renderHub({
      seed: loggedInSeed,
      userId: USER_ID,
      respond: (call) => (call.path === "/api/me" ? PENDING : undefined),
    });
    await findHub();
    expect(isBusy("listings")).toBe(true);
    const historyLength = window.history.length;
    await user.click(card("listings"));
    await waitFor(() => expect(window.location.hash).toBe("#/listings"));
    expect(window.history.length).toBe(historyLength + 1);
  });

  it("행 5: 로그인, 매물 이전 중(계획 이전 끝) → 매물 카드 불러오는 중, 우리 집 카드 서버 계획 요약", async () => {
    const { api } = renderHub({
      // 매물 이전 기록이 없어 로그인 직후 이전이 시작된다(응답을 막아 둔다). 계획 이전은 끝난 기록
      seed: {
        ...localSeed,
        [SESSION_HINT_STORAGE_KEY]: "1",
        [INTERIOR_PLAN_IMPORTS_STORAGE_KEY]: JSON.stringify({ [USER_ID]: ["local-plan"] }),
      },
      userId: USER_ID,
      serverPlans: [serverPlan()],
      serverListings: listingsOf(2, "server"),
      respond: (call) => (call.path === "/api/listings/import" ? PENDING : undefined),
    });
    await findHub();
    await expectPlanLines([SERVER_LINE]);
    await waitFor(() => expect(api.callsTo("POST", "/api/listings/import")).toHaveLength(1));
    expect(card("listings")).toHaveAccessibleDescription("불러오는 중");
    expect(isBusy("listings")).toBe(true);
    expect(screen.getByRole("main").textContent).not.toContain("5개");
    expect(card("calculator")).toHaveAccessibleDescription("작성 중 · 매매가 12억 5,000만원");
  });

  it("행 6: 로그인, /api/listings 500 → 매물 카드만 불러오지 못했습니다, 우리 집은 서버 계획 요약", async () => {
    renderHub({
      seed: loggedInSeed,
      userId: USER_ID,
      serverPlans: [serverPlan()],
      respond: (call) =>
        call.method === "GET" && call.path === "/api/listings"
          ? errorResponse(500, "internal")
          : undefined,
    });
    await findHub();
    await expectDescription("listings", "불러오지 못했습니다");
    await expectPlanLines([SERVER_LINE]);
    expect(card("calculator")).toHaveAccessibleDescription("작성 중 · 매매가 12억 5,000만원");
    expect(screen.getByRole("main").textContent).not.toContain("5개");
  });

  it("행 7: 로그인, /api/interior-plans 500 → 우리 집 카드만 불러오지 못했습니다, 매물은 서버 개수", async () => {
    renderHub({
      seed: loggedInSeed,
      userId: USER_ID,
      serverListings: listingsOf(2, "server"),
      respond: (call) =>
        call.method === "GET" && call.path === "/api/interior-plans"
          ? errorResponse(500, "internal")
          : undefined,
    });
    await findHub();
    await expectDescription("home", "불러오지 못했습니다");
    await expectDescription("listings", "저장한 매물 2개");
    expect(card("calculator")).toHaveAccessibleDescription("작성 중 · 매매가 12억 5,000만원");
    expect(screen.getByRole("main").textContent).not.toContain("기기 계획");
  });

  it("행 8: /api/me 실패 + session-hint 있음 → 두 카드 불러오지 못했습니다, 로컬 값 없음", async () => {
    renderHub({
      seed: { ...localSeed, [SESSION_HINT_STORAGE_KEY]: "1" },
      userId: USER_ID,
      respond: (call) => (call.path === "/api/me" ? errorResponse(500, "internal") : undefined),
    });
    const hub = await findHub();
    await expectDescription("listings", "불러오지 못했습니다");
    await expectDescription("home", "불러오지 못했습니다");
    expect(card("calculator")).toHaveAccessibleDescription("작성 중 · 매매가 12억 5,000만원");
    expect(hub.textContent).not.toContain("5개");
    expect(hub.textContent).not.toContain("기기 계획");
  });

  it("행 9: /api/me 실패 + session-hint 없음 → 로컬 개수·로컬 계획 요약(기존 selectAccountSourceStatus)", async () => {
    renderHub({
      seed: localSeed,
      userId: USER_ID,
      respond: (call) => (call.path === "/api/me" ? errorResponse(500, "internal") : undefined),
    });
    await findHub();
    await expectDescription("listings", "저장한 매물 5개");
    await expectPlanLines([LOCAL_LINE]);
    expect(card("calculator")).toHaveAccessibleDescription("작성 중 · 매매가 12억 5,000만원");
  });

  it("행 10: 가구, 서버 매물 4개 → 함께 쓰는 목록 · 매물 4개, 가구 계획(응답 순서 그대로)", async () => {
    renderHub({
      seed: { ...localSeed, [SESSION_HINT_STORAGE_KEY]: "1" },
      userId: USER_ID,
      isInHousehold: true,
      serverListings: listingsOf(4, "server"),
      serverPlans: [
        makePlanP({ id: "plan-z", name: "B 계획", createdAt: pTime(9) }),
        withItem(
          makePlanP({ id: "plan-y", name: "A 계획", createdAt: pTime(1) }),
          "item-sash",
          confirmSashD,
        ),
      ],
    });
    await findHub();
    await expectDescription("listings", "함께 쓰는 목록 · 매물 4개");
    await expectPlanLines(["B 계획 · 지출 예정 15,300,000원", "A 계획 · 지출 예정 14,300,000원"]);
    expect(card("calculator")).toHaveAccessibleDescription("작성 중 · 매매가 12억 5,000만원");
  });

  it("행 10·(a): 가구 매물 0개 → 함께 쓰는 목록 · 매물 0개(소개 문구가 아님)", async () => {
    renderHub({
      seed: { ...localSeed, [SESSION_HINT_STORAGE_KEY]: "1" },
      userId: USER_ID,
      isInHousehold: true,
      serverListings: [],
    });
    await findHub();
    await expectDescription("listings", "함께 쓰는 목록 · 매물 0개");
  });

  it("행 10 대조: 혼자 쓰는 로그인 서버 매물 0개·계획 0개 → 소개 문구(로컬 5개를 세지 않는다)", async () => {
    renderHub({ seed: loggedInSeed, userId: USER_ID, serverListings: [], serverPlans: [] });
    const hub = await findHub();
    await waitFor(() => expect(hub.querySelector('[aria-busy="true"]')).toBeNull());
    await expectDescription("listings", INTRO.listings);
    await expectDescription("home", INTRO.home);
    expect(hub.textContent).not.toContain("5개");
  });

  it("행 11: 저장소 접근 불가 Storage → 세 카드 모두 소개", async () => {
    const storage = createMemoryStorage();
    vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    renderHub({ storage });
    const hub = await findHub();
    await waitFor(() => expect(hub.querySelector('[aria-busy="true"]')).toBeNull());
    expect(card("calculator")).toHaveAccessibleDescription(INTRO.calculator);
    expect(card("listings")).toHaveAccessibleDescription(INTRO.listings);
    expect(card("home")).toHaveAccessibleDescription(INTRO.home);
  });

  describe("(c) 재조회 실패·세션 만료(401)", () => {
    async function loggedInSettled(respond: RenderOptions["respond"]) {
      const ctx = renderHub({
        seed: loggedInSeed,
        userId: USER_ID,
        serverPlans: [serverPlan()],
        serverListings: listingsOf(2, "server"),
        respond,
      });
      await findHub();
      await expectDescription("listings", "저장한 매물 2개");
      await expectPlanLines([SERVER_LINE]);
      await waitFor(() => expect(ctx.api.queryClient.isFetching()).toBe(0));
      return ctx;
    }

    /** 창으로 돌아옴(react-query 포커스 재조회) */
    const refocus = () =>
      act(() => {
        window.dispatchEvent(new Event("visibilitychange"));
      });

    it("받아 둔 목록이 있는데 재조회가 500 → 받아 둔 값 유지, 오류 문구 없음", async () => {
      let isFailing = false;
      const { api } = await loggedInSettled((call) =>
        isFailing && call.method === "GET" && call.path !== "/api/me"
          ? errorResponse(500, "internal")
          : undefined,
      );
      const listingGets = api.callsTo("GET", "/api/listings").length;
      const planGets = api.callsTo("GET", "/api/interior-plans").length;
      isFailing = true;
      refocus();
      await waitFor(() => expect(api.callsTo("GET", "/api/listings").length).toBe(listingGets + 1));
      await waitFor(() =>
        expect(api.callsTo("GET", "/api/interior-plans").length).toBe(planGets + 1),
      );
      await waitFor(() => expect(api.queryClient.isFetching()).toBe(0));
      // 재조회 실패가 실제로 기록됐다(받아 둔 데이터 + 오류)
      expect(api.queryClient.getQueryState(["listing", "list"])?.status).toBe("error");

      const hub = screen.getByRole("main");
      expect(card("listings")).toHaveAccessibleDescription("저장한 매물 2개");
      expect(planLines()).toEqual([SERVER_LINE]);
      expect(hub.textContent).not.toContain("불러오지 못했습니다");
      expect(hub.querySelector('[aria-busy="true"]')).toBeNull();
    });

    it("받아 둔 목록 없이 첫 조회가 실패 → error(행 6·7과 같음)", async () => {
      renderHub({
        seed: loggedInSeed,
        userId: USER_ID,
        respond: (call) =>
          call.method === "GET" && call.path !== "/api/me"
            ? errorResponse(500, "internal")
            : undefined,
      });
      await findHub();
      await expectDescription("listings", "불러오지 못했습니다");
      await expectDescription("home", "불러오지 못했습니다");
    });

    it("재조회가 401(세션 만료) → 로그아웃 상태가 되어 이 기기 값(저장 목록·우리 집 화면과 같음), 오류 문구 없음, 서버 값은 남지 않음", async () => {
      let isExpired = false;
      const { api, storage } = await loggedInSettled((call) =>
        isExpired && call.method === "GET" && call.path === "/api/listings"
          ? errorResponse(401, "unauthorized")
          : undefined,
      );
      isExpired = true;
      refocus();
      await waitFor(() => expect(storage.getItem(SESSION_HINT_STORAGE_KEY)).toBeNull());

      await expectDescription("listings", "저장한 매물 5개");
      await expectPlanLines([LOCAL_LINE]);
      const hub = screen.getByRole("main");
      expect(hub.textContent).not.toContain("불러오지 못했습니다");
      expect(hub.textContent).not.toContain("저장한 매물 2개");
      expect(hub.textContent).not.toContain("서버 계획");
      expect(api.writes()).toEqual([]);
    });
  });

  describe("(d) 가구 계획 조회는 홈에 있는 동안 30초 폴링", () => {
    it("가구: 30초 뒤 두 번째 GET /api/interior-plans, 60초 뒤 세 번째", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const { api } = renderHub({
        seed: { ...localSeed, [SESSION_HINT_STORAGE_KEY]: "1" },
        userId: USER_ID,
        isInHousehold: true,
        serverPlans: [makePlanP({ id: "plan-pa", name: "A 계획" })],
      });
      await findHub();
      await expectPlanLines(["A 계획 · 지출 예정 15,300,000원"]);
      const planGets = () => api.callsTo("GET", "/api/interior-plans").length;
      expect(planGets()).toBe(1);

      await act(() => vi.advanceTimersByTimeAsync(HOUSEHOLD_REFETCH_INTERVAL_MS));
      await waitFor(() => expect(planGets()).toBe(2));
      await act(() => vi.advanceTimersByTimeAsync(HOUSEHOLD_REFETCH_INTERVAL_MS));
      await waitFor(() => expect(planGets()).toBe(3));
      expect(window.location.hash).toBe("#/");
    });

    it("혼자: 30초·90초가 지나도 계획 GET 추가 0건", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const { api } = renderHub({
        seed: loggedInSeed,
        userId: USER_ID,
        serverPlans: [serverPlan()],
      });
      await findHub();
      await expectPlanLines([SERVER_LINE]);
      const planGets = () => api.callsTo("GET", "/api/interior-plans").length;
      expect(planGets()).toBe(1);
      await act(() => vi.advanceTimersByTimeAsync(HOUSEHOLD_REFETCH_INTERVAL_MS + 1000));
      await act(() => vi.advanceTimersByTimeAsync(HOUSEHOLD_REFETCH_INTERVAL_MS * 2));
      expect(planGets()).toBe(1);
    });
  });
});
