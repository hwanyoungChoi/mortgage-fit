// @vitest-environment jsdom
// 스펙 interior-group-collapse 태스크 1 qa 보강: AC-7(로그아웃, 계획 원문이 이 기기에 있는 경우)·AC-1(묶음 1개).
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { INTERIOR_COLLAPSED_GROUPS_STORAGE_KEY } from "@/lib/utils/interiorGroupCollapseStorage";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { PRIVACY_MODE_STORAGE_KEY } from "@/lib/utils/privacyModeStorage";
import { toStoredPlans } from "@/test/interiorPlanFixture";
import { makeSimplePlanP, r1, r2 } from "@/test/interiorSimpleFixture";
import { createMemoryStorage } from "@/test/memoryStorage";
import { renderWithQueryClient } from "@/test/renderWithQueryClient";

import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";

function stubLoggedOutFetch() {
  const fetchMock = vi.fn(async (input: string) => {
    const isMe = String(input) === "/api/me";
    return new Response(JSON.stringify(isMe ? { user: null } : { error: "notFound" }), {
      status: isMe ? 200 : 404,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function renderPlan(plan: InteriorPlanWithItems, extra: Record<string, string> = {}) {
  const fetchMock = stubLoggedOutFetch();
  const storage = createMemoryStorage({
    [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans([plan]),
    ...extra,
  });
  window.location.hash = `#/home/${plan.id}`;
  renderWithQueryClient(<AppRoutes storage={storage} />);
  await waitFor(() =>
    expect(screen.queryByText("인테리어 계획을 불러오는 중")).not.toBeInTheDocument(),
  );
  return { storage, fetchMock };
}

const groupButton = (trade: string) =>
  screen.getByRole("button", { name: new RegExp(`^${trade}( · \\d+줄)?$`) });

const loanCalculatorKeys = (storage: Storage) => {
  const entries: [string, string | null][] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith("loan-calculator/")) entries.push([key, storage.getItem(key)]);
  }
  return Object.fromEntries(entries);
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("묶음 접기 qa 보강", () => {
  it("AC-7(로그아웃): 접기·펴기 전후 계획 원문을 포함한 loan-calculator/* 중 접힘 키만 바뀌고, fetch는 늘지 않으며 표 글자는 같다", async () => {
    const user = userEvent.setup();
    const { storage, fetchMock } = await renderPlan(makeSimplePlanP(), {
      [PRIVACY_MODE_STORAGE_KEY]: "true",
      [INTERIOR_COLLAPSED_GROUPS_STORAGE_KEY]: '{"other-plan":["도배"]}',
    });
    await user.click(screen.getByRole("radio", { name: "표" }));
    const tableText = screen.getByRole("table").textContent;
    await user.click(screen.getByRole("radio", { name: "목록" }));

    const before = loanCalculatorKeys(storage);
    const fetchCount = fetchMock.mock.calls.length;
    await user.click(groupButton("도배"));
    groupButton("욕실").focus();
    await user.keyboard("{Enter}");
    await user.click(groupButton("도배"));

    expect(fetchMock).toHaveBeenCalledTimes(fetchCount);
    const after = loanCalculatorKeys(storage);
    expect(after[INTERIOR_PLANS_STORAGE_KEY]).toBe(before[INTERIOR_PLANS_STORAGE_KEY]);
    const changedKeys = Object.keys({ ...before, ...after }).filter(
      (key) => before[key] !== after[key],
    );
    expect(changedKeys).toStrictEqual([INTERIOR_COLLAPSED_GROUPS_STORAGE_KEY]);
    expect(after[INTERIOR_COLLAPSED_GROUPS_STORAGE_KEY]).toBe(
      '{"other-plan":["도배"],"plan-simple":["욕실"]}',
    );

    await user.click(screen.getByRole("radio", { name: "표" }));
    expect(screen.getByRole("table").textContent).toBe(tableText);
  });

  it("AC-1(묶음 1개): 제목은 끌기 속성 없는 버튼이고 엔터·스페이스 둘 다로 접고 편다", async () => {
    const user = userEvent.setup();
    await renderPlan(makeSimplePlanP({ items: [r1(), r2()] }));

    const title = groupButton("도배");
    expect(title).not.toHaveAttribute("aria-roledescription");
    expect(title).toHaveAttribute("aria-expanded", "true");
    title.focus();
    await user.keyboard(" ");
    expect(groupButton("도배")).toHaveAttribute("aria-expanded", "false");
    expect(groupButton("도배")).toHaveAccessibleName("도배 · 2줄");
    await user.keyboard("{Enter}");
    expect(groupButton("도배")).toHaveAttribute("aria-expanded", "true");
    await user.keyboard(" ");
    expect(groupButton("도배")).toHaveAttribute("aria-expanded", "false");
  });
});
