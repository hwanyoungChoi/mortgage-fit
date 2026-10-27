// @vitest-environment jsdom
// ADR-034 조건 4·5·6(qa Q8·Q9) 화면: 1단계(만원 입력) 시트가 원 단위 금액을 다루는 규칙.
// - 줄 시트: 만원으로 떨어지는 원 금액은 만원으로 채우고, 아니면 빈칸 + 안내. 저장하면 그 견적은 `amount`(만원)만 남는다.
// - 계획 관리 시트: 총 예산도 같은 규칙. 바뀐 칸만 보낸다(이름만 고치면 예산 키를 보내지 않아 원 단위 총 예산이 남는다).
// 안내는 2단계(원 입력)에서 지우는 임시 코드다. 키가 없어야 하는 결과는 toStrictEqual·Object.hasOwn으로 본다.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { WON_ONLY_AMOUNT_NOTICE } from "@/lib/utils/manwonInputOfWon";
import { createFakePlanApi } from "@/test/fakePlanApi";
import { toStoredPlans } from "@/test/interiorPlanFixture";
import { makePlanM } from "@/test/interiorSimpleFixture";
import { createMemoryStorage } from "@/test/memoryStorage";
import { renderWithQueryClient } from "@/test/renderWithQueryClient";

import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";

const M_HASH = "#/home/plan-m";

