// @vitest-environment jsdom
// qa 보강(스펙 hub-account AC-1·AC-2·AC-3·AC-4, ADR-035 조건 5): fe 테스트가 비워 둔 경계.
// - 결과 줄 수명: 새 동작(로그아웃·나가기·계정 [다시 시도]·이전 [다시 시도])을 시작하면 이전 결과를 지운다. 결과 줄은 동시에 하나,
//   결과 줄 → 상태 줄 순서. 메모리 상태라 다른 탭을 다녀오면 없다.
// - 나가기 실패 → 재시도 성공이면 실패 줄 대신 성공 줄 하나.
// - 계정 확인: 500 + session-hint 없음은 로그아웃 모양([다시 시도] 없음), [다시 시도]가 로그아웃으로 확정되면 로그인 안내.
// - 가구에서 [로그아웃]: 둘째 줄이 사라지고 카드는 이 기기 값.
// - 저장 목록 머리: 로그인 혼자·가구에서도 매물이 있으면 [가리기](U7 설명)·[목록 공유]만.
// - `#/?login=failed&a=1`·중복 login: 안내 한 번, 주소 #/, 다시 열면 안내 없음(결함 D1, `useHashRoute`가 화면이 바꾼 주소를 되돌리지 않게 고침).
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { listingListQueryKey } from "@/hooks/useListingList";
import { ACCOUNT_IMPORTS_STORAGE_KEY } from "@/lib/utils/accountImportStorage";
import { BUDGET_IMPORTS_STORAGE_KEY } from "@/lib/utils/budgetImportStorage";
import { INTERIOR_PLAN_IMPORTS_STORAGE_KEY } from "@/lib/utils/interiorPlanImportStorage";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { LISTING_ORDER_IMPORTS_STORAGE_KEY } from "@/lib/utils/listingOrderImportStorage";
import { LISTINGS_STORAGE_KEY } from "@/lib/utils/listingStorage";
import { SESSION_HINT_STORAGE_KEY } from "@/lib/utils/sessionHintStorage";
import {
  createFakePlanApi,
  errorResponse,
  jsonResponse,
  PENDING,
  type PlanApiCall,
} from "@/test/fakePlanApi";
import { makePlanP, toStoredPlans } from "@/test/interiorPlanFixture";
import { makeListing } from "@/test/listingFixture";
import { createMemoryStorage } from "@/test/memoryStorage";

const USER_ID = "user-a";
const LOGIN = "카카오로 로그인";
const LOGOUT_PATH = "/api/auth/logout";
const LEAVE_PATH = "/api/household/leave";
const LEAVE_NAME = "함께 쓰기에서 나가기";
const LEFT = "함께 쓰기에서 나왔습니다";
const LEAVE_FAILED = "함께 쓰기에서 나가지 못했습니다. 연결을 확인하고 다시 시도해 주세요";
const LOGOUT_FAILED = "로그아웃하지 못했습니다. 연결을 확인하고 다시 시도해 주세요";
const SESSION_EXPIRED = "로그인이 끝났습니다. 다시 로그인해 주세요";
const ACCOUNT_ERROR = "계정 상태를 확인하지 못했습니다";
const LOGIN_CANCELLED = "로그인을 취소했습니다";
const LOGIN_FAILED = "로그인하지 못했습니다. 다시 시도해 주세요";

