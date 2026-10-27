// @vitest-environment jsdom
// ADR-034 조건 4·5·9·ADR-033 조건 5 화면: 2단계(원 입력) 시트가 원 단위 금액을 다루는 규칙.
// - 줄 시트: 저장된 금액을 원 글자로 채운다(옛 만원 `amount`도 원으로). 저장하면 그 견적은 `amountWon`만 남는다(옛 `amount` 지움).
// - 계획 관리 시트: 총 예산도 원 글자로 채우고, 바뀐 칸만 보낸다(이름만 고치면 예산 키를 보내지 않는다). 예산을 바꾸면 `budgetWon`.
// - 원 입력 칸에 1만원 미만(1~9,999)이 있으면 칸 아래 "원 단위입니다"(저장은 막지 않는다).
// 키가 없어야 하는 결과는 toStrictEqual·Object.hasOwn으로 본다.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { createFakePlanApi } from "@/test/fakePlanApi";
import { toStoredPlans } from "@/test/interiorPlanFixture";
import { makePlanM } from "@/test/interiorSimpleFixture";
import { createMemoryStorage } from "@/test/memoryStorage";
import { renderWithQueryClient } from "@/test/renderWithQueryClient";

import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";

const M_HASH = "#/home/plan-m";
const AMOUNT = "견적(비우면 미정)";
const BUDGET = "총 예산(선택)";
const WON_NOTICE = "원 단위입니다";

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

