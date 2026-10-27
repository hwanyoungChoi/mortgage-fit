// @vitest-environment jsdom
// 스펙 hub-account AC-4: 홈 계정 자리 둘째 줄의 함께 쓰기([함께 쓰기] 시트 / "n명이 함께 쓰는 중" · [나가기])와
// 결과 안내·포커스 규칙(ADR-035 조건 5). 시트를 열고 닫거나 나가도 이 기기 저장소에는 쓰지 않는다(AC-0 (b)).
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
import { makePlanP } from "@/test/interiorPlanFixture";
import { createMemoryStorage } from "@/test/memoryStorage";

const USER_ID = "user-a";
const INVITES_PATH = "/api/household/invites";
const LEAVE_PATH = "/api/household/leave";
const LEAVE_NAME = "함께 쓰기에서 나가기";
const LEFT = "함께 쓰기에서 나왔습니다";
const LEAVE_FAILED = "함께 쓰기에서 나가지 못했습니다. 연결을 확인하고 다시 시도해 주세요";
const SESSION_EXPIRED = "로그인이 끝났습니다. 다시 로그인해 주세요";
const PLAN_PARAGRAPH =
  "인테리어 계획: 함께 쓰는 동안 상대가 내 계획에 넣은 항목은 내 계획과 함께 나가고, 내가 상대 계획에 넣은 항목은 그 계획에 남습니다.";
const INVITE_URL = "https://example.test/#/invite/AbCdEfGhIjKlMnOpQrStUv";

const LOGGED_IN_SEED = {
  [ACCOUNT_IMPORTS_STORAGE_KEY]: JSON.stringify({ [USER_ID]: [] }),
  [BUDGET_IMPORTS_STORAGE_KEY]: JSON.stringify([USER_ID]),
  [LISTING_ORDER_IMPORTS_STORAGE_KEY]: JSON.stringify([USER_ID]),
  [INTERIOR_PLAN_IMPORTS_STORAGE_KEY]: JSON.stringify({ [USER_ID]: [] }),
  [SESSION_HINT_STORAGE_KEY]: "1",
};

type Respond = (call: PlanApiCall) => Response | Promise<Response> | typeof PENDING | undefined;

function renderHub({
  isLoggedIn = true,
  isInHousehold = false,
  respond,
}: { isLoggedIn?: boolean; isInHousehold?: boolean; respond?: Respond } = {}) {
  const storage = createMemoryStorage(isLoggedIn ? LOGGED_IN_SEED : {});
  const api = createFakePlanApi({
    userId: isLoggedIn ? USER_ID : null,
    isInHousehold,
    plans: isLoggedIn ? [makePlanP({ id: "plan-server", name: "서버 계획" })] : [],
  });
  api.server.respond = respond;
  window.location.hash = "#/";
  render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });
  return { api, storage };
}

/** 이 시점부터의 이 기기 저장소 쓰기(종류별) */
function spyWrites(storage: Storage) {
  const setItem = vi.spyOn(storage, "setItem");
  const removeItem = vi.spyOn(storage, "removeItem");
  const clear = vi.spyOn(storage, "clear");
  return () => ({
    setItem: setItem.mock.calls,
    removeItem: removeItem.mock.calls,
    clear: clear.mock.calls,
  });
}

const NO_WRITES = { setItem: [], removeItem: [], clear: [] };

async function findHub() {
  expect(await screen.findByRole("heading", { level: 1, name: "홈" })).toBeInTheDocument();
  return screen.getByRole("main");
}

/** 확인 중 자리표시자가 아니라 로그인으로 확정된 [함께 쓰기] */
async function findHouseholdButton() {
  const hub = await findHub();
  const button = await within(hub).findByRole("button", { name: "함께 쓰기" });
  expect(button.closest("[inert]")).toBeNull();
  return button;
}

