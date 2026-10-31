// @vitest-environment jsdom
// 스펙 hub-account AC-1: 홈 계정 자리의 [로그아웃]·계정 확인 실패·홈 안내 줄(로그아웃 실패·세션 만료·매물 이전 실패)과
// 포커스 규칙(ADR-035 조건 5). 로그아웃은 홈에만 있다.
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
import { createFakePlanApi, errorResponse, PENDING, type PlanApiCall } from "@/test/fakePlanApi";
import { makePlanP, toStoredPlans } from "@/test/interiorPlanFixture";
import { makeListing } from "@/test/listingFixture";
import { createMemoryStorage } from "@/test/memoryStorage";

const USER_ID = "user-a";
const LOGIN = "카카오로 로그인";
const STATUS = "카카오 계정에 저장 중";
const LOGOUT_DESCRIPTION = "로그아웃하면 이 기기에 있던 저장 목록·인테리어 계획으로 돌아갑니다";
const LOGOUT_FAILED = "로그아웃하지 못했습니다. 연결을 확인하고 다시 시도해 주세요";
const SESSION_EXPIRED = "로그인이 끝났습니다. 다시 로그인해 주세요";
const ACCOUNT_ERROR = "계정 상태를 확인하지 못했습니다";
const LOGOUT_PATH = "/api/auth/logout";

/** 이 기기 매물 2개·계획 P. 로그인 중에는 서버 값(매물 0개·"서버 계획")이 보이고, 로그아웃하면 이 값이 보인다 */
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

function renderHub({
  seed = LOGGED_IN_SEED,
  hash = "#/",
  respond,
}: { seed?: Record<string, string>; hash?: string; respond?: Respond } = {}) {
  const storage = createMemoryStorage(seed);
  const api = createFakePlanApi({
    userId: USER_ID,
    plans: [makePlanP({ id: "plan-server", name: "서버 계획" })],
  });
  api.server.respond = respond;
  window.location.hash = hash;
  render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });
  const logoutCalls = () => api.callsTo("POST", LOGOUT_PATH);
  return { api, storage, logoutCalls };
}

async function findHub() {
  expect(await screen.findByRole("heading", { level: 1, name: "홈" })).toBeInTheDocument();
  return screen.getByRole("main");
}

/** 확인 중 자리표시자(숨긴 같은 마크업)가 아니라 로그인으로 확정된 [로그아웃] */
async function findLogoutButton() {
  const hub = await findHub();
  const logout = await within(hub).findByRole("button", { name: "로그아웃" });
  expect(logout.closest("[inert]")).toBeNull();
  expect(within(hub).getByText(STATUS)).toBeVisible();
  return logout;
}

