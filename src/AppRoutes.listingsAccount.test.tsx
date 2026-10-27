// @vitest-environment jsdom
// 스펙 hub-account AC-3(로그인·로그아웃·문구 부분): 저장 목록 머리에는 로그인·로그아웃이 없다(계정은 홈에만).
// 저장 목록·우리 집의 세션 만료 안내에는 [홈에서 로그인](#/) 링크가 붙는다(U4).
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { ACCOUNT_IMPORTS_STORAGE_KEY } from "@/lib/utils/accountImportStorage";
import { BUDGET_IMPORTS_STORAGE_KEY } from "@/lib/utils/budgetImportStorage";
import { INTERIOR_PLAN_IMPORTS_STORAGE_KEY } from "@/lib/utils/interiorPlanImportStorage";
import { LISTING_ORDER_IMPORTS_STORAGE_KEY } from "@/lib/utils/listingOrderImportStorage";
import { LISTINGS_STORAGE_KEY } from "@/lib/utils/listingStorage";
import { SESSION_HINT_STORAGE_KEY } from "@/lib/utils/sessionHintStorage";
import { createFakePlanApi, errorResponse, type PlanApiCall } from "@/test/fakePlanApi";
import { makePlanP } from "@/test/interiorPlanFixture";
import { makeListing } from "@/test/listingFixture";
import { createMemoryStorage } from "@/test/memoryStorage";

const USER_ID = "user-a";
const SESSION_EXPIRED = "로그인이 끝났습니다. 다시 로그인해 주세요";

const LOGGED_IN_SEED = {
  [ACCOUNT_IMPORTS_STORAGE_KEY]: JSON.stringify({ [USER_ID]: [] }),
  [BUDGET_IMPORTS_STORAGE_KEY]: JSON.stringify([USER_ID]),
  [LISTING_ORDER_IMPORTS_STORAGE_KEY]: JSON.stringify([USER_ID]),
  [INTERIOR_PLAN_IMPORTS_STORAGE_KEY]: JSON.stringify({ [USER_ID]: [] }),
  [SESSION_HINT_STORAGE_KEY]: "1",
};

const LOCAL_LISTINGS = {
  [LISTINGS_STORAGE_KEY]: JSON.stringify([makeListing({ id: "listing-1", name: "래미안 84" })]),
};

type Mode = "loggedOut" | "solo" | "household";

function renderApp(
  mode: Mode,
  hash: string,
  respond?: (call: PlanApiCall) => Response | undefined,
) {
  const isLoggedIn = mode !== "loggedOut";
  const storage = createMemoryStorage(isLoggedIn ? LOGGED_IN_SEED : LOCAL_LISTINGS);
  const api = createFakePlanApi({
    userId: isLoggedIn ? USER_ID : null,
    isInHousehold: mode === "household",
    plans: isLoggedIn ? [makePlanP()] : [],
  });
  api.server.respond = respond;
  window.location.hash = hash;
  render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });
  return { api };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("저장 목록 머리에 로그인·로그아웃이 없다 (AC-3)", () => {
  it.each<Mode>(["loggedOut", "solo", "household"])("%s", async (mode) => {
    const { api } = renderApp(mode, "#/listings");
    expect(await screen.findByRole("heading", { level: 1, name: "저장 목록" })).toBeInTheDocument();
    // 출처가 정해진 뒤(로그아웃 로컬 목록 / 로그인 서버 목록)
    if (mode === "loggedOut") {
      expect(await screen.findByRole("list", { name: "저장한 매물 1개" })).toBeInTheDocument();
    } else {
      expect(await screen.findByText("저장한 매물이 없습니다")).toBeInTheDocument();
    }
    await waitFor(() => expect(api.queryClient.isFetching()).toBe(0));

    const main = screen.getByRole("main");
    expect(within(main).queryByRole("link", { name: "카카오로 로그인" })).toBeNull();
    expect(within(main).queryByRole("button", { name: "로그아웃" })).toBeNull();
    expect(within(main).queryByText("로그아웃", { exact: false })).toBeNull();
  });
});

describe("다른 화면의 세션 만료 안내에 [홈에서 로그인] (U4)", () => {
  it("저장 목록: 서버 목록 401 → 안내 줄에 #/로 가는 [홈에서 로그인], 누르면 홈", async () => {
    const user = userEvent.setup();
    renderApp("solo", "#/listings", (call) =>
      call.method === "GET" && call.path === "/api/listings"
        ? errorResponse(401, "unauthorized")
        : undefined,
    );

    const expired = await screen.findByText(SESSION_EXPIRED);
    const link = screen.getByRole("link", { name: "홈에서 로그인" });
    expect(link).toHaveAttribute("href", "#/");
    expect(expired.closest("[role='status']")).toContainElement(link);

    await user.click(link);
    expect(await screen.findByRole("heading", { level: 1, name: "홈" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "카카오로 로그인" })).toBeInTheDocument();
  });

  it("우리 집: 계획 목록 401 → 안내 줄에 #/로 가는 [홈에서 로그인]", async () => {
    renderApp("solo", "#/home", (call) =>
      call.method === "GET" && call.path === "/api/interior-plans"
        ? errorResponse(401, "unauthorized")
        : undefined,
    );

    const expired = await screen.findByText(SESSION_EXPIRED);
    const link = screen.getByRole("link", { name: "홈에서 로그인" });
    expect(link).toHaveAttribute("href", "#/");
    expect(expired.closest("[role='status']")).toContainElement(link);
  });
});
