// @vitest-environment jsdom
// 스펙 interior-budget-exclude AC-5(시트·목록·요약 화면)와 AC-4의 시트 연결(체크 → 저장 → 로컬 setItem 1회).
// 계산 값은 interiorOffBudgetTotals.test.ts, 쓰기 입력은 interiorLineWrites.test.ts가 본다. 여기서는 화면 연결만 본다.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { toStoredPlans } from "@/test/interiorPlanFixture";
import {
  makeOffBudgetPlanE,
  makeOffBudgetPlanF,
  makeOffBudgetPlanG,
  makeSimplePlanP,
  r5,
} from "@/test/interiorSimpleFixture";
import { createMemoryStorage } from "@/test/memoryStorage";
import { renderWithQueryClient } from "@/test/renderWithQueryClient";

import type { InteriorItem, InteriorPlanWithItems } from "@/lib/types/interiorPlan";

type User = ReturnType<typeof userEvent.setup>;

const R1 = "도배 육문수 실크 전체";
const R3 = "욕실 하루바스 철거·방수 (1)";
const R5 = "욕실 하루바스 타일 덧방 (2)";
const R11 = "도배 벽지나라 안방 포인트";
const ON_BUDGET = "예산에 반영";

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

async function renderPlan(plan: InteriorPlanWithItems) {
  const storage = createMemoryStorage({ [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans([plan]) });
  stubLoggedOutApi();
  window.location.hash = "#/home/plan-simple";
  renderWithQueryClient(<AppRoutes storage={storage} />);
  await screen.findByRole("button", { name: `${R1} 열기` });
  return storage;
}

const storedR5 = (storage: Storage) =>
  (
    JSON.parse(storage.getItem(INTERIOR_PLANS_STORAGE_KEY) ?? "") as {
      plans: InteriorPlanWithItems[];
    }
  ).plans[0].items.find((item) => item.id === "r5");

const fieldsOf = (item: InteriorItem | undefined) => {
  if (item === undefined) throw new Error("항목 없음");
  const { id, createdAt, updatedAt, ...fields } = item;
  void [id, createdAt, updatedAt];
  return fields;
};

const summary = () => screen.getByRole("region", { name: "요약" });
const headlineValue = (label: string) =>
  within(summary()).getByText(label).nextElementSibling?.textContent;
const detailValue = (label: string) =>
  within(summary()).queryByText(label, { selector: "dt" })?.nextElementSibling?.textContent;
const lineButton = (name: string) => screen.getByRole("button", { name: `${name} 열기` });

async function openLine(user: User, name: string) {
  await user.click(lineButton(name));
  return screen.getByRole("dialog", { name: "줄" });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("AC-5 시트 [예산에 반영] → 목록·요약 (AC-4 시트 연결 포함)", () => {
  it("새 줄 시트의 체크는 켜져 있다", async () => {
    const user = userEvent.setup();
    await renderPlan(makeSimplePlanP());
    await user.click(screen.getByRole("button", { name: "줄 추가" }));
    const dialog = screen.getByRole("dialog", { name: "줄 추가" });
    expect(within(dialog).getByRole("checkbox", { name: ON_BUDGET })).toBeChecked();
  });

  it("P의 R5: 체크만 끄면 [저장] 활성 → 저장 1회로 기존 + isOffBudget: true, 목록·요약에 예산 외 → 다시 켜면 키가 없다", async () => {
    const user = userEvent.setup();
    const storage = await renderPlan(makeSimplePlanP());
    expect(screen.queryByText(/예산 외/)).not.toBeInTheDocument();
    expect(headlineValue("남은 예산")).toBe("2,000,000원");

    let dialog = await openLine(user, R5);
    const check = within(dialog).getByRole("checkbox", { name: ON_BUDGET });
    expect(check).toBeChecked();
    expect(within(dialog).getByRole("button", { name: "저장" })).toBeDisabled();
    await user.click(check);
    expect(within(dialog).getByRole("button", { name: "저장" })).toBeEnabled();

    const setItem = vi.spyOn(storage, "setItem");
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(setItem).toHaveBeenCalledTimes(1);
    // R5는 옛 만원 금액이라 시트 저장이 원 키로 다시 쓴다(ADR-034). 그 밖은 기존 그대로 + 예산 외
    const { quotes, ...restOfR5 } = fieldsOf(r5());
    void quotes;
    expect(fieldsOf(storedR5(storage))).toStrictEqual({
      ...restOfR5,
      quotes: [{ id: "rq5", vendor: "하루바스", amountWon: 2_500_000, memo: "타일 덧방 (2)" }],
      isOffBudget: true,
    });

    expect(lineButton(`${R5} 예산 외`)).toBeInTheDocument();
    expect(headlineValue("남은 예산")).toBe("4,500,000원");
    expect(within(summary()).getByText("예산 외 2,500,000원")).toBeInTheDocument();

    dialog = await openLine(user, `${R5} 예산 외`);
    const reopened = within(dialog).getByRole("checkbox", { name: ON_BUDGET });
    expect(reopened).not.toBeChecked();
    await user.click(reopened);
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(Object.hasOwn(storedR5(storage)!, "isOffBudget")).toBe(false);
    expect(headlineValue("남은 예산")).toBe("2,000,000원");
    expect(screen.queryByText(/예산 외/)).not.toBeInTheDocument();
  });
});

describe("AC-5 예시 E·F·G·총 예산 없음 화면", () => {
  it("E: R5만 예산 외(글자·접근 가능한 이름), R1·R3에는 없다. 요약 예산 외 2,500,000원·남은 예산 4,500,000원", async () => {
    await renderPlan(makeOffBudgetPlanE());
    const r5Button = lineButton(`${R5} 예산 외`);
    expect(within(r5Button).getByText("예산 외")).toBeInTheDocument();
    expect(lineButton(R1)).toBeInTheDocument();
    expect(lineButton(R3)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `${R1} 예산 외 열기` })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `${R3} 예산 외 열기` })).not.toBeInTheDocument();
    expect(headlineValue("남은 예산")).toBe("4,500,000원");
    expect(detailValue("지출 완료")).toBe("3,700,000원");
    expect(within(summary()).getByText("예산 외 2,500,000원")).toBeInTheDocument();
  });

  it("F: 미확정 예산 외 R11에도 글자가 있고, 요약 예산 외는 R5 2,500,000원만이다", async () => {
    await renderPlan(makeOffBudgetPlanF());
    expect(within(lineButton(`${R11} 예산 외`)).getByText("예산 외")).toBeInTheDocument();
    expect(within(summary()).getByText("예산 외 2,500,000원")).toBeInTheDocument();
  });

  it("총 예산이 없어도 예산 외 확정 줄이 있으면 요약에 예산 외 2,500,000원", async () => {
    await renderPlan(makeOffBudgetPlanE({ budget: undefined }));
    expect(within(summary()).getByRole("button", { name: "총 예산 입력" })).toBeInTheDocument();
    expect(within(summary()).getByText("예산 외 2,500,000원")).toBeInTheDocument();
  });

  it("G: 예산 외 줄만 [완료]면 요약에 지출 완료 행이 없고 남은 예산은 4,500,000원", async () => {
    await renderPlan(makeOffBudgetPlanG());
    expect(detailValue("지출 완료")).toBeUndefined();
    expect(headlineValue("남은 예산")).toBe("4,500,000원");
    expect(within(summary()).getByText("예산 외 2,500,000원")).toBeInTheDocument();
  });
});
