// @vitest-environment jsdom
// 스펙 hub-account AC-3(문구): 초대 화면이 옮긴 기능(나가기)을 홈 기준으로 가리키고, 저장 목록으로 가던 링크는 홈으로 간다.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { ACCOUNT_IMPORTS_STORAGE_KEY } from "@/lib/utils/accountImportStorage";
import { BUDGET_IMPORTS_STORAGE_KEY } from "@/lib/utils/budgetImportStorage";
import { INTERIOR_PLAN_IMPORTS_STORAGE_KEY } from "@/lib/utils/interiorPlanImportStorage";
import { LISTING_ORDER_IMPORTS_STORAGE_KEY } from "@/lib/utils/listingOrderImportStorage";
import { SESSION_HINT_STORAGE_KEY } from "@/lib/utils/sessionHintStorage";
import { createFakePlanApi, errorResponse } from "@/test/fakePlanApi";
import { createMemoryStorage } from "@/test/memoryStorage";

const USER_ID = "user-a";
const TOKEN = "AbCdEfGhIjKlMnOpQrStUv";

const LOGGED_IN_SEED = {
  [ACCOUNT_IMPORTS_STORAGE_KEY]: JSON.stringify({ [USER_ID]: [] }),
  [BUDGET_IMPORTS_STORAGE_KEY]: JSON.stringify([USER_ID]),
  [LISTING_ORDER_IMPORTS_STORAGE_KEY]: JSON.stringify([USER_ID]),
  [INTERIOR_PLAN_IMPORTS_STORAGE_KEY]: JSON.stringify({ [USER_ID]: [] }),
  [SESSION_HINT_STORAGE_KEY]: "1",
};

function renderInvite(isInHousehold: boolean) {
  const api = createFakePlanApi({ userId: USER_ID, isInHousehold });
  window.location.hash = `#/invite/${TOKEN}`;
  render(<AppRoutes storage={createMemoryStorage(LOGGED_IN_SEED)} />, { wrapper: api.wrapper });
  return { api };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("초대 화면 문구·링크는 홈 기준 (AC-3)", () => {
  it("이미 함께 쓰는 중: 홈에서 [나가기]로 나가라고 안내하고 링크는 홈", async () => {
    renderInvite(true);

    expect(await screen.findByText("이미 함께 쓰는 목록이 있습니다")).toBeInTheDocument();
    expect(
      screen.getByText(/홈에서 \[나가기\]로 나간 뒤 이 링크를 다시 열어 주세요/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/저장 목록에서 \[나가기\]/)).toBeNull();
    expect(screen.getByRole("link", { name: "홈으로 가기" })).toHaveAttribute("href", "#/");
    expect(screen.queryByRole("link", { name: "저장 목록으로 가기" })).toBeNull();
  });

  it("내가 만든 초대: 링크는 홈", async () => {
    const user = userEvent.setup();
    const { api } = renderInvite(false);
    api.server.respond = (call) =>
      call.method === "POST" && call.path === `/api/household/invites/${TOKEN}/accept`
        ? errorResponse(400, "ownInvite")
        : undefined;

    await user.click(await screen.findByRole("button", { name: "함께 쓰기 시작" }));

    expect(await screen.findByText("내가 만든 초대 링크입니다")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "홈으로 가기" })).toHaveAttribute("href", "#/");
    expect(screen.queryByRole("link", { name: "저장 목록으로 가기" })).toBeNull();
  });
});
