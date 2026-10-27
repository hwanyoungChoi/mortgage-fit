// @vitest-environment jsdom
// QA 보강: 우리 집 목록 줄의 글자 순서(첫 줄 세부내용, 그 아래 업체). 기존 테스트는 로그아웃 출처만 봤다.
// - 로그인(서버 출처)도 같은 순서다.
// - 가리기 중 세부내용 없는 줄은 업체 한 줄뿐이고 빈 줄·••• 세부내용 줄이 없다.
// - 가리기 중 세부내용 있는 줄은 업체가 첫 줄이고 세부내용 값이 DOM에 없다(옛 계획 L).
// - 세부내용 200자는 첫 줄에 잘리지 않고 다 들어 있다(두 줄 자르기는 CSS다).
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { PRIVACY_MODE_STORAGE_KEY } from "@/lib/utils/privacyModeStorage";
import { SESSION_HINT_STORAGE_KEY } from "@/lib/utils/sessionHintStorage";
import { createFakePlanApi } from "@/test/fakePlanApi";
import { toStoredPlans } from "@/test/interiorPlanFixture";
import { makePlanL, makeSimplePlanP } from "@/test/interiorSimpleFixture";
import { createMemoryStorage } from "@/test/memoryStorage";
import { renderWithQueryClient } from "@/test/renderWithQueryClient";

import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";

const L_HASH = "#/home/plan-l";
const P_HASH = "#/home/plan-simple";

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

async function renderLoggedOut(plans: InteriorPlanWithItems[], hash: string, isMasked = false) {
  stubLoggedOutApi();
  const storage = createMemoryStorage({
    [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans(plans),
    ...(isMasked ? { [PRIVACY_MODE_STORAGE_KEY]: "true" } : {}),
  });
  window.location.hash = hash;
  const result = renderWithQueryClient(<AppRoutes storage={storage} />);
  await waitFor(() =>
    expect(screen.queryByText("인테리어 계획을 불러오는 중")).not.toBeInTheDocument(),
  );
  return result;
}

/** 여는 버튼 왼쪽 글자 묶음의 줄 글자들(금액 제외). 같은 이름이 여럿이면 index번째 */
const rowTexts = (openName: string, index = 0) =>
  Array.from(
    screen.getAllByRole("button", { name: openName })[index].firstElementChild?.children ?? [],
    (line) => line.textContent,
  );

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("줄 글자 순서 (QA 보강)", () => {
  it("로그인(서버 출처) L도 첫 줄 세부내용·그 아래 업체, 세부내용 없으면 업체가 첫 줄", async () => {
    const api = createFakePlanApi({ userId: "user-a", plans: [makePlanL()] });
    window.location.hash = L_HASH;
    render(<AppRoutes storage={createMemoryStorage({ [SESSION_HINT_STORAGE_KEY]: "1" })} />, {
      wrapper: api.wrapper,
    });
    await screen.findByRole("button", { name: "욕실 하루바스 철거·방수 열기" });

    expect(rowTexts("욕실 하루바스 철거·방수 열기")).toEqual(["철거·방수", "하루바스"]);
    expect(rowTexts("욕실 욕실나라 열기")).toEqual(["욕실나라"]);
    expect(rowTexts("욕실 하루바스 타일 덧방 열기")).toEqual(["타일 덧방", "하루바스"]);
  });

  it("가리기 중 L: 세부내용 있는 줄은 업체 → ••• 세부내용, 세부내용 없는 줄은 업체가 첫 줄이고 ••• 세부내용 줄이 없다", async () => {
    const { container } = await renderLoggedOut([makePlanL()], L_HASH, true);

    // 가리기 중 이름에는 세부내용이 없어 X(q1)·Z(q3) 줄이 같은 이름이다. 목록 순서는 X → 욕실나라 → Z.
    const withDetail = rowTexts("욕실 하루바스 열기", 0);
    expect(withDetail.slice(0, 2)).toEqual(["하루바스", "•••가려짐"]);
    expect(rowTexts("욕실 하루바스 열기", 1)).toEqual(["하루바스", "•••가려짐"]);
    // 세부내용 없는 욕실나라 줄: 첫 줄 업체뿐이다(비고는 목록에 없다). 빈 첫 줄이 없다.
    const buttons = screen.getAllByRole("button", { name: "욕실 욕실나라 열기" });
    expect(buttons).toHaveLength(1);
    const withoutDetail = rowTexts("욕실 욕실나라 열기");
    expect(withoutDetail[0]).toBe("욕실나라");
    expect(withoutDetail).not.toContain("");
    expect(withoutDetail.length).toBeLessThan(withDetail.length);
    for (const secret of ["철거·방수", "타일 덧방"])
      expect(container.innerHTML).not.toContain(secret);
  });

  it("가리기 중 P: 모든 줄의 첫 줄은 업체다", async () => {
    await renderLoggedOut([makeSimplePlanP()], P_HASH, true);

    expect(rowTexts("도배 육문수 열기")[0]).toBe("육문수");
    expect(rowTexts("도배 동네도배 열기")[0]).toBe("동네도배");
    expect(rowTexts("욕실 하루바스 열기", 0)[0]).toBe("하루바스");
    expect(rowTexts("욕실 하루바스 열기", 1)[0]).toBe("하루바스");
  });

  it("세부내용 200자는 첫 줄에 잘리지 않고 다 있고, 업체는 그 아래 줄이다", async () => {
    const longDetail = "가".repeat(200);
    const plan = makeSimplePlanP();
    const [first, ...rest] = plan.items;
    const longPlan: InteriorPlanWithItems = {
      ...plan,
      items: [
        {
          ...first,
          quotes: (first.quotes ?? []).map((quote, index) =>
            index === 0 ? { ...quote, memo: longDetail } : quote,
          ),
        },
        ...rest,
      ],
    };
    await renderLoggedOut([longPlan], P_HASH);

    const vendor = first.quotes?.[0].vendor ?? "";
    expect(rowTexts(`${first.trade} ${vendor} ${longDetail} 열기`).slice(0, 2)).toEqual([
      longDetail,
      vendor,
    ]);
  });
});