const LOCAL_SEED = {
  [LISTINGS_STORAGE_KEY]: JSON.stringify([
    makeListing({ id: "listing-1", name: "래미안 84" }),
    makeListing({ id: "listing-2", name: "자이 59" }),
  ]),
  [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans([makePlanP()]),
};

/** 이 기기 데이터 이전이 이 사용자로 끝난 로그인 브라우저 */
const LOGGED_IN_SEED = {
  ...LOCAL_SEED,
  [ACCOUNT_IMPORTS_STORAGE_KEY]: JSON.stringify({ [USER_ID]: ["listing-1", "listing-2"] }),
  [BUDGET_IMPORTS_STORAGE_KEY]: JSON.stringify([USER_ID]),
  [LISTING_ORDER_IMPORTS_STORAGE_KEY]: JSON.stringify([USER_ID]),
  [INTERIOR_PLAN_IMPORTS_STORAGE_KEY]: JSON.stringify({ [USER_ID]: ["plan-p"] }),
  [SESSION_HINT_STORAGE_KEY]: "1",
};

type Respond = (call: PlanApiCall) => Response | Promise<Response> | typeof PENDING | undefined;

function renderApp({
  seed = LOGGED_IN_SEED,
  hash = "#/",
  isLoggedIn = true,
  isInHousehold = false,
  respond,
  isStrict = false,
}: {
  seed?: Record<string, string>;
  hash?: string;
  isLoggedIn?: boolean;
  isInHousehold?: boolean;
  respond?: Respond;
  isStrict?: boolean;
} = {}) {
  const storage = createMemoryStorage(seed);
  const api = createFakePlanApi({
    userId: isLoggedIn ? USER_ID : null,
    isInHousehold,
    plans: isLoggedIn ? [makePlanP({ id: "plan-server", name: "서버 계획" })] : [],
  });
  api.server.respond = respond;
  window.location.hash = hash;
  const historyLength = window.history.length;
  const app = <AppRoutes storage={storage} />;
  render(isStrict ? <StrictMode>{app}</StrictMode> : app, { wrapper: api.wrapper });
  return { api, storage, historyLength };
}

async function findHub() {
  expect(await screen.findByRole("heading", { level: 1, name: "홈" })).toBeInTheDocument();
  return screen.getByRole("main");
}

/** 확인 중 자리표시자가 아니라 확정된 버튼 */
async function findLiveButton(name: string) {
  const hub = await findHub();
  const button = await within(hub).findByRole("button", { name });
  expect(button.closest("[inert]")).toBeNull();
  return button;
}

function deferred() {
  let resolve: (response: Response) => void = () => {};
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const noContent = () => new Response(null, { status: 204 });

const tab = (name: string) =>
  within(screen.getByRole("navigation", { name: "화면" })).getByRole("link", { name });

/** 홈 안내 줄 중 포커스를 받는 줄(결과 줄·상태 줄, tabIndex=-1)의 글자 순서 */
const noticeLines = (hub: HTMLElement) =>
  Array.from(hub.querySelectorAll("p[tabindex='-1']"), (line) => line.textContent);

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("홈 결과 줄 수명 (AC-1, A8)", () => {
  it("나가기 결과가 보이다가 [로그아웃]을 시작하면 지운다(응답 전)", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const pendingLogout = deferred();
    const { api } = renderApp({
      isInHousehold: true,
      respond: (call) => {
        if (call.path === LEAVE_PATH) api.server.me = { user: { id: USER_ID, household: null } };
        if (call.path === LOGOUT_PATH) return pendingLogout.promise;
        return undefined;
      },
    });
    await user.click(await findLiveButton(LEAVE_NAME));
    const hub = screen.getByRole("main");
    expect(await within(hub).findByText(LEFT)).toBeInTheDocument();

    await user.click(await findLiveButton("로그아웃"));

    expect(within(hub).queryByText(LEFT)).toBeNull();
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeDisabled();
    pendingLogout.resolve(noContent());
    expect(await within(hub).findByRole("link", { name: LOGIN })).toBeInTheDocument();
    expect(within(hub).queryByText(LEFT)).toBeNull();
  });

  it("나가기 실패 → 다시 눌러 성공하면 실패 줄은 없고 성공 줄 하나만 남는다", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    let attempt = 0;
    const { api } = renderApp({
      isInHousehold: true,
      respond: (call) => {
        if (call.path !== LEAVE_PATH) return undefined;
        attempt += 1;
        if (attempt === 1) return errorResponse(500, "internal");
        api.server.me = { user: { id: USER_ID, household: null } };
        return noContent();
      },
    });
    const leave = await findLiveButton(LEAVE_NAME);
    const hub = screen.getByRole("main");
    await user.click(leave);
    expect(await within(hub).findByText(LEAVE_FAILED)).toBeInTheDocument();

    await user.click(leave);

    const left = await within(hub).findByText(LEFT);
    expect(within(hub).queryByText(LEAVE_FAILED)).toBeNull();
    expect(noticeLines(hub)).toEqual([LEFT]);
    expect(left).toHaveFocus();
  });

  it("결과 줄은 동시에 하나: 나가기 실패 뒤 [로그아웃]도 실패하면 로그아웃 실패 줄 하나", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderApp({
      isInHousehold: true,
      respond: (call) =>
        call.path === LEAVE_PATH || call.path === LOGOUT_PATH
          ? errorResponse(500, "internal")
          : undefined,
    });
    await user.click(await findLiveButton(LEAVE_NAME));
    const hub = screen.getByRole("main");
    expect(await within(hub).findByText(LEAVE_FAILED)).toBeInTheDocument();

    await user.click(await findLiveButton("로그아웃"));

    expect(await within(hub).findByText(LOGOUT_FAILED)).toBeInTheDocument();
    expect(noticeLines(hub)).toEqual([LOGOUT_FAILED]);
  });

  it("계정 확인 [다시 시도]를 시작하면 이전 결과 줄(로그인 결과)을 지운다", async () => {
    const user = userEvent.setup();
    renderApp({
      hash: "#/?login=failed",
      respond: (call) => (call.path === "/api/me" ? errorResponse(500, "internal") : undefined),
    });
    const hub = await findHub();
    expect(await within(hub).findByText(ACCOUNT_ERROR)).toBeInTheDocument();
    expect(within(hub).getByText(LOGIN_FAILED)).toBeInTheDocument();

    await user.click(within(hub).getByRole("button", { name: "다시 시도" }));

    expect(within(hub).queryByText(LOGIN_FAILED)).toBeNull();
  });

  it("매물 이전 [다시 시도]를 시작하면 이전 결과 줄(로그인 결과)을 지운다", async () => {
    const user = userEvent.setup();
    const { [ACCOUNT_IMPORTS_STORAGE_KEY]: _done, ...notImported } = LOGGED_IN_SEED;
    void _done;
    const { api } = renderApp({
      seed: notImported,
      hash: "#/?login=cancelled",
      respond: (call) =>
        call.path === "/api/listings/import" ? errorResponse(500, "internal") : undefined,
    });
    const hub = await findHub();
    await within(hub).findByText(
      "이 기기의 매물 2개를 옮기지 못했습니다. 연결을 확인하고 다시 시도해 주세요",
    );
    expect(within(hub).getByText(LOGIN_CANCELLED)).toBeInTheDocument();

    await user.click(within(hub).getByRole("button", { name: "다시 시도" }));

    await waitFor(() => expect(api.callsTo("POST", "/api/listings/import")).toHaveLength(2));
    expect(within(hub).queryByText(LOGIN_CANCELLED)).toBeNull();
  });

  it("결과 줄은 메모리 상태: 나가기 결과는 [매물] → [홈]을 다녀오면 없다", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { api } = renderApp({
      isInHousehold: true,
      respond: (call) => {
        if (call.path === LEAVE_PATH) api.server.me = { user: { id: USER_ID, household: null } };
        return undefined;
      },
    });
    await user.click(await findLiveButton(LEAVE_NAME));
    expect(await screen.findByText(LEFT)).toBeInTheDocument();

    await user.click(tab("매물"));
    expect(await screen.findByRole("heading", { level: 1, name: "저장 목록" })).toBeInTheDocument();
    await user.click(tab("홈"));
    await findLiveButton("함께 쓰기");
    await settle();

    expect(screen.queryByText(LEFT)).toBeNull();
  });

  it("순서는 결과 줄 → 상태 줄: 나간 뒤 목록 조회가 401이면 '나왔습니다' 다음에 세션 만료 줄", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    let isListUnauthorized = false;
    const { api } = renderApp({
      isInHousehold: true,
      respond: (call) => {
        if (call.path === LEAVE_PATH) api.server.me = { user: { id: USER_ID, household: null } };
        if (isListUnauthorized && call.method === "GET" && call.path === "/api/listings") {
          return errorResponse(401, "unauthorized");
        }
        return undefined;
      },
    });
    await user.click(await findLiveButton(LEAVE_NAME));
    const hub = screen.getByRole("main");
    expect(await within(hub).findByText(LEFT)).toBeInTheDocument();
    await waitFor(() => expect(api.queryClient.isFetching()).toBe(0));

    isListUnauthorized = true;
    await act(() => api.queryClient.refetchQueries({ queryKey: listingListQueryKey() }));

    expect(await within(hub).findByText(SESSION_EXPIRED)).toBeInTheDocument();
    expect(noticeLines(hub)).toEqual([LEFT, SESSION_EXPIRED]);
  });
});

