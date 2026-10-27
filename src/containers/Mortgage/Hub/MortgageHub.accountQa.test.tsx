// @vitest-environment jsdom
// QA 보강: 홈 계정 자리. 주 동작 크기, 확인 뒤 자리 바뀜, 계정 확인 실패라도 로그인한 적 없는 브라우저,
// 상태별 저장소 쓰기(로그아웃 = session-hint 정리만, 로그인 = session-hint 기록만, 확인 중·실패 = 0회).
import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import KakaoLoginLink from "@/components/KakaoLoginLink";
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

/** 다음 매크로태스크까지 흘려 effect·응답 처리가 끝나게 한다 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("홈 계정 자리 (QA 보강)", () => {
  it("로그아웃 로그인 링크는 주 동작 크기(isWide)다: 넓은 KakaoLoginLink와 같은 모양", async () => {
    renderHub();
    const hub = await findHub();
    const login = await within(hub).findByRole("link", { name: LOGIN });

    const { container } = render(<KakaoLoginLink isWide />);
    const wide = container.querySelector("a") as HTMLAnchorElement;
    const { container: small } = render(<KakaoLoginLink />);
    // 대조: 넓은 것과 작은 것은 실제로 다른 모양이어야 이 비교가 의미 있다
    expect(wide.className).not.toBe((small.querySelector("a") as HTMLAnchorElement).className);
    expect(login.className).toBe(wide.className);
  });

  it("로그아웃: h1 홈 다음, 카드 목록 앞에 이유 줄 → 로그인 링크 순서다", async () => {
    renderHub();
    const hub = await findHub();
    const login = await within(hub).findByRole("link", { name: LOGIN });
    const heading = within(hub).getByRole("heading", { level: 1, name: "홈" });
    const reason = within(hub).getByText(REASON);
    const cards = within(hub).getByRole("list");

    expect(heading.compareDocumentPosition(reason)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(reason.compareDocumentPosition(login)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(login.compareDocumentPosition(cards)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(cards).not.toContainElement(login);
  });

  it("로그인: 상태 줄도 카드 목록 앞이고 링크는 카드 3개뿐이다", async () => {
    renderHub({ seed: LOGGED_IN_SEED, userId: USER_ID });
    const hub = await findHub();
    // 확인 중 자리표시자도 같은 글자를 inert 안에 숨겨 그린다(hub-account 태스크 1). jsdom의 toBeVisible은 inert를 보지 않으므로
    // 확인이 끝난 뒤의 [로그아웃](역할 질의는 aria-hidden을 뺀다)을 먼저 기다린다. 느린 실행에서 자리표시자를 잡던 경합을 막는다.
    await within(hub).findByRole("button", { name: "로그아웃" });
    await waitFor(() => expect(within(hub).getByText(STATUS)).toBeVisible());

    const status = within(hub).getByText(STATUS);
    expect(status.closest("[inert]")).toBeNull();
    expect(status.closest("[aria-hidden]")).toBeNull();
    expect(status.compareDocumentPosition(within(hub).getByRole("list"))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(
      within(hub)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual(["#/calculator", "#/listings", "#/home"]);
  });

  it("확인 중(로그인한 적 있음) → 응답이 로그인이면 같은 상태 줄이 보이게 바뀐다(자리 숨김이 풀린다)", async () => {
    let answerMe: (response: Response) => void = () => {};
    const me = new Promise<Response>((resolve) => {
      answerMe = resolve;
    });
    renderHub({
      seed: LOGGED_IN_SEED,
      userId: USER_ID,
      respond: (call) => (call.path === "/api/me" ? me : undefined),
    });
    const hub = await findHub();
    expect(within(hub).getByText(STATUS).closest("[inert]")).not.toBeNull();

    answerMe(jsonResponse(200, { user: { id: USER_ID, household: null } }));
    await waitFor(() => expect(within(hub).getByText(STATUS).closest("[inert]")).toBeNull());
    expect(within(hub).getByText(STATUS)).toBeVisible();
    expect(within(hub).queryByRole("link", { name: LOGIN })).not.toBeInTheDocument();
  });

  it("확인 중(로그인한 적 있음) → 응답이 로그아웃(세션 끝남)이면 상태 줄 자리가 로그인으로 바뀐다", async () => {
    let answerMe: (response: Response) => void = () => {};
    const me = new Promise<Response>((resolve) => {
      answerMe = resolve;
    });
    renderHub({
      seed: LOGGED_IN_SEED,
      respond: (call) => (call.path === "/api/me" ? me : undefined),
    });
    const hub = await findHub();
    expect(within(hub).queryByRole("link", { name: LOGIN })).not.toBeInTheDocument();

    answerMe(jsonResponse(200, { user: null }));
    expect(await within(hub).findByRole("link", { name: LOGIN })).toBeVisible();
    expect(within(hub).getByText(REASON).closest("[inert]")).toBeNull();
    expect(within(hub).queryByText(STATUS)).not.toBeInTheDocument();
  });

  it("확인 중 자리의 로그인 링크는 inert·aria-hidden 안에 있어 포커스·클릭 대상이 아니다", async () => {
    renderHub({ respond: (call) => (call.path === "/api/me" ? PENDING : undefined) });
    const hub = await findHub();

    const hiddenLink = within(hub).getByText(LOGIN, { selector: "a" });
    const wrapper = hiddenLink.closest("[inert]");
    expect(wrapper).not.toBeNull();
    expect(wrapper).toHaveAttribute("aria-hidden", "true");
    expect(within(hub).queryByRole("link", { name: LOGIN })).not.toBeInTheDocument();
  });

  it("계정 확인 실패지만 로그인한 적 없는 브라우저(/api/me 500, session-hint 없음)는 로그아웃처럼 로그인이 보인다", async () => {
    renderHub({
      respond: (call) => (call.path === "/api/me" ? errorResponse(500, "internal") : undefined),
    });
    const hub = await findHub();

    expect(await within(hub).findByRole("link", { name: LOGIN })).toBeVisible();
    expect(within(hub).getByText(REASON).closest("[inert]")).toBeNull();
  });
});

describe("홈 계정 자리: 상태별 저장소 쓰기 (AC-0, 키 예외 없이 정확히)", () => {
  it("로그아웃: setItem·clear 0회, removeItem은 session-hint 정리뿐", async () => {
    const { spies } = renderHub();
    const hub = await findHub();
    await within(hub).findByRole("link", { name: LOGIN });
    await settle();

    expect(spies.setItem).not.toHaveBeenCalled();
    expect(spies.clear).not.toHaveBeenCalled();
    expect(spies.removeItem.mock.calls.every(([key]) => key === SESSION_HINT_STORAGE_KEY)).toBe(
      true,
    );
  });

  it('로그인: removeItem·clear 0회, setItem은 session-hint 기록("1")뿐', async () => {
    const { spies } = renderHub({ seed: LOGGED_IN_SEED, userId: USER_ID });
    const hub = await findHub();
    await waitFor(() => expect(within(hub).getByText(STATUS)).toBeVisible());
    await settle();

    expect(spies.removeItem).not.toHaveBeenCalled();
    expect(spies.clear).not.toHaveBeenCalled();
    for (const [key] of spies.setItem.mock.calls) expect(key).toBe(SESSION_HINT_STORAGE_KEY);
  });

  it("확인 중(/api/me 응답 없음, 로그인했던 브라우저): 쓰기 0회", async () => {
    const pending = renderHub({
      seed: LOGGED_IN_SEED,
      userId: USER_ID,
      respond: (call) => (call.path === "/api/me" ? PENDING : undefined),
    });
    await findHub();
    await settle();
    expect(pending.spies.setItem).not.toHaveBeenCalled();
    expect(pending.spies.removeItem).not.toHaveBeenCalled();
    expect(pending.spies.clear).not.toHaveBeenCalled();
  });

  it("계정 확인 실패(500 + session-hint): 쓰기 0회", async () => {
    const { spies } = renderHub({
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
    await settle();
    expect(spies.setItem).not.toHaveBeenCalled();
    expect(spies.removeItem).not.toHaveBeenCalled();
    expect(spies.clear).not.toHaveBeenCalled();
  });
});