async function findLeaveButton() {
  const hub = await findHub();
  const button = await within(hub).findByRole("button", { name: LEAVE_NAME });
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

const inviteCreated = () =>
  jsonResponse(201, {
    token: "AbCdEfGhIjKlMnOpQrStUv",
    url: INVITE_URL,
    expiresAt: "2026-11-03T00:00:00.000Z",
  });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("홈 [함께 쓰기] 시트 (AC-4 혼자)", () => {
  it("로그인·혼자: 상태 줄 아래 [함께 쓰기](aria-haspopup=dialog), '함께 쓰는 중'·[나가기]는 없다", async () => {
    renderHub();
    const button = await findHouseholdButton();
    const hub = screen.getByRole("main");

    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    const status = within(hub).getByText("카카오 계정에 저장 중");
    expect(status.compareDocumentPosition(button)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(button.compareDocumentPosition(within(hub).getByRole("list"))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(within(hub).queryByRole("button", { name: LEAVE_NAME })).toBeNull();
    expect(within(hub).queryByText(/함께 쓰는 중/)).toBeNull();
  });

  it("열면 dialog '함께 쓰기'(U8 문구), 홈은 inert. 초대 링크 만들기 → POST 1건 → 링크·끊기 → DELETE 1건. 닫으면 [함께 쓰기]로 포커스. 쓰기 0회", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { api, storage } = renderHub({
      respond: (call) => {
        if (call.path !== INVITES_PATH) return undefined;
        return call.method === "POST" ? inviteCreated() : noContent();
      },
    });
    const button = await findHouseholdButton();
    const writes = spyWrites(storage);

    await user.click(button);

    const dialog = screen.getByRole("dialog", { name: "함께 쓰기" });
    expect(button.closest("[inert]")).not.toBeNull();
    expect(
      within(dialog).getByText(
        "초대 링크를 받은 사람이 카카오로 로그인해 수락하면 저장 목록과 인테리어 계획을 함께 씁니다.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "받은 사람의 원래 목록·인테리어 계획은 숨겨지고 내 목록·예산·순서·인테리어 계획을 함께 씁니다. 둘 다 보고 고치고 지울 수 있습니다. 새로 만들면 전에 만든 초대 링크는 끊깁니다.",
      ),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "초대 링크 만들기" }));

    expect(await within(dialog).findByRole("textbox", { name: "초대 링크" })).toHaveValue(
      INVITE_URL,
    );
    expect(api.callsTo("POST", INVITES_PATH)).toHaveLength(1);
    expect(
      within(dialog).getByText(
        "7일 동안 한 번 쓸 수 있습니다. 받은 사람이 카카오로 로그인해 수락하면 같은 목록과 인테리어 계획을 함께 씁니다. 이 창을 닫으면 링크를 다시 볼 수 없어요.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "복사" })).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "이 초대 끊기" }));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(
      await within(dialog).findByText("초대를 끊었습니다. 이 링크는 더 이상 열리지 않습니다"),
    ).toBeInTheDocument();
    expect(api.callsTo("DELETE", INVITES_PATH)).toHaveLength(1);

    await user.click(within(dialog).getByRole("button", { name: "닫기" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(button).toHaveFocus();
    expect(button.closest("[inert]")).toBeNull();
    expect(writes()).toEqual(NO_WRITES);
  });

  it("뒤로 가기는 시트만 닫는다: 주소는 #/, 홈 그대로", async () => {
    const user = userEvent.setup();
    renderHub();
    await user.click(await findHouseholdButton());
    expect(screen.getByRole("dialog", { name: "함께 쓰기" })).toBeInTheDocument();

    window.history.back();

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.location.hash).toBe("#/");
    expect(screen.getByRole("heading", { level: 1, name: "홈" })).toBeInTheDocument();
  });

  it("409 householdFull: '이미 2명이 함께 쓰고 있습니다'", async () => {
    const user = userEvent.setup();
    renderHub({
      respond: (call) =>
        call.method === "POST" && call.path === INVITES_PATH
          ? errorResponse(409, "householdFull")
          : undefined,
    });
    await user.click(await findHouseholdButton());
    const dialog = screen.getByRole("dialog", { name: "함께 쓰기" });

    await user.click(within(dialog).getByRole("button", { name: "초대 링크 만들기" }));

    expect(await within(dialog).findByText("이미 2명이 함께 쓰고 있습니다")).toBeInTheDocument();
  });

  it("401: 시트 본문이 로그인 안내, 닫으면 홈에 세션 만료 줄 하나·포커스는 그 줄", async () => {
    const user = userEvent.setup();
    renderHub({
      respond: (call) =>
        call.method === "POST" && call.path === INVITES_PATH
          ? errorResponse(401, "unauthorized")
          : undefined,
    });
    await user.click(await findHouseholdButton());
    const dialog = screen.getByRole("dialog", { name: "함께 쓰기" });

    await user.click(within(dialog).getByRole("button", { name: "초대 링크 만들기" }));

    expect(
      await within(dialog).findByText("카카오로 로그인하면 함께 쓸 수 있어요"),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "카카오로 로그인" })).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "닫기" }));

    const hub = screen.getByRole("main");
    expect(within(hub).queryByRole("button", { name: "함께 쓰기" })).toBeNull();
    const expired = within(hub).getByText(SESSION_EXPIRED);
    expect(within(hub).getAllByText(SESSION_EXPIRED)).toHaveLength(1);
    expect(expired).toHaveFocus();
  });

  it("401 뒤 시트의 로그인 안내에도 인테리어 계획이 들어 있다(U8과 같은 표현)", async () => {
    const user = userEvent.setup();
    renderHub({
      respond: (call) =>
        call.method === "POST" && call.path === INVITES_PATH
          ? errorResponse(401, "unauthorized")
          : undefined,
    });
    await user.click(await findHouseholdButton());
    const dialog = screen.getByRole("dialog", { name: "함께 쓰기" });

    await user.click(within(dialog).getByRole("button", { name: "초대 링크 만들기" }));

    expect(
      await within(dialog).findByText(
        "초대받은 사람이 수락하면 저장 목록과 인테리어 계획을 함께 씁니다. 매물·메모·예산·순서·인테리어 계획이 둘 다에게 같게 보입니다.",
      ),
    ).toBeInTheDocument();
  });

  it("시트를 열면 이전 결과 줄(로그인 결과)을 지운다", async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorage(LOGGED_IN_SEED);
    const api = createFakePlanApi({ userId: USER_ID });
    window.location.hash = "#/?login=cancelled";
    render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });
    const button = await findHouseholdButton();
    expect(screen.getByText("로그인을 취소했습니다")).toBeInTheDocument();

    await user.click(button);

    expect(screen.queryByText("로그인을 취소했습니다")).toBeNull();
  });
});