describe("나가기 성공은 곧바로 둘째 줄을 바꾼다 (AC-4, 시나리오 3)", () => {
  it("나간 뒤 /api/me 재확인이 아직 안 와도 둘째 줄은 [함께 쓰기]이고 '2명이 함께 쓰는 중'·[나가기]는 없다", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    let hasLeft = false;
    renderApp({
      isInHousehold: true,
      respond: (call) => {
        if (call.path === LEAVE_PATH) {
          hasLeft = true;
          return noContent();
        }
        // 나간 뒤의 로그인 재확인은 응답하지 않는다(받아 둔 me로만 그린다)
        if (hasLeft && call.path === "/api/me") return PENDING;
        return undefined;
      },
    });
    await user.click(await findLiveButton(LEAVE_NAME));
    const hub = screen.getByRole("main");

    expect(await within(hub).findByText(LEFT)).toBeInTheDocument();
    expect(within(hub).getByRole("button", { name: "함께 쓰기" })).toBeInTheDocument();
    expect(within(hub).queryByText("2명이 함께 쓰는 중")).toBeNull();
    expect(within(hub).queryByRole("button", { name: LEAVE_NAME })).toBeNull();
  });
});

describe("홈 계정 확인 실패 경계 (AC-1)", () => {
  it("/api/me 500 + session-hint 없음: 로그아웃 모양이고 실패 줄·[다시 시도]가 없다", async () => {
    renderApp({
      seed: LOCAL_SEED,
      respond: (call) => (call.path === "/api/me" ? errorResponse(500, "internal") : undefined),
    });
    const hub = await findHub();

    expect(await within(hub).findByRole("link", { name: LOGIN })).toBeVisible();
    expect(within(hub).queryByText(ACCOUNT_ERROR)).toBeNull();
    expect(within(hub).queryByRole("button", { name: "다시 시도" })).toBeNull();
    expect(within(hub).queryByRole("alert")).toBeNull();
  });

  it("[다시 시도]가 로그아웃(세션 끝남)으로 확정되면 실패 줄이 사라지고 로그인 안내", async () => {
    const user = userEvent.setup();
    let isMeFailing = true;
    const { api } = renderApp({
      respond: (call) => {
        if (call.path !== "/api/me") return undefined;
        return isMeFailing ? errorResponse(500, "internal") : jsonResponse(200, { user: null });
      },
    });
    void api;
    const hub = await findHub();
    expect(await within(hub).findByText(ACCOUNT_ERROR)).toBeInTheDocument();

    isMeFailing = false;
    await user.click(within(hub).getByRole("button", { name: "다시 시도" }));

    expect(await within(hub).findByRole("link", { name: LOGIN })).toBeVisible();
    expect(within(hub).queryByText(ACCOUNT_ERROR)).toBeNull();
    expect(within(hub).queryByRole("button", { name: "로그아웃" })).toBeNull();
  });
});

