// @vitest-environment jsdom
// 홈의 계정 자리(제목 줄 버튼 + 카드 위): 로그아웃이면 카카오 로그인(머리글 크기)과 이유 한 줄, 로그인이면 상태 줄과 [로그아웃],
// 계정 확인 중이면 보이지 않게 자리만 지키고, 계정 확인 실패면 이유와 [다시 시도](hub-account AC-1).
// 홈은 저장소에 쓰지 않는다(AC-0).
import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { ACCOUNT_IMPORTS_STORAGE_KEY } from "@/lib/utils/accountImportStorage";
import { BUDGET_IMPORTS_STORAGE_KEY } from "@/lib/utils/budgetImportStorage";
import { INTERIOR_PLAN_IMPORTS_STORAGE_KEY } from "@/lib/utils/interiorPlanImportStorage";
import { LISTING_ORDER_IMPORTS_STORAGE_KEY } from "@/lib/utils/listingOrderImportStorage";
import { SESSION_HINT_STORAGE_KEY } from "@/lib/utils/sessionHintStorage";
import {
  createFakePlanApi,
  errorResponse,
  jsonResponse,
  PENDING,
  type PlanApiCall,
} from "@/test/fakePlanApi";
import { createMemoryStorage } from "@/test/memoryStorage";

const USER_ID = "user-a";
const LOGIN = "카카오로 로그인";
const REASON =
  "로그인하면 저장 목록·인테리어 계획을 여러 기기에서 보고, 다른 사람과 함께 쓸 수 있어요";
const STATUS = "카카오 계정에 저장 중";

/** 이 기기 데이터 이전이 이 사용자로 끝난 로그인 브라우저 */
const LOGGED_IN_SEED = {
  [ACCOUNT_IMPORTS_STORAGE_KEY]: JSON.stringify({ [USER_ID]: [] }),
  [BUDGET_IMPORTS_STORAGE_KEY]: JSON.stringify([USER_ID]),
  [LISTING_ORDER_IMPORTS_STORAGE_KEY]: JSON.stringify([USER_ID]),
  [INTERIOR_PLAN_IMPORTS_STORAGE_KEY]: JSON.stringify({ [USER_ID]: [] }),
  [SESSION_HINT_STORAGE_KEY]: "1",
};

type RenderOptions = {
  seed?: Record<string, string>;
  userId?: string | null;
  respond?: (call: PlanApiCall) => Response | Promise<Response> | typeof PENDING | undefined;
};

function renderHub({ seed = {}, userId = null, respond }: RenderOptions = {}) {
  const storage = createMemoryStorage(seed);
  const api = createFakePlanApi({ userId });
  api.server.respond = respond;
  const spies = {
    setItem: vi.spyOn(storage, "setItem"),
    removeItem: vi.spyOn(storage, "removeItem"),
    clear: vi.spyOn(storage, "clear"),
  };
  window.location.hash = "#/";
  render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });
  return { spies };
}

async function findHub() {
  expect(await screen.findByRole("heading", { level: 1, name: "홈" })).toBeInTheDocument();
  return screen.getByRole("main");
}

