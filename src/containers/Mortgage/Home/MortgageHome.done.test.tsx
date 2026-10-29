// @vitest-environment jsdom
// 구매 완료: 목록 [완료] 체크 → 지출 예정에서 빠지고 지출 완료로 모인다. 남은 예산 = 총 예산 − 지출 예정 − 지출 완료.
// 저장 형식은 그대로이고 항목 `status`("done")를 쓴다. [확정]을 끄면 완료도 풀린다.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { toStoredPlans } from "@/test/interiorPlanFixture";
import { makeSimplePlanP } from "@/test/interiorSimpleFixture";
import { createMemoryStorage } from "@/test/memoryStorage";
import { renderWithQueryClient } from "@/test/renderWithQueryClient";

import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";

const R1 = "도배 육문수 실크 전체";
const R4 = "욕실 욕실나라 철거·방수 (1)";

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

async function renderPlanP() {
  const storage = createMemoryStorage({
    [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans([makeSimplePlanP()]),
  });
  stubLoggedOutApi();
  window.location.hash = "#/home/plan-simple";
  renderWithQueryClient(<AppRoutes storage={storage} />);
  await screen.findByRole("checkbox", { name: `${R1} 완료` });
  return storage;
}

const storedItem = (storage: Storage, itemId: string) =>
  (
    JSON.parse(storage.getItem(INTERIOR_PLANS_STORAGE_KEY) ?? "") as {
      plans: InteriorPlanWithItems[];
    }
  ).plans[0].items.find((item) => item.id === itemId);

const summary = () => screen.getByRole("region", { name: "요약" });

const headlineValue = (label: string) =>
  within(summary()).getByText(label).nextElementSibling?.textContent;

const detailValue = (label: string) =>
  within(summary()).queryByText(label, { selector: "dt" })?.nextElementSibling?.textContent;

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = "#/";
});

describe("구매 완료 체크", () => {
  it("완료가 없으면 지출 완료를 그리지 않는다(기존 계획 화면 그대로)", async () => {
    await renderPlanP();
    expect(headlineValue("지출 예정")).toBe("8,000,000원");
    expect(detailValue("지출 완료")).toBeUndefined();
  });

  it("확정 줄 [완료] → 지출 예정에서 빠지고 지출 완료로, 남은 예산은 그대로. [확정]을 끄면 완료도 풀린다", async () => {
    const user = userEvent.setup();
    const storage = await renderPlanP();

    await user.click(screen.getByRole("checkbox", { name: `${R1} 완료` }));
    await waitFor(() => expect(detailValue("지출 완료")).toBe("1,800,000원"));
    expect(headlineValue("지출 예정")).toBe("6,200,000원");
    expect(headlineValue("남은 예산")).toBe("2,000,000원");
    expect(storedItem(storage, "r1")).toMatchObject({ status: "done", confirmedQuoteId: "rq1" });

    await user.click(screen.getByRole("checkbox", { name: `${R1} 확정` }));
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: `${R1} 완료` })).not.toBeChecked(),
    );
    expect(detailValue("지출 완료")).toBeUndefined();
    expect(storedItem(storage, "r1")?.status).toBe("planned");
  });

  it("미확정 줄 [완료] → 그 견적을 확정하고 완료, 남은 예산에서 빠진다", async () => {
    const user = userEvent.setup();
    await renderPlanP();

    await user.click(screen.getByRole("checkbox", { name: `${R4} 완료` }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: `${R4} 확정` })).toBeChecked());
    expect(detailValue("지출 완료")).toBe("4,000,000원");
    expect(headlineValue("지출 예정")).toBe("8,000,000원");
    expect(headlineValue("남은 예산")).toBe("예산 초과 2,000,000원");
  });
});