describe("가구에서 홈 [로그아웃] (AC-1·AC-4)", () => {
  it("204: 둘째 줄('2명이 함께 쓰는 중'·[나가기])이 사라지고 로그인 안내, 카드는 이 기기 값, 포커스는 계정 자리", async () => {
    const user = userEvent.setup();
    const { api } = renderApp({
      isInHousehold: true,
      respond: (call) => {
        if (call.path !== LOGOUT_PATH) return undefined;
        api.server.me = { user: null };
        return noContent();
      },
    });
    const logout = await findLiveButton("로그아웃");
    const hub = screen.getByRole("main");
    expect(within(hub).getByText("2명이 함께 쓰는 중")).toBeInTheDocument();

    await user.click(logout);

    const login = await within(hub).findByRole("link", { name: LOGIN });
    expect(within(hub).queryByText(/함께 쓰는 중/)).toBeNull();
    expect(within(hub).queryByRole("button", { name: LEAVE_NAME })).toBeNull();
    expect(within(hub).queryByRole("button", { name: "함께 쓰기" })).toBeNull();
    await waitFor(() =>
      expect(within(hub).getByRole("link", { name: "매물 모으기" })).toHaveAccessibleDescription(
        "저장한 매물 2개",
      ),
    );
    expect(document.activeElement).toContainElement(login);
    expect(api.callsTo("POST", LOGOUT_PATH)).toHaveLength(1);
    expect(api.callsTo("POST", LEAVE_PATH)).toHaveLength(0);
  });
});