describe("줄 시트 2단계 — 원 단위 견적 채우기 (예시 M, 로그아웃)", () => {
  it.each([
    ["도배 육문수", "8,000,000", false],
    ["욕실 하루바스", "1,234,500", false],
    ["욕실 욕실나라", "1,235,000", false],
    ["조명 빛나라조명", "999", true],
    ["조명 한빛전기", "", false],
  ])("%s → 견적 칸 %j, '원 단위입니다' %s, 닫기만 하면 쓰기 0", async (name, value, hasNotice) => {
    const storage = storageWith([makePlanM()]);
    const raw = storage.getItem(INTERIOR_PLANS_STORAGE_KEY);
    await renderLoggedOut(storage);
    const { user, dialog } = await openLineSheet(name);
    expect(within(dialog).getByLabelText(AMOUNT)).toHaveValue(value);
    expect(within(dialog).queryByText(WON_NOTICE) !== null).toBe(hasNotice);
    expect(within(dialog).getByRole("button", { name: "저장" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "닫기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe(raw);
  });

  it("M2(1,234,500원)의 업체만 고쳐 저장 → amountWon 1,234,500 그대로·업체만 바뀜(형제 줄 그대로)", async () => {
    const storage = storageWith([makePlanM()]);
    await renderLoggedOut(storage);
    const { user, dialog } = await openLineSheet("욕실 하루바스");
    const vendor = within(dialog).getByLabelText("업체");
    await user.clear(vendor);
    await user.type(vendor, "하루바스2");
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const plan = storedPlan(storage);
    expect(plan.items[1].quotes).toStrictEqual([
      { id: "mq2", vendor: "하루바스2", amountWon: 1_234_500 },
    ]);
    expect(plan.items.filter((_, index) => index !== 1)).toStrictEqual(
      makePlanM().items.filter((_, index) => index !== 1),
    );
  });

  it("M1(옛 만원 800)의 업체만 고쳐 저장 → amountWon 8,000,000만 남고 amount 키가 없다", async () => {
    const storage = storageWith([makePlanM()]);
    await renderLoggedOut(storage);
    const { user, dialog } = await openLineSheet("도배 육문수");
    await user.type(within(dialog).getByLabelText("업체"), "2");
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const [quote] = storedPlan(storage).items[0].quotes ?? [];
    expect(quote).toStrictEqual({ id: "mq1", vendor: "육문수2", amountWon: 8_000_000 });
    expect(Object.hasOwn(quote, "amount")).toBe(false);
  });

  it("M1 금액을 지우고 저장 → 금액 키 둘 다 없음(미정), 요약 '금액 미정 2건 제외'", async () => {
    const storage = storageWith([makePlanM()]);
    await renderLoggedOut(storage);
    const { user, dialog } = await openLineSheet("도배 육문수");
    await user.clear(within(dialog).getByLabelText(AMOUNT));
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const [quote] = storedPlan(storage).items[0].quotes ?? [];
    expect(quote).toStrictEqual({ id: "mq1", vendor: "육문수" });
    expect(Object.hasOwn(quote, "amount")).toBe(false);
    expect(Object.hasOwn(quote, "amountWon")).toBe(false);
    expect(
      within(screen.getByRole("region", { name: "요약" })).getByText("금액 미정 2건 제외"),
    ).toBeInTheDocument();
  });

  it("M5(미정)에 0을 넣어 저장 → amountWon: 0(미정 아님), 칸 아래 '원 단위입니다' 없음", async () => {
    const storage = storageWith([makePlanM()]);
    await renderLoggedOut(storage);
    const { user, dialog } = await openLineSheet("조명 한빛전기");
    await user.type(within(dialog).getByLabelText(AMOUNT), "0");
    expect(within(dialog).queryByText(WON_NOTICE)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(storedPlan(storage).items[4].quotes).toStrictEqual([
      { id: "mq5", vendor: "한빛전기", amountWon: 0 },
    ]);
    expect(
      within(screen.getByRole("region", { name: "요약" })).queryByText(/금액 미정/),
    ).not.toBeInTheDocument();
  });

  it.each([
    ["1", true],
    ["9999", true],
    ["10000", false],
    ["0", false],
  ])("견적 칸 %j → '원 단위입니다' %s, 저장은 막지 않는다", async (typed, hasNotice) => {
    const storage = storageWith([makePlanM()]);
    await renderLoggedOut(storage);
    const { user, dialog } = await openLineSheet("조명 한빛전기");
    const amount = within(dialog).getByLabelText(AMOUNT);
    await user.type(amount, typed);
    expect(within(dialog).queryByText(WON_NOTICE) !== null).toBe(hasNotice);
    if (hasNotice) expect(amount).toHaveAccessibleDescription(expect.stringContaining(WON_NOTICE));
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(storedPlan(storage).items[4].quotes?.[0].amountWon).toBe(Number(typed));
  });

  it("힌트는 억·만 형식: 123456789000 → '1,234억 5,678만 9,000원'", async () => {
    await renderLoggedOut(storageWith([makePlanM()]));
    const { user, dialog } = await openLineSheet("조명 한빛전기");
    const amount = within(dialog).getByLabelText(AMOUNT);
    await user.type(amount, "123456789000");
    expect(amount).toHaveValue("123,456,789,000");
    expect(amount).toHaveAccessibleDescription(expect.stringContaining("1,234억 5,678만 9,000원"));
  });
});

describe("계획 관리 시트 2단계 — 총 예산 원 채우기·바뀐 칸만 보내기 (로그아웃)", () => {
  it.each<[string, Pick<InteriorPlanWithItems, "budget" | "budgetWon">, string]>([
    ["{ budget: 1000 } → '10,000,000'", { budget: 1000 }, "10,000,000"],
    ["{ budgetWon: 12000000 } → '12,000,000'", { budgetWon: 12_000_000 }, "12,000,000"],
    ["{ budgetWon: 12345000 } → '12,345,000'", { budgetWon: 12_345_000 }, "12,345,000"],
    ["총 예산 없음 → 빈칸", {}, ""],
  ])("%s", async (_, budgets, value) => {
    await renderLoggedOut(storageWith([planMWith(budgets)]));
    const { dialog } = await openSettingsSheet();
    expect(within(dialog).getByLabelText(BUDGET)).toHaveValue(value);
    expect(within(dialog).queryByText(WON_NOTICE)).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "저장" })).toBeDisabled();
  });

  it.each<[string, Pick<InteriorPlanWithItems, "budget" | "budgetWon">]>([
    ["{ budgetWon: 12345000 }", { budgetWon: 12_345_000 }],
    ["{ budget: 1000 }", { budget: 1000 }],
  ])("%s에서 이름만 고쳐 저장 → 원문의 예산 키 그대로", async (_, budgets) => {
    const storage = storageWith([planMWith(budgets)]);
    await renderLoggedOut(storage);
    const { user, dialog } = await openSettingsSheet();
    const name = within(dialog).getByLabelText("계획 이름");
    await user.clear(name);
    await user.type(name, "새 이름");
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(storedPlan(storage).name).toBe("새 이름"));
    const plan = storedPlan(storage);
    expect([plan.budget, plan.budgetWon]).toEqual([budgets.budget, budgets.budgetWon]);
    expect(Object.hasOwn(plan, "budget")).toBe(Object.hasOwn(budgets, "budget"));
    expect(Object.hasOwn(plan, "budgetWon")).toBe(Object.hasOwn(budgets, "budgetWon"));
  });

  it("{ budget: 1000 }에서 총 예산 12,345,000을 입력해 저장 → budgetWon 12345000, budget 키 없음", async () => {
    const storage = storageWith([planMWith({ budget: 1000 })]);
    await renderLoggedOut(storage);
    const { user, dialog } = await openSettingsSheet();
    const budget = within(dialog).getByLabelText(BUDGET);
    await user.clear(budget);
    await user.type(budget, "12345000");
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(storedPlan(storage).budgetWon).toBe(12_345_000));
    expect(Object.hasOwn(storedPlan(storage), "budget")).toBe(false);
  });

  it("총 예산 999 → '원 단위입니다' 안내, 저장하면 budgetWon 999 / 0 → '0보다 큰 금액을 입력하세요', 쓰기 0회", async () => {
    const storage = storageWith([planMWith({})]);
    await renderLoggedOut(storage);
    const { user, dialog } = await openSettingsSheet();
    const budget = within(dialog).getByLabelText(BUDGET);
    await user.type(budget, "0");
    const raw = storage.getItem(INTERIOR_PLANS_STORAGE_KEY);
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    expect(budget).toHaveAccessibleDescription(
      expect.stringContaining("0보다 큰 금액을 입력하세요"),
    );
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe(raw);
    await user.clear(budget);
    await user.type(budget, "999");
    expect(within(dialog).getByText(WON_NOTICE)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(storedPlan(storage).budgetWon).toBe(999));
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

  it("총 예산을 바꾸면 { budget: null, budgetWon }, 비우면 { budget: null, budgetWon: null }", async () => {
    const api = await renderLoggedIn(planMWith({ budgetWon: 12_000_000 }));
    const first = await openSettingsSheet();
    const budget = within(first.dialog).getByLabelText(BUDGET);
    await first.user.clear(budget);
    await first.user.type(budget, "5000000");
    await first.user.click(within(first.dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(patchBodies(api)).toHaveLength(1));
    expect(patchBodies(api)[0]).toStrictEqual({ plan: { budget: null, budgetWon: 5_000_000 } });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const second = await openSettingsSheet();
    await second.user.clear(within(second.dialog).getByLabelText(BUDGET));
    await second.user.click(within(second.dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(patchBodies(api)).toHaveLength(2));
    expect(patchBodies(api)[1]).toStrictEqual({ plan: { budget: null, budgetWon: null } });
  });
});