/** 응답을 테스트가 정할 때까지 붙잡아 둔다 */
function deferred() {
  let resolve: (response: Response) => void = () => {};
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const noContent = () => new Response(null, { status: 204 });

const cardDescription = (name: string) =>
  within(screen.getByRole("main")).getByRole("link", { name });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("홈 [로그아웃] (AC-1)", () => {
  it("로그인: 상태 줄 옆에 [로그아웃] 하나, 보조기기 설명은 U8 문구 전체", async () => {
    renderHub();
    const logout = await findLogoutButton();

    expect(within(screen.getByRole("main")).getAllByRole("button", { name: "로그아웃" })).toEqual([
      logout,
    ]);
    expect(logout).toHaveAccessibleDescription(LOGOUT_DESCRIPTION);
    expect(logout).toBeEnabled();
  });

  it("204: POST 1건 → 로그인 링크, 카드는 이 기기 값, 포커스는 계정 자리", async () => {
    const user = userEvent.setup();
    const { api, logoutCalls } = renderHub({
      respond: (call) => {
        if (call.path !== LOGOUT_PATH) return undefined;
        api.server.me = { user: null };
        return noContent();
      },
    });
    const logout = await findLogoutButton();
    await waitFor(() =>
      expect(cardDescription("인테리어 계획")).toHaveAccessibleDescription(
        "서버 계획 · 지출 예정 15,300,000원",
      ),
    );

    await user.click(logout);

    const hub = screen.getByRole("main");
    await within(hub).findByRole("link", { name: LOGIN });
    expect(logoutCalls()).toHaveLength(1);
    expect(within(hub).queryByText(STATUS)).not.toBeInTheDocument();
    await waitFor(() => {
      expect(cardDescription("매물 모으기")).toHaveAccessibleDescription("저장한 매물 2개");
      expect(cardDescription("인테리어 계획")).toHaveAccessibleDescription(
        "우리 집 · 지출 예정 15,300,000원",
      );
    });
    // 버튼이 사라지면 포커스는 계정 자리(안내 줄이 없다)
    expect(within(hub).queryByRole("status")).toBeNull();
    expect(document.activeElement).toHaveTextContent("로그인하면 저장 목록");
    expect(document.activeElement).toHaveAttribute("tabindex", "-1");
  });

  it("누르는 동안 비활성: 두 번 눌러도 POST 1건", async () => {
    const user = userEvent.setup();
    const pending = deferred();
    const { logoutCalls } = renderHub({
      respond: (call) => (call.path === LOGOUT_PATH ? pending.promise : undefined),
    });
    const logout = await findLogoutButton();

    await user.click(logout);
    expect(logout).toBeDisabled();
    await user.click(logout);

    expect(logoutCalls()).toHaveLength(1);
    pending.resolve(noContent());
    expect(await screen.findByRole("link", { name: LOGIN })).toBeInTheDocument();
  });

  it.each([
    ["500", () => errorResponse(500, "internal")],
    ["네트워크 오류", () => Promise.reject(new TypeError("Failed to fetch"))],
  ])(
    "%s: 실패 줄, 로그인 상태 유지, [로그아웃]은 남고 활성·포커스, 다시 누르면 POST 2번째·시작하면 실패 줄 지움",
    async (_name, fail) => {
      const user = userEvent.setup();
      const retry = deferred();
      let attempt = 0;
      const { logoutCalls } = renderHub({
        respond: (call) => {
          if (call.path !== LOGOUT_PATH) return undefined;
          attempt += 1;
          return attempt === 1 ? fail() : retry.promise;
        },
      });
      const logout = await findLogoutButton();
      const hub = screen.getByRole("main");

      await user.click(logout);

      expect(await within(hub).findByText(LOGOUT_FAILED)).toBeInTheDocument();
      expect(within(hub).getByText(STATUS)).toBeVisible();
      expect(logout).toBeInTheDocument();
      expect(logout).toBeEnabled();
      expect(logout).toHaveFocus();
      expect(within(hub).queryByRole("link", { name: LOGIN })).not.toBeInTheDocument();

      await user.click(logout);
      expect(logoutCalls()).toHaveLength(2);
      expect(within(hub).queryByText(LOGOUT_FAILED)).not.toBeInTheDocument();

      retry.resolve(noContent());
      expect(await within(hub).findByRole("link", { name: LOGIN })).toBeInTheDocument();
      expect(within(hub).queryByText(LOGOUT_FAILED)).not.toBeInTheDocument();
    },
  );

  it("401(세션이 이미 끝남): 로그아웃 모양 + 세션 만료 줄, 실패 줄 없음, 포커스는 세션 만료 줄", async () => {
    const user = userEvent.setup();
    renderHub({
      respond: (call) =>
        call.path === LOGOUT_PATH ? errorResponse(401, "unauthorized") : undefined,
    });
    const logout = await findLogoutButton();
    const hub = screen.getByRole("main");

    await user.click(logout);

    expect(await within(hub).findByRole("link", { name: LOGIN })).toBeInTheDocument();
    const expired = within(hub).getByText(SESSION_EXPIRED);
    expect(expired).toHaveAttribute("role", "status");
    expect(within(hub).queryByText(LOGOUT_FAILED)).not.toBeInTheDocument();
    await waitFor(() => expect(expired).toHaveFocus());
  });

  it("로그아웃 실패 줄은 로그인 상태일 때만: 그 뒤 세션이 끝나면 실패 줄 대신 세션 만료 줄", async () => {
    const user = userEvent.setup();
    let isListUnauthorized = false;
    const { api } = renderHub({
      respond: (call) => {
        if (call.path === LOGOUT_PATH) return errorResponse(500, "internal");
        if (isListUnauthorized && call.method === "GET" && call.path === "/api/listings") {
          return errorResponse(401, "unauthorized");
        }
        return undefined;
      },
    });
    const logout = await findLogoutButton();
    const hub = screen.getByRole("main");
    await user.click(logout);
    expect(await within(hub).findByText(LOGOUT_FAILED)).toBeInTheDocument();

    // 창으로 돌아와 다시 조회했더니 세션이 끝나 있었다
    isListUnauthorized = true;
    await act(() => api.queryClient.refetchQueries({ queryKey: listingListQueryKey() }));

    expect(await within(hub).findByText(SESSION_EXPIRED)).toBeInTheDocument();
    expect(within(hub).queryByText(LOGOUT_FAILED)).toBeNull();
  });

  it("결과 줄은 하나: 로그인 결과(#/?login=failed)가 보이다가 로그아웃 실패가 나면 그 줄로 바뀐다", async () => {
    const user = userEvent.setup();
    renderHub({
      hash: "#/?login=failed",
      respond: (call) => (call.path === LOGOUT_PATH ? errorResponse(500, "internal") : undefined),
    });
    const logout = await findLogoutButton();
    const hub = screen.getByRole("main");
    expect(within(hub).getByText("로그인하지 못했습니다. 다시 시도해 주세요")).toBeInTheDocument();

    await user.click(logout);

    expect(await within(hub).findByText(LOGOUT_FAILED)).toBeInTheDocument();
    expect(within(hub).queryByText("로그인하지 못했습니다. 다시 시도해 주세요")).toBeNull();
  });

  it("확인 중(로그인했던 브라우저): [로그아웃]이 아직 없어 요청을 보낼 수 없다", async () => {
    const { logoutCalls } = renderHub({
      respond: (call) => (call.path === "/api/me" ? PENDING : undefined),
    });
    const hub = await findHub();

    expect(within(hub).queryByText("로그아웃")).toBeNull();
    expect(logoutCalls()).toHaveLength(0);
  });
});

describe("홈 계정 확인 실패 (AC-1)", () => {
  it("/api/me 500 + session-hint: 이유와 [다시 시도], 누르면 /api/me 재요청(재실패면 남고 재성공이면 사라진다)", async () => {
    const user = userEvent.setup();
    let isMeFailing = true;
    const { api } = renderHub({
      respond: (call) =>
        call.path === "/api/me" && isMeFailing ? errorResponse(500, "internal") : undefined,
    });
    const hub = await findHub();

    expect(await within(hub).findByText(ACCOUNT_ERROR)).toBeInTheDocument();
    const meCalls = api.callsTo("GET", "/api/me").length;

    await user.click(within(hub).getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(api.callsTo("GET", "/api/me")).toHaveLength(meCalls + 1));
    // 다시 묻는 동안은 확인 중 자리표시자다. 다시 실패하면 같은 줄이 돌아온다
    expect(await within(hub).findByText(ACCOUNT_ERROR)).toBeInTheDocument();

    isMeFailing = false;
    await user.click(within(hub).getByRole("button", { name: "다시 시도" }));
    expect(await within(hub).findByRole("button", { name: "로그아웃" })).toBeInTheDocument();
    expect(within(hub).queryByText(ACCOUNT_ERROR)).not.toBeInTheDocument();
  });
});

describe("홈 안내 줄: 매물 이전 실패·세션 만료 (AC-1)", () => {
  it("매물 이전 실패: 이유와 [다시 시도], 누르면 이전을 다시 보낸다", async () => {
    const user = userEvent.setup();
    const { [ACCOUNT_IMPORTS_STORAGE_KEY]: _done, ...notImported } = LOGGED_IN_SEED;
    void _done;
    const { api } = renderHub({
      seed: notImported,
      respond: (call) =>
        call.path === "/api/listings/import" ? errorResponse(500, "internal") : undefined,
    });
    const hub = await findHub();

    const problem = await within(hub).findByText(
      "이 기기의 매물 2개를 옮기지 못했습니다. 연결을 확인하고 다시 시도해 주세요",
    );
    expect(problem.compareDocumentPosition(within(hub).getByRole("list"))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(api.callsTo("POST", "/api/listings/import")).toHaveLength(1);

    await user.click(within(hub).getByRole("button", { name: "다시 시도" }));

    await waitFor(() => expect(api.callsTo("POST", "/api/listings/import")).toHaveLength(2));
  });

  it.each([
    ["매물 출처만 401", "/api/listings"],
    ["계획 출처만 401", "/api/interior-plans"],
  ])("%s: 세션 만료 줄은 하나이고 계정 자리는 로그인 안내가 된다", async (_name, path) => {
    renderHub({
      respond: (call) =>
        call.method === "GET" && call.path === path
          ? errorResponse(401, "unauthorized")
          : undefined,
    });
    const hub = await findHub();

    expect(await within(hub).findByText(SESSION_EXPIRED)).toBeInTheDocument();
    expect(await within(hub).findByRole("link", { name: LOGIN })).toBeInTheDocument();
    expect(within(hub).getAllByText(SESSION_EXPIRED)).toHaveLength(1);
    expect(within(hub).queryByRole("button", { name: "로그아웃" })).toBeNull();
  });

  it("매물·계획 출처 둘 다 401이어도 세션 만료 줄은 하나다", async () => {
    renderHub({
      respond: (call) =>
        call.method === "GET" &&
        (call.path === "/api/listings" || call.path === "/api/interior-plans")
          ? errorResponse(401, "unauthorized")
          : undefined,
    });
    const hub = await findHub();

    expect(await within(hub).findByText(SESSION_EXPIRED)).toBeInTheDocument();
    await waitFor(() =>
      expect(cardDescription("인테리어 계획")).toHaveAccessibleDescription(
        "우리 집 · 지출 예정 15,300,000원",
      ),
    );
    expect(within(hub).getAllByText(SESSION_EXPIRED)).toHaveLength(1);
  });

  it("세션 만료 줄에는 [홈에서 로그인] 링크가 없다(이미 홈, 로그인은 계정 자리)", async () => {
    renderHub({
      respond: (call) =>
        call.method === "GET" && call.path === "/api/listings"
          ? errorResponse(401, "unauthorized")
          : undefined,
    });
    const hub = await findHub();
    await within(hub).findByText(SESSION_EXPIRED);

    expect(within(hub).queryByRole("link", { name: "홈에서 로그인" })).toBeNull();
  });
});