describe("저장 목록 머리: 로그인 혼자·가구에서도 [가리기]·[목록 공유]만 (AC-3)", () => {
  it.each([
    ["로그인 혼자", false],
    ["가구", true],
  ])(
    "%s: 서버 매물이 있으면 [가리기](U7 설명)·[목록 공유]가 있고 계정·함께 쓰기 버튼은 없다",
    async (_name, isInHousehold) => {
      const { api } = renderApp({
        hash: "#/listings",
        isInHousehold,
        respond: (call) =>
          call.method === "GET" && call.path === "/api/listings"
            ? jsonResponse(200, { listings: [makeListing({ id: "server-1", name: "서버 매물" })] })
            : undefined,
      });
      expect(await screen.findByRole("list", { name: "저장한 매물 1개" })).toBeInTheDocument();
      await waitFor(() => expect(api.queryClient.isFetching()).toBe(0));
      const main = screen.getByRole("main");

      expect(within(main).getByRole("button", { name: "가리기" })).toHaveAccessibleDescription(
        "이 기기에서 저장 목록의 금액과 메모를 가립니다",
      );
      expect(within(main).getByRole("button", { name: "목록 공유" })).toBeInTheDocument();
      for (const name of ["로그아웃", "함께 쓰기", LEAVE_NAME]) {
        expect(within(main).queryByRole("button", { name }), name).toBeNull();
      }
      expect(within(main).queryByRole("link", { name: LOGIN })).toBeNull();
      expect(within(main).queryByText(/함께 쓰는 중/)).toBeNull();
    },
  );
});

describe("로그인 결과 쿼리 경계 (AC-2 fe)", () => {
  // [결함 D1] 정규 경로가 아닌 로그인 결과 주소(`&a=1`·중복 login)가 `#/?login=failed`에 남던 것.
  // 홈의 replace("#/") 뒤 부모 useHashRoute의 정규화 effect가 옛 해시 기준으로 다시 replace했다.
  it.each(["#/?login=failed&a=1", "#/?login=failed&login=cancelled"])(
    "%s: 안내 한 번(StrictMode), 주소는 #/로 replace되고 같은 주소로 다시 열면 안내가 없다",
    async (start) => {
      const first = renderApp({ seed: {}, isLoggedIn: false, hash: start, isStrict: true });
      const hub = await findHub();
      expect(await within(hub).findByText(LOGIN_FAILED)).toBeInTheDocument();
      expect(within(hub).getAllByText(LOGIN_FAILED)).toHaveLength(1);
      await settle();
      expect(window.history.length).toBe(first.historyLength);
      const settledHash = window.location.hash;
      cleanup();

      renderApp({ seed: {}, isLoggedIn: false, hash: settledHash });
      await findHub();
      await settle();
      expect(screen.queryByText(LOGIN_FAILED)).toBeNull();
      expect(settledHash).toBe("#/");
    },
  );

  it("로그인 상태로 #/?login=cancelled에 오면 안내 줄과 [로그아웃]이 함께 있고 세션 만료 줄은 없다", async () => {
    renderApp({ hash: "#/?login=cancelled" });
    const hub = await findHub();
    await findLiveButton("로그아웃");

    expect(within(hub).getByText(LOGIN_CANCELLED)).toBeInTheDocument();
    expect(within(hub).queryByText(SESSION_EXPIRED)).toBeNull();
    await waitFor(() => expect(window.location.hash).toBe("#/"));
  });
});