/** 홈은 session-hint 기록·정리 외에는 저장소에 쓰지 않는다(AC-0) */
function expectNoStorageWrites(spies: ReturnType<typeof renderHub>["spies"]) {
  expect(spies.setItem.mock.calls.filter(([key]) => key !== SESSION_HINT_STORAGE_KEY)).toEqual([]);
  expect(spies.clear).not.toHaveBeenCalled();
  expect(spies.removeItem.mock.calls.filter(([key]) => key !== SESSION_HINT_STORAGE_KEY)).toEqual(
    [],
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("홈 계정 자리", () => {
  it("로그아웃: 카드들 위에 이유 한 줄과 [카카오로 로그인](/api/auth/kakao/login), 로그아웃·상태 줄은 없다", async () => {
    const { spies } = renderHub();
    const hub = await findHub();

    const login = await within(hub).findByRole("link", { name: LOGIN });
    expect(login).toHaveAttribute("href", "/api/auth/kakao/login");
    expect(within(hub).getByText(REASON)).toBeVisible();
    // 첫 화면에 보이도록 대출 계산 카드보다 앞이다
    expect(
      login.compareDocumentPosition(within(hub).getByRole("link", { name: "대출 계산" })),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(within(hub).queryByText(STATUS)).not.toBeInTheDocument();
    expect(within(hub).queryByRole("button", { name: "로그아웃" })).not.toBeInTheDocument();
    expectNoStorageWrites(spies);
  });

  it("로그인: 로그인 링크 대신 상태 줄과 [로그아웃], 그 아래 [함께 쓰기](홈의 버튼은 이 둘)", async () => {
    const { spies } = renderHub({ seed: LOGGED_IN_SEED, userId: USER_ID });
    const hub = await findHub();

    const logout = await within(hub).findByRole("button", { name: "로그아웃" });
    expect(within(hub).getByText(STATUS)).toBeVisible();
    expect(within(hub).queryByRole("link", { name: LOGIN })).not.toBeInTheDocument();
    expect(within(hub).queryByText(REASON)).not.toBeInTheDocument();
    expect(within(hub).queryAllByRole("button")).toEqual([
      logout,
      within(hub).getByRole("button", { name: "함께 쓰기" }),
    ]);
    expectNoStorageWrites(spies);
  });

  it("계정 확인 중(로그인한 적 없음): 로그인 자리는 보이지 않게 자리만 지키고(링크는 읽히지도 눌리지도 않는다), 확인 뒤 보인다", async () => {
    let answerMe: (response: Response) => void = () => {};
    const me = new Promise<Response>((resolve) => {
      answerMe = resolve;
    });
    renderHub({ respond: (call) => (call.path === "/api/me" ? me : undefined) });
    const hub = await findHub();

    expect(within(hub).queryByRole("link", { name: LOGIN })).not.toBeInTheDocument();
    expect(within(hub).getByText(REASON).closest("[inert]")).toHaveAttribute("aria-hidden", "true");
    expect(within(hub).queryByText(STATUS)).not.toBeInTheDocument();

    answerMe(jsonResponse(200, { user: null }));
    expect(await within(hub).findByRole("link", { name: LOGIN })).toBeVisible();
    expect(within(hub).getByText(REASON).closest("[inert]")).toBeNull();
  });

  it("계정 확인 중(로그인한 적 있음): 상태 줄 자리만 보이지 않게 지킨다", async () => {
    renderHub({
      seed: LOGGED_IN_SEED,
      userId: USER_ID,
      respond: (call) => (call.path === "/api/me" ? PENDING : undefined),
    });
    const hub = await findHub();

    expect(within(hub).getByText(STATUS).closest("[inert]")).toHaveAttribute("aria-hidden", "true");
    expect(within(hub).queryByText(REASON)).not.toBeInTheDocument();
    expect(within(hub).queryByRole("link", { name: LOGIN })).not.toBeInTheDocument();
  });

  it("계정 확인 실패(/api/me 500 + 로그인했던 브라우저): 로그인 자리도 상태 줄도 없고 이유와 [다시 시도]가 있다", async () => {
    renderHub({
      seed: LOGGED_IN_SEED,
      userId: USER_ID,
      respond: (call) => (call.path === "/api/me" ? errorResponse(500, "internal") : undefined),
    });
    const hub = await findHub();

    await waitFor(() =>
      expect(within(hub).getByRole("link", { name: "매물 모으기" })).toHaveAccessibleDescription(
        "불러오지 못했습니다",
      ),
    );
    expect(within(hub).queryByText(REASON)).not.toBeInTheDocument();
    expect(within(hub).queryByText(STATUS)).not.toBeInTheDocument();
    expect(within(hub).queryByRole("link", { name: LOGIN })).not.toBeInTheDocument();
    expect(within(hub).getByRole("alert")).toHaveTextContent("계정 상태를 확인하지 못했습니다");
    expect(within(hub).getByRole("button", { name: "다시 시도" })).toBeEnabled();
  });
});
