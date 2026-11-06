// @vitest-environment jsdom
// 스펙 interior-budget-exclude AC-7(세 출처·함께 쓰기) 클라이언트 쪽. 계산은 한 곳(interiorOffBudgetTotals.test.ts)이라
// 출처마다 "R5 저장(또는 받기) → 요약 값" 하나씩만 본다. 로그아웃 출처는 MortgageHome.offBudget.test.tsx가 본다.
// 실제 서버 왕복(가구 구성원 PUT → 다른 구성원 GET, 로컬 E /import → GET)은 server/interiorPlans/interiorOffBudgetSources.d1.test.ts.
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { SESSION_HINT_STORAGE_KEY } from "@/lib/utils/sessionHintStorage";
import { createFakePlanApi } from "@/test/fakePlanApi";
import { toStoredPlans } from "@/test/interiorPlanFixture";
import { makeOffBudgetPlanE } from "@/test/interiorSimpleFixture";
import { createMemoryStorage } from "@/test/memoryStorage";

import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";

const R1 = "도배 육문수 실크 전체";
const R5 = "욕실 하루바스 타일 덧방 (2)";
const R5_PUT = "/api/interior-plans/plan-simple/items/r5";

/** E에서 R5의 예산 외만 뺀 것(R3·R5 [완료], 모두 반영). 여기서 R5를 예산 외로 저장하면 E가 된다 */
function makePlanE0(): InteriorPlanWithItems {
  const plan = makeOffBudgetPlanE();
  plan.items = plan.items.map((item) => {
    const { isOffBudget, ...rest } = item;
    void isOffBudget;
    return rest;
  });
  return plan;
}

function renderLoggedIn({
  isInHousehold = false,
  serverPlans,
  localPlans = [],
  hash = "#/home/plan-simple",
}: {
  isInHousehold?: boolean;
  serverPlans: InteriorPlanWithItems[];
  localPlans?: InteriorPlanWithItems[];
  hash?: string;
}) {
  const storage = createMemoryStorage({
    [SESSION_HINT_STORAGE_KEY]: "1",
    ...(localPlans.length === 0 ? {} : { [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans(localPlans) }),
  });
  const api = createFakePlanApi({ userId: "user-a", isInHousehold, plans: serverPlans });
  window.location.hash = hash;
  render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });
  return api;
}

const summary = () => screen.getByRole("region", { name: "요약" });
const headlineValue = (label: string) =>
  within(summary()).getByText(label).nextElementSibling?.textContent;
const detailValue = (label: string) =>
  within(summary()).queryByText(label, { selector: "dt" })?.nextElementSibling?.textContent;

/** AC-3 예시 E의 요약 값 */
function expectSummaryE() {
  expect(detailValue("지출 예정")).toBe("1,800,000원");
  expect(detailValue("지출 완료")).toBe("3,700,000원");
  expect(within(summary()).getByText("예산 외 2,500,000원")).toBeInTheDocument();
  expect(headlineValue("남은 예산")).toBe("4,500,000원");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("AC-7 세 출처 — 로그인·함께 쓰기", () => {
  it("로그인 혼자: R5 [예산에 반영] 끄고 저장 → PUT 1건(isOffBudget: true), 요약이 E 값", async () => {
    const user = userEvent.setup();
    const api = renderLoggedIn({ serverPlans: [makePlanE0()] });
    await user.click(await screen.findByRole("button", { name: `${R5} 열기` }));
    expect(headlineValue("남은 예산")).toBe("2,000,000원");
    const dialog = screen.getByRole("dialog", { name: "줄" });
    await user.click(within(dialog).getByRole("checkbox", { name: "예산에 반영" }));
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const puts = api.callsTo("PUT", R5_PUT);
    expect(puts).toHaveLength(1);
    expect((puts[0].body as { item: { isOffBudget?: unknown } }).item.isOffBudget).toBe(true);
    expect(api.server.plans[0].items[4].isOffBudget).toBe(true);
    await waitFor(expectSummaryE);
  });

  it("함께 쓰는 중: 상대가 R5를 예산 외로 저장 → 이 기기 재조회 뒤 요약이 E 값, 목록에 '예산 외'", async () => {
    const api = renderLoggedIn({ isInHousehold: true, serverPlans: [makePlanE0()] });
    await screen.findByRole("button", { name: `${R5} 열기` });
    expect(headlineValue("남은 예산")).toBe("2,000,000원");

    api.editItemOnServer("plan-simple", "r5", { isOffBudget: true });
    await act(async () => {
      window.dispatchEvent(new Event("visibilitychange"));
    });
    expect(await screen.findByRole("button", { name: `${R5} 예산 외 열기` })).toBeInTheDocument();
    expectSummaryE();
  });

  it("로그아웃에서 만든 E로 로그인(혼자) → /import 본문이 E 그대로, 서버에서 받은 요약이 E 값", async () => {
    const api = renderLoggedIn({ serverPlans: [], localPlans: [makeOffBudgetPlanE()] });
    await screen.findByRole("button", { name: `${R1} 열기` });
    const imports = api.callsTo("POST", "/api/interior-plans/import");
    expect(imports).toHaveLength(1);
    expect((imports[0].body as { plan: unknown }).plan).toStrictEqual(makeOffBudgetPlanE());
    expectSummaryE();
  });

  it("홈 카드(로그인, 서버 E): '우리 집 · 지출 예정 1,800,000원 · 완료 3,700,000원'", async () => {
    renderLoggedIn({ isInHousehold: true, serverPlans: [makeOffBudgetPlanE()], hash: "#/" });
    await waitFor(() =>
      expect(
        within(screen.getByRole("main")).getByRole("link", { name: "인테리어 계획" }),
      ).toHaveAccessibleDescription("우리 집 · 지출 예정 1,800,000원 · 완료 3,700,000원"),
    );
  });
});
