// @vitest-environment jsdom
// 항목 일정: 줄 시트의 시작일·끝나는 날 → 항목 `startDate`·`endDate`(저장 형식 그대로), 목록 줄 첫 줄 오른쪽에 "11/3~11/7".
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { toStoredPlans } from "@/test/interiorPlanFixture";
import { captureLineSchedules } from "@/test/interiorPlanScreenGolden";
import { makePlanL, makeSimplePlanP } from "@/test/interiorSimpleFixture";
import { createMemoryStorage } from "@/test/memoryStorage";
import { renderWithQueryClient } from "@/test/renderWithQueryClient";

import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";

const R1 = "도배 육문수 실크 전체";

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
  window.location.hash = `#/home/${plan.id}`;
  renderWithQueryClient(<AppRoutes storage={storage} />);
  await screen.findAllByRole("button", { name: / 열기$/ });
  return storage;
}

const storedItem = (storage: Storage, itemId: string) =>
  (
    JSON.parse(storage.getItem(INTERIOR_PLANS_STORAGE_KEY) ?? "") as {
      plans: InteriorPlanWithItems[];
    }
  ).plans[0].items.find((item) => item.id === itemId);

async function openR1() {
  await userEvent.setup().click(screen.getByRole("button", { name: `${R1} 열기` }));
  return screen.getByRole("dialog");
}

const setDate = (dialog: HTMLElement, label: string, value: string) =>
  fireEvent.change(within(dialog).getByLabelText(label), { target: { value } });

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = "#/";
});

describe("항목 일정", () => {
  it("일정이 있는 항목의 줄만 첫 줄 오른쪽에 일정을 보이고, 여는 버튼이 설명으로 읽는다", async () => {
    await renderPlan(makePlanL());
    expect(captureLineSchedules()).toStrictEqual([
      ["욕실 하루바스 철거·방수 열기", "일정 11/3~11/7"],
      ["욕실 욕실나라 열기", "일정 11/3~11/7"],
      ["욕실 하루바스 타일 덧방 열기", null],
      ["도배 열기", null],
    ]);
    expect(screen.getByRole("button", { name: "욕실 욕실나라 열기" })).toHaveAccessibleDescription(
      /^일정 11\/3~11\/7 순서를 바꾸려면/,
    );
  });

  it("시트에서 시작일·끝나는 날을 넣으면 항목에 저장되고 목록에 보인다. 비우면 키가 없어진다", async () => {
    const storage = await renderPlan(makeSimplePlanP());
    const user = userEvent.setup();

    let dialog = await openR1();
    setDate(dialog, "시작일(선택)", "2026-11-10");
    setDate(dialog, "끝나는 날(선택)", "2026-11-12");
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(storedItem(storage, "r1")).toMatchObject({
      startDate: "2026-11-10",
      endDate: "2026-11-12",
    });
    expect(screen.getByRole("button", { name: `${R1} 열기` })).toHaveTextContent("11/10~11/12");

    dialog = await openR1();
    expect(within(dialog).getByLabelText("시작일(선택)")).toHaveValue("2026-11-10");
    setDate(dialog, "시작일(선택)", "");
    setDate(dialog, "끝나는 날(선택)", "");
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const item = storedItem(storage, "r1")!;
    expect("startDate" in item || "endDate" in item).toBe(false);
    expect(screen.getByRole("button", { name: `${R1} 열기` })).not.toHaveTextContent("일정");
  });

  it("끝나는 날이 시작일보다 앞이면 저장하지 않고 그 칸 아래에 알린다", async () => {
    const storage = await renderPlan(makeSimplePlanP());
    const before = storage.getItem(INTERIOR_PLANS_STORAGE_KEY);

    const dialog = await openR1();
    setDate(dialog, "시작일(선택)", "2026-11-10");
    setDate(dialog, "끝나는 날(선택)", "2026-11-09");
    await userEvent.setup().click(within(dialog).getByRole("button", { name: "저장" }));
    expect(within(dialog).getByLabelText("끝나는 날(선택)")).toHaveAccessibleDescription(
      "끝나는 날은 시작일과 같거나 뒤여야 합니다",
    );
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe(before);
  });
});
