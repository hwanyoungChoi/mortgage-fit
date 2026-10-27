// @vitest-environment jsdom
// 스펙 interior-tbd-amount AC-4 허브: 확정 미정 줄이 있으면 "{이름} · 지출 예정 800만원 · 미정 1건", 가리기 중에는
// 미정 조각을 구분자까지 통째로 뺀다("우리 집 · 지출 예정 •••가려짐"). 로그아웃 로컬 계획으로 본다.
// 순수 함수(건수)는 summarizeHub.test.ts가 본다.
import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { PRIVACY_MODE_STORAGE_KEY } from "@/lib/utils/privacyModeStorage";
import { createFakePlanApi } from "@/test/fakePlanApi";
import { toStoredPlans } from "@/test/interiorPlanFixture";
import { makeSimplePlanP, makeSimplePlanPPlus, r6, r7 } from "@/test/interiorSimpleFixture";
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
  within(screen.getByRole("main")).getByRole("link", { name: "우리 집 인테리어" });

async function expectHomeDescription(text: string) {
  await waitFor(() => expect(homeCard()).toHaveAccessibleDescription(text));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("홈 허브 — 금액 미정 (AC-4)", () => {
  it.each([
    ["P⁺", makeSimplePlanPPlus(), "우리 집 · 지출 예정 800만원 · 미정 1건"],
    [
      "확정이 R6뿐",
      makeSimplePlanP({ items: [r6(), r7()] }),
      "우리 집 · 지출 예정 0만원 · 미정 1건",
    ],
    ["P(미정 없음)", makeSimplePlanP(), "우리 집 · 지출 예정 800만원"],
  ])("%s → '%s'", async (_name, plan, text) => {
    renderHub([plan]);
    await expectHomeDescription(text);
  });

  it("가리기를 켜면 '우리 집 · 지출 예정 •••가려짐'이고 innerHTML에 '미정'이 없다", async () => {
    renderHub([makeSimplePlanPPlus()], { [PRIVACY_MODE_STORAGE_KEY]: "true" });
    // 보조기기 설명은 aria-hidden인 •••를 빼고 읽는다. 화면 글자는 요약 줄 요소의 textContent로 본다
    await expectHomeDescription("우리 집 · 지출 예정 가려짐");
    const descriptionId = homeCard().getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(descriptionId)?.textContent).toBe(
      "우리 집 · 지출 예정 •••가려짐",
    );
    expect(screen.getByRole("main").innerHTML).not.toContain("미정");
  });
});