describe("홈 함께 쓰는 중 · [나가기] (AC-4 가구)", () => {
  it("'2명이 함께 쓰는 중'과 [나가기](aria-label), [함께 쓰기]는 없다", async () => {
    renderHub({ isInHousehold: true });
    const leave = await findLeaveButton();
    const hub = screen.getByRole("main");

    expect(leave).toHaveTextContent("나가기");
    const status = within(hub).getByText("2명이 함께 쓰는 중");
    expect(status.compareDocumentPosition(leave)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(within(hub).getByText("카카오 계정에 저장 중").compareDocumentPosition(status)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(within(hub).queryByRole("button", { name: "함께 쓰기" })).toBeNull();
  });

  it("확인 문구에 매물·인테리어 계획 문단, 취소하면 요청 0건", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { api } = renderHub({ isInHousehold: true });

    await user.click(await findLeaveButton());

    expect(confirm).toHaveBeenCalledTimes(1);
    const message = confirm.mock.calls[0][0] as string;
    expect(message.startsWith("함께 쓰기에서 나갈까요?")).toBe(true);
    expect(message).toContain("내가 원래 쓰던 목록과 예산·순서가 돌아옵니다");
    expect(message.split("\n")).toContain(PLAN_PARAGRAPH);
    expect(api.callsTo("POST", LEAVE_PATH)).toHaveLength(0);
    expect(screen.getByRole("button", { name: LEAVE_NAME })).toBeInTheDocument();
  });

  it("수락: 누르는 동안 비활성(두 번 눌러도 POST 1건) → '함께 쓰기에서 나왔습니다'·포커스, 둘째 줄 [함께 쓰기], 목록·계획 재조회, 쓰기 0회", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const pending = deferred();
    const { api, storage } = renderHub({
      isInHousehold: true,
      respond: (call) => {
        if (call.path !== LEAVE_PATH) return undefined;
        api.server.me = { user: { id: USER_ID, household: null } };
        return pending.promise;
      },
    });
    const leave = await findLeaveButton();
    await waitFor(() => expect(api.queryClient.isFetching()).toBe(0));
    const writes = spyWrites(storage);
    const listingGets = api.callsTo("GET", "/api/listings").length;
    const planGets = api.callsTo("GET", "/api/interior-plans").length;

    await user.click(leave);
    expect(leave).toBeDisabled();
    await user.click(leave);
    expect(api.callsTo("POST", LEAVE_PATH)).toHaveLength(1);

    pending.resolve(noContent());

    const hub = screen.getByRole("main");
    const left = await within(hub).findByText(LEFT);
    expect(left).toHaveAttribute("role", "status");
    expect(left).toHaveFocus();
    expect(await within(hub).findByRole("button", { name: "함께 쓰기" })).toBeInTheDocument();
    expect(within(hub).queryByText("2명이 함께 쓰는 중")).toBeNull();
    expect(within(hub).queryByRole("button", { name: LEAVE_NAME })).toBeNull();
    await waitFor(() => {
      expect(api.callsTo("GET", "/api/listings").length).toBeGreaterThan(listingGets);
      expect(api.callsTo("GET", "/api/interior-plans").length).toBeGreaterThan(planGets);
    });
    expect(api.callsTo("POST", LEAVE_PATH)).toHaveLength(1);
    // 나간 뒤 me가 바뀌어 로그인 확인 결과(session-hint "1")를 다시 적는 것뿐이다(기존 규칙). 그 밖의 키는 쓰지 않는다
    expect(writes()).toEqual({
      setItem: [[SESSION_HINT_STORAGE_KEY, "1"]],
      removeItem: [],
      clear: [],
    });
  });

  it("404(상대가 먼저 나가 해체됨)도 나온 것과 같다", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { api } = renderHub({
      isInHousehold: true,
      respond: (call) => {
        if (call.path !== LEAVE_PATH) return undefined;
        api.server.me = { user: { id: USER_ID, household: null } };
        return errorResponse(404, "notFound");
      },
    });

    await user.click(await findLeaveButton());

    const hub = screen.getByRole("main");
    expect(await within(hub).findByText(LEFT)).toBeInTheDocument();
    expect(within(hub).queryByText(LEAVE_FAILED)).toBeNull();
    expect(await within(hub).findByRole("button", { name: "함께 쓰기" })).toBeInTheDocument();
  });

  it("500: 실패 줄, [나가기]는 남고 활성. 다시 누르면 실패 줄을 지우고 POST 2번째", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const retry = deferred();
    let attempt = 0;
    const { api } = renderHub({
      isInHousehold: true,
      respond: (call) => {
        if (call.path !== LEAVE_PATH) return undefined;
        attempt += 1;
        return attempt === 1 ? errorResponse(500, "internal") : retry.promise;
      },
    });
    const leave = await findLeaveButton();
    const hub = screen.getByRole("main");

    await user.click(leave);

    expect(await within(hub).findByText(LEAVE_FAILED)).toBeInTheDocument();
    expect(within(hub).queryByText(LEFT)).toBeNull();
    expect(leave).toBeInTheDocument();
    expect(leave).toBeEnabled();
    expect(leave).toHaveFocus();
    expect(within(hub).getByText("2명이 함께 쓰는 중")).toBeInTheDocument();

    await user.click(leave);

    expect(api.callsTo("POST", LEAVE_PATH)).toHaveLength(2);
    expect(within(hub).queryByText(LEAVE_FAILED)).toBeNull();
  });

  it("401: 세션 만료 줄(실패 줄 아님), 계정 자리는 로그인 안내, 포커스는 세션 만료 줄", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderHub({
      isInHousehold: true,
      respond: (call) =>
        call.path === LEAVE_PATH ? errorResponse(401, "unauthorized") : undefined,
    });

    await user.click(await findLeaveButton());

    const hub = screen.getByRole("main");
    expect(await within(hub).findByRole("link", { name: "카카오로 로그인" })).toBeInTheDocument();
    const expired = within(hub).getByText(SESSION_EXPIRED);
    expect(within(hub).queryByText(LEAVE_FAILED)).toBeNull();
    await waitFor(() => expect(expired).toHaveFocus());
  });
});

