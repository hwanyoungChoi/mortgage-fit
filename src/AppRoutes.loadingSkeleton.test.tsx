// @vitest-environment jsdom
// 스펙 loading-skeleton AC-7: 저장 목록·예산 화면은 첫 화면에 쓸 조회가 다 끝난 뒤 한 번에 드러낸다.
// 홈(AC-1)은 MortgageHub.summary.test.tsx가 본다.
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { ACCOUNT_IMPORTS_STORAGE_KEY } from "@/lib/utils/accountImportStorage";
import { BUDGET_IMPORTS_STORAGE_KEY } from "@/lib/utils/budgetImportStorage";
import { INTERIOR_PLAN_IMPORTS_STORAGE_KEY } from "@/lib/utils/interiorPlanImportStorage";
import { LISTING_ORDER_IMPORTS_STORAGE_KEY } from "@/lib/utils/listingOrderImportStorage";
import { SESSION_HINT_STORAGE_KEY } from "@/lib/utils/sessionHintStorage";
import { createFakePlanApi, jsonResponse, type PlanApiCall } from "@/test/fakePlanApi";
import { makePlanP } from "@/test/interiorPlanFixture";
import { makeListing } from "@/test/listingFixture";
import { createMemoryStorage } from "@/test/memoryStorage";

import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";

const USER_ID = "user-a";

/** 로그인했고 이 기기 데이터의 이전은 모두 끝난 상태 */
const LOGGED_IN_SEED = {
  [ACCOUNT_IMPORTS_STORAGE_KEY]: JSON.stringify({ [USER_ID]: [] }),
  [BUDGET_IMPORTS_STORAGE_KEY]: JSON.stringify([USER_ID]),
  [LISTING_ORDER_IMPORTS_STORAGE_KEY]: JSON.stringify([USER_ID]),
  [INTERIOR_PLAN_IMPORTS_STORAGE_KEY]: JSON.stringify({ [USER_ID]: [] }),
  [SESSION_HINT_STORAGE_KEY]: "1",
};

const SERVER_LISTING = makeListing({ id: "server-1", name: "래미안 84" });

/** 원하는 순간에 응답하는 GET 하나 */
function deferredGet(path: string, body: unknown) {
  let open: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  return {
    respond: (call: PlanApiCall) =>
      call.method === "GET" && call.path === path
        ? gate.then(() => jsonResponse(200, body))
        : undefined,
    resolve: () => act(async () => open()),
  };
}

type Deferred = ReturnType<typeof deferredGet>;

function renderApp(hash: string, plans: InteriorPlanWithItems[], deferred: Deferred[]) {
  const api = createFakePlanApi({ userId: USER_ID, plans });
  api.server.respond = (call) => {
    for (const gate of deferred) {
      const response = gate.respond(call);
      if (response !== undefined) return response;
    }
    if (call.method === "GET" && call.path === "/api/listings") {
      return jsonResponse(200, { listings: [SERVER_LISTING] });
    }
    return undefined;
  };
  window.location.hash = hash;
  render(<AppRoutes storage={createMemoryStorage(LOGGED_IN_SEED)} />, { wrapper: api.wrapper });
  return { api };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("AC-7 저장 목록 한 번에", () => {
  it("목록이 먼저 와도 예산·순서를 기다리는 동안 스켈레톤이고, 셋 다 오면 예산 줄·표·제목 줄 버튼이 같이 나타난다", async () => {
    const budget = deferredGet("/api/budget", { budget: 50000 });
    const order = deferredGet("/api/listing-order", { ids: null });
    const { api } = renderApp("#/listings", [], [budget, order]);
    const main = await screen.findByRole("main");
    await waitFor(() => expect(api.callsTo("GET", "/api/budget").length).toBeGreaterThan(0));
    await waitFor(() => expect(api.callsTo("GET", "/api/listing-order").length).toBeGreaterThan(0));
    await waitFor(() => expect(api.callsTo("GET", "/api/listings").length).toBeGreaterThan(0));
    await act(async () => {});

    expect(main.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(within(main).getByText("저장 목록을 불러오는 중")).toBeInTheDocument();
    expect(within(main).queryByText("예산을 불러오는 중")).toBeNull();
    expect(within(main).queryByText("직접 정한 순서를 불러오는 중")).toBeNull();
    expect(within(main).queryByText("래미안 84")).toBeNull();
    expect(within(main).queryByRole("button", { name: "목록 공유" })).toBeNull();

    await budget.resolve();
    expect(within(main).queryByText("래미안 84")).toBeNull();
    await order.resolve();
    await waitFor(() => {
      expect(within(main).getByRole("region", { name: "내 예산" })).toBeInTheDocument();
      expect(within(main).getByRole("list", { name: "저장한 매물 1개" })).toBeInTheDocument();
      expect(within(main).getByRole("button", { name: "목록 공유" })).toBeInTheDocument();
    });
    expect(main.querySelector('[aria-busy="true"]')).toBeNull();
  });
});

describe("AC-7 예산 한 번에", () => {
  it("매물에 연결된 계획은 매물 목록이 올 때까지 스켈레톤이고, 드러낼 때 연결된 매물 줄이 함께 있다", async () => {
    const listings = deferredGet("/api/listings", { listings: [SERVER_LISTING] });
    const { api } = renderApp("#/home", [makePlanP({ listingId: "server-1" })], [listings]);
    const main = await screen.findByRole("main");
    await waitFor(() =>
      expect(api.callsTo("GET", "/api/interior-plans").length).toBeGreaterThan(0),
    );
    await waitFor(() => expect(api.callsTo("GET", "/api/listings").length).toBeGreaterThan(0));
    await waitFor(() => expect(api.queryClient.isFetching()).toBe(1));

    expect(main.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "예산" })).toBeInTheDocument();
    expect(within(main).queryByRole("heading", { level: 1, name: "우리 집" })).toBeNull();
    expect(within(main).queryByText(/연결된 매물/)).toBeNull();

    await listings.resolve();
    await waitFor(() => {
      expect(within(main).getByRole("heading", { level: 1, name: "우리 집" })).toBeInTheDocument();
      expect(within(main).getByText("연결된 매물 · 래미안 84")).toBeInTheDocument();
    });
    expect(main.querySelector('[aria-busy="true"]')).toBeNull();
  });

  // qa: 매물 목록 조회 실패는 로딩이 아니다(스펙 "실패·손상·빈 상태는 스켈레톤이 아니다")
  it("매물에 연결된 계획에서 매물 목록 조회가 500이면 스켈레톤에 머물지 않고 계획을 드러낸다", async () => {
    const failedListings = {
      respond: (call: PlanApiCall) =>
        call.method === "GET" && call.path === "/api/listings"
          ? Promise.resolve(jsonResponse(500, { error: "internal" }))
          : undefined,
      resolve: async () => {},
    };
    renderApp("#/home", [makePlanP({ listingId: "server-1" })], [failedListings]);
    const main = await screen.findByRole("main");

    await waitFor(() =>
      expect(within(main).getByRole("heading", { level: 1, name: "우리 집" })).toBeInTheDocument(),
    );
    expect(main.querySelector('[aria-busy="true"]')).toBeNull();
    expect(within(main).queryByText(/연결된 매물/)).toBeNull();
  });
});
