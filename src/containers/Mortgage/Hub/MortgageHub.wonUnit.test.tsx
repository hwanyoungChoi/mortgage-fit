// @vitest-environment jsdom
// ADR-034 조건 8·9(qa Q4·Q10) 허브: 예시 M의 우리 집 줄은 요약·표와 같은 "지출 예정 10,469,500원 · 미정 1건"이고,
// 저장 목록에서 가리기를 켜 둬도 우리 집 줄의 원 숫자는 그대로다(U6). 계산기 카드(만원)와 우리 집 줄(원)이 나란한 것은 허용한다.
import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { PRIVACY_MODE_STORAGE_KEY } from "@/lib/utils/privacyModeStorage";
import { createFakePlanApi } from "@/test/fakePlanApi";
import { toStoredPlans } from "@/test/interiorPlanFixture";
import { makePlanM } from "@/test/interiorSimpleFixture";
import { createMemoryStorage } from "@/test/memoryStorage";

import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";

function renderHub(plans: InteriorPlanWithItems[], extra: Record<string, string> = {}) {
  const storage = createMemoryStorage({
    [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans(plans),
    ...extra,
  });
  const api = createFakePlanApi({ userId: null, plans: [] });
  window.location.hash = "#/";
  render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });
  return storage;
}

const homeCard = () =>
  within(screen.getByRole("main")).getByRole("link", { name: "인테리어 계획" });

async function expectHomeDescription(text: string) {
  await waitFor(() => expect(homeCard()).toHaveAccessibleDescription(text));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("홈 허브 — 원 단위 (예시 M)", () => {
  it("'섞인 집 · 지출 예정 10,469,500원 · 미정 1건'(요약·표와 같은 숫자), 열기만 하면 쓰지 않는다", async () => {
    const storage = renderHub([makePlanM()]);
    const raw = storage.getItem(INTERIOR_PLANS_STORAGE_KEY);
    await expectHomeDescription("섞인 집 · 지출 예정 10,469,500원 · 미정 1건");
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe(raw);
  });

  it("저장 목록에서 가리기를 켜 둬도 우리 집 줄은 원 숫자 그대로(U6)", async () => {
    renderHub([makePlanM()], { [PRIVACY_MODE_STORAGE_KEY]: "true" });
    await expectHomeDescription("섞인 집 · 지출 예정 10,469,500원 · 미정 1건");
    expect(homeCard().innerHTML).not.toContain("가려짐");
  });
});