function stubLoggedOutApi() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const isMe = String(input) === "/api/me";
      return new Response(JSON.stringify(isMe ? { user: null } : { error: "notFound" }), {
        status: isMe ? 200 : 404,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}

const storageWith = (plans: InteriorPlanWithItems[]) =>
  createMemoryStorage({ [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans(plans) });

async function renderLoggedOut(storage: Storage) {
  stubLoggedOutApi();
  window.location.hash = M_HASH;
  renderWithQueryClient(<AppRoutes storage={storage} />);
  await waitFor(() =>
    expect(screen.queryByText("인테리어 계획을 불러오는 중")).not.toBeInTheDocument(),
  );
}

const storedPlan = (storage: Storage) =>
  (
    JSON.parse(storage.getItem(INTERIOR_PLANS_STORAGE_KEY) ?? '{"plans":[]}') as {
      plans: InteriorPlanWithItems[];
    }
  ).plans[0];

/** M에서 총 예산 키만 바꾼다 */
const planMWith = (budgets: Pick<InteriorPlanWithItems, "budget" | "budgetWon">) => {
  const { budget, ...rest } = makePlanM();
  void budget;
  return { ...rest, ...budgets };
};

const openButton = (name: string) => screen.getByRole("button", { name: `${name} 열기` });

async function openLineSheet(name: string) {
  const user = userEvent.setup();
  await user.click(openButton(name));
  return { user, dialog: screen.getByRole("dialog", { name: "줄" }) };
}

async function openSettingsSheet() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "계획 관리" }));
  return { user, dialog: screen.getByRole("dialog", { name: "계획 관리" }) };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("줄 시트 1단계 — 원 단위 견적 채우기 (예시 M, 로그아웃)", () => {
  it.each([
    ["도배 육문수", "800", false],
    ["욕실 하루바스", "", true],
    ["욕실 욕실나라", "", true],
    ["조명 빛나라조명", "", true],
    ["조명 한빛전기", "", false],
  ])("%s → 견적 칸 %j, 안내 %s, 닫기만 하면 쓰기 0", async (name, value, hasNotice) => {
    const storage = storageWith([makePlanM()]);
    const raw = storage.getItem(INTERIOR_PLANS_STORAGE_KEY);
    await renderLoggedOut(storage);
    const { user, dialog } = await openLineSheet(name);
    expect(within(dialog).getByLabelText("견적")).toHaveValue(value);
    expect(within(dialog).queryByText(WON_ONLY_AMOUNT_NOTICE) !== null).toBe(hasNotice);
    expect(within(dialog).getByRole("button", { name: "저장" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "닫기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe(raw);
  });

  it("M2(1,234,500원)의 업체만 고쳐 저장하면 견적 필수 오류로 쓰지 않고, 123을 넣어 저장하면 amount 123만 남는다(형제 줄 그대로)", async () => {
    const storage = storageWith([makePlanM()]);
    const raw = storage.getItem(INTERIOR_PLANS_STORAGE_KEY);
    await renderLoggedOut(storage);
    const { user, dialog } = await openLineSheet("욕실 하루바스");
    const vendor = within(dialog).getByLabelText("업체");
    await user.clear(vendor);
    await user.type(vendor, "하루바스2");
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    const amount = within(dialog).getByLabelText("견적");
    expect(amount).toHaveAccessibleDescription(expect.stringContaining("견적 금액을 입력하세요"));
    expect(amount).toHaveFocus();
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe(raw);

    await user.type(amount, "123");
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const plan = storedPlan(storage);
    expect(plan.items[1].quotes).toStrictEqual([{ id: "mq2", vendor: "하루바스2", amount: 123 }]);
    expect(plan.items.filter((_, index) => index !== 1)).toStrictEqual(
      makePlanM().items.filter((_, index) => index !== 1),
    );
  });
});

describe("계획 관리 시트 1단계 — 총 예산 채우기·바뀐 칸만 보내기 (로그아웃)", () => {
  it.each<[string, Pick<InteriorPlanWithItems, "budget" | "budgetWon">, string, boolean]>([
    ["{ budget: 1000 } → '1,000', 안내 없음", { budget: 1000 }, "1,000", false],
    ["{ budgetWon: 12000000 } → '1,200', 안내 없음", { budgetWon: 12_000_000 }, "1,200", false],
    ["{ budgetWon: 12345000 } → 빈칸, 안내", { budgetWon: 12_345_000 }, "", true],
    ["총 예산 없음 → 빈칸, 안내 없음", {}, "", false],
  ])("%s", async (_, budgets, value, hasNotice) => {
    await renderLoggedOut(storageWith([planMWith(budgets)]));
    const { dialog } = await openSettingsSheet();
    expect(within(dialog).getByLabelText("총 예산(선택)")).toHaveValue(value);
    expect(within(dialog).queryByText(WON_ONLY_AMOUNT_NOTICE) !== null).toBe(hasNotice);
    expect(within(dialog).getByRole("button", { name: "저장" })).toBeDisabled();
  });

  it("{ budgetWon: 12345000 }에서 이름만 고쳐 저장 → 원문에 budgetWon 그대로, budget 키 없음", async () => {
    const storage = storageWith([planMWith({ budgetWon: 12_345_000 })]);
    await renderLoggedOut(storage);
    const { user, dialog } = await openSettingsSheet();
    const name = within(dialog).getByLabelText("계획 이름");
    await user.clear(name);
    await user.type(name, "새 이름");
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(storedPlan(storage).name).toBe("새 이름"));
    const plan = storedPlan(storage);
    expect(plan.budgetWon).toBe(12_345_000);
    expect(Object.hasOwn(plan, "budget")).toBe(false);
  });

  it("{ budgetWon: 12345000 }에서 총 예산 1,234를 입력해 저장 → budget 1234, budgetWon 키 없음", async () => {
    const storage = storageWith([planMWith({ budgetWon: 12_345_000 })]);
    await renderLoggedOut(storage);
    const { user, dialog } = await openSettingsSheet();
    await user.type(within(dialog).getByLabelText("총 예산(선택)"), "1234");
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(storedPlan(storage).budget).toBe(1234));
    expect(Object.hasOwn(storedPlan(storage), "budgetWon")).toBe(false);
  });
});

describe("계획 관리 시트 — PATCH 본문은 바뀐 칸만 (로그인 혼자)", () => {
  async function renderLoggedIn(plan: InteriorPlanWithItems) {
    const api = createFakePlanApi({ userId: "user-a", plans: [plan] });
    window.location.hash = M_HASH;
    render(<AppRoutes storage={createMemoryStorage()} />, { wrapper: api.wrapper });
    await screen.findByRole("button", { name: "계획 관리" });
    return api;
  }

  const patchBodies = (api: ReturnType<typeof createFakePlanApi>) =>
    api.callsTo("PATCH", "/api/interior-plans/plan-m").map((call) => call.body);

  it("이름만 고치면 { plan: { name } }(예산 키 없음), 서버의 budgetWon 그대로", async () => {
    const api = await renderLoggedIn(planMWith({ budgetWon: 12_345_000 }));
    const { user, dialog } = await openSettingsSheet();
    const name = within(dialog).getByLabelText("계획 이름");
    await user.clear(name);
    await user.type(name, "새 이름");
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(patchBodies(api)).toHaveLength(1));
    expect(patchBodies(api)[0]).toStrictEqual({ plan: { name: "새 이름" } });
    expect(api.server.plans[0].budgetWon).toBe(12_345_000);
  });

  it("총 예산을 바꾸면 { budget, budgetWon: null }, 비우면 { budget: null, budgetWon: null }", async () => {
    const api = await renderLoggedIn(planMWith({ budgetWon: 12_000_000 }));
    const first = await openSettingsSheet();
    const budget = within(first.dialog).getByLabelText("총 예산(선택)");
    await first.user.clear(budget);
    await first.user.type(budget, "500");
    await first.user.click(within(first.dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(patchBodies(api)).toHaveLength(1));
    expect(patchBodies(api)[0]).toStrictEqual({ plan: { budget: 500, budgetWon: null } });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const second = await openSettingsSheet();
    await second.user.clear(within(second.dialog).getByLabelText("총 예산(선택)"));
    await second.user.click(within(second.dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(patchBodies(api)).toHaveLength(2));
    expect(patchBodies(api)[1]).toStrictEqual({ plan: { budget: null, budgetWon: null } });
  });
});