describe("홈 둘째 줄: 로그아웃·확인 중 (AC-4·AC-1)", () => {
  it("로그아웃: [함께 쓰기]·[나가기]·'함께 쓰는 중'이 없다", async () => {
    const { api } = renderHub({ isLoggedIn: false });
    const hub = await findHub();
    await within(hub).findByRole("link", { name: "카카오로 로그인" });
    await waitFor(() => expect(api.queryClient.isFetching()).toBe(0));

    expect(within(hub).queryByText("함께 쓰기", { selector: "button" })).toBeNull();
    expect(within(hub).queryByRole("button", { name: LEAVE_NAME })).toBeNull();
    expect(within(hub).queryByText(/함께 쓰는 중/)).toBeNull();
  });

  it("확인 중(로그인했던 브라우저): [함께 쓰기] 자리도 숨겨 지킨다(inert·aria-hidden, 눌러도 시트 없음)", async () => {
    const user = userEvent.setup();
    renderHub({ respond: (call) => (call.path === "/api/me" ? PENDING : undefined) });
    const hub = await findHub();

    const hidden = within(hub).getByText("함께 쓰기", { selector: "button" });
    expect(hidden.closest("[inert]")).toHaveAttribute("aria-hidden", "true");
    expect(within(hub).queryByRole("button", { name: "함께 쓰기" })).toBeNull();
    await user.click(hidden);

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
