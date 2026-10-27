// @vitest-environment jsdom
// 스펙 interior-simple qa 보강(태스크 1-4): 기존 줄 테스트가 가르지 못한 연결.
// - 공간이 여럿인 옛 계획 L에서 [줄 추가]는 첫 공간(s0)의 견적 1개 항목이고 그 묶음 끝에 붙는다(A4, 쓰기 규칙 "줄 추가").
//   P는 공간이 하나뿐이라 `plan.spaces[0]`이 아닌 공간을 써도 잡히지 않는다.
// - 확정 토글 실패 경로(A7, 옛 테스트의 404·401·원상 복구를 줄 모델로): 다른 탭이 지운 항목(notFound), 가구 404, 로그인 만료 401.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { SESSION_HINT_STORAGE_KEY } from "@/lib/utils/sessionHintStorage";
import { createFakePlanApi, errorResponse } from "@/test/fakePlanApi";
import { toStoredPlans } from "@/test/interiorPlanFixture";
import { legacyX, legacyY, makePlanL, makeSimplePlanP } from "@/test/interiorSimpleFixture";
import { createMemoryStorage } from "@/test/memoryStorage";
import { renderWithQueryClient } from "@/test/renderWithQueryClient";

import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";

const R4_CHECK = "욕실 욕실나라 철거·방수 (1) 확정";
const X_Q2_CHECK = "욕실 욕실나라 확정";

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

async function renderLoggedOut(storage: Storage, hash: string) {
  stubLoggedOutApi();
  window.location.hash = hash;
  renderWithQueryClient(<AppRoutes storage={storage} />);
  await waitFor(() =>
    expect(screen.queryByText("인테리어 계획을 불러오는 중")).not.toBeInTheDocument(),
  );
}

const storedPlans = (storage: Storage) =>
  (
    JSON.parse(storage.getItem(INTERIOR_PLANS_STORAGE_KEY) ?? '{"plans":[]}') as {
      plans: InteriorPlanWithItems[];
    }
  ).plans;

const headlineValue = (label: string) =>
  within(screen.getByRole("region", { name: "요약" })).getByText(label).nextElementSibling
    ?.textContent;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("줄 추가는 첫 공간의 견적 1개 항목 (공간이 여럿인 옛 계획 L)", () => {
  it("L의 [+ 도배에 줄 추가] → 육문수·180 확정 저장 → spaceId s0(첫 공간)·상태 계획·비고 없음, 도배 묶음 끝, 지출 예정 550", async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorage({
      [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans([makePlanL()]),
    });
    await renderLoggedOut(storage, "#/home/plan-l");
    await user.click(screen.getByRole("button", { name: "도배에 줄 추가" }));
    const dialog = screen.getByRole("dialog", { name: "줄 추가" });
    expect(within(dialog).getByLabelText("구분")).toHaveValue("도배");
    await user.type(within(dialog).getByLabelText("업체"), "육문수");
    await user.type(within(dialog).getByLabelText("견적"), "180");
    await user.click(within(dialog).getByRole("checkbox", { name: "확정" }));
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const items = storedPlans(storage)[0].items;
    expect(items.map((item) => item.id).slice(0, 3)).toEqual(["item-x", "item-y", "item-z"]);
    const { id, createdAt, updatedAt, ...added } = items[3];
    void [id, createdAt, updatedAt];
    const quoteId = added.quotes?.[0].id;
    expect(added).toStrictEqual({
      spaceId: "s0",
      trade: "도배",
      quotes: [{ id: quoteId, vendor: "육문수", amount: 180 }],
      confirmedQuoteId: quoteId,
      status: "planned",
    });
    // 옛 항목 X·Y·Z는 그대로
    expect(items[0]).toStrictEqual(legacyX());
    expect(items[1]).toStrictEqual(legacyY());
    expect(
      within(screen.getByRole("region", { name: "도배" }))
        .getAllByRole("checkbox")
        .map((box) => box.getAttribute("aria-label")),
    ).toEqual(["도배 확정", "도배 육문수 확정"]);
    expect(headlineValue("지출 예정")).toBe("5,500,000원");
  });
});

describe("확정 토글 실패: 쓰지 않거나 원래대로, 목록 위 이유 한 줄", () => {
  it("로그아웃: 다른 탭이 R4 항목을 지웠으면(notFound) 쓰지 않고 이유, 저장소 원문 그대로", async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorage({
      [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans([makeSimplePlanP()]),
    });
    await renderLoggedOut(storage, "#/home/plan-simple");
    // 다른 탭이 R4를 지웠다(이 화면은 아직 storage 이벤트를 받지 않았다)
    const otherTabRaw = toStoredPlans([
      makeSimplePlanP({ items: makeSimplePlanP().items.filter((item) => item.id !== "r4") }),
    ]);
    storage.setItem(INTERIOR_PLANS_STORAGE_KEY, otherTabRaw);
    const setItem = vi.spyOn(storage, "setItem");

    await user.click(screen.getByRole("checkbox", { name: R4_CHECK }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "이 계획이나 항목이 없습니다. 다른 탭이나 기기에서 삭제되었을 수 있습니다",
    );
    expect(setItem).not.toHaveBeenCalled();
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY) === otherTabRaw).toBe(true);
  });

  it("가구: 함께 쓰는 사람이 X를 지운 뒤 체크(PUT 404) → '함께 쓰는 사람이 삭제한 항목입니다', 체크는 원래대로", async () => {
    const user = userEvent.setup();
    const api = createFakePlanApi({ userId: "user-b", isInHousehold: true, plans: [makePlanL()] });
    window.location.hash = "#/home/plan-l";
    render(<AppRoutes storage={createMemoryStorage({ [SESSION_HINT_STORAGE_KEY]: "1" })} />, {
      wrapper: api.wrapper,
    });
    const box = await screen.findByRole("checkbox", { name: X_Q2_CHECK });
    api.server.respond = (call) =>
      call.method === "PUT" ? errorResponse(404, "notFound") : undefined;

    await user.click(box);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "함께 쓰는 사람이 삭제한 항목입니다",
    );
    expect(api.callsTo("PUT", "/api/interior-plans/plan-l/items/item-x")).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: X_Q2_CHECK })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "욕실 하루바스 철거·방수 확정" })).toBeChecked();
    expect(headlineValue("지출 예정")).toBe("3,700,000원");
  });

  // 401은 기존 세션 만료 처리(useInteriorPlanSource, diff 0)로 간다: 화면 전체가 만료 안내로 바뀌고 로컬 계획에 쓰지 않는다
  it("로그인 만료: 체크 PUT 401 → 기존 세션 만료 안내 '로그인이 끝났습니다. 다시 로그인해 주세요', 로컬에 쓰지 않는다", async () => {
    const user = userEvent.setup();
    const api = createFakePlanApi({ userId: "user-a", plans: [makeSimplePlanP()] });
    const storage = createMemoryStorage({ [SESSION_HINT_STORAGE_KEY]: "1" });
    window.location.hash = "#/home/plan-simple";
    render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });
    const box = await screen.findByRole("checkbox", { name: R4_CHECK });
    const setItem = vi.spyOn(storage, "setItem");
    api.server.respond = (call) =>
      call.method === "PUT" ? errorResponse(401, "unauthorized") : undefined;

    await user.click(box);
    expect(
      await screen.findByText("로그인이 끝났습니다. 다시 로그인해 주세요"),
    ).toBeInTheDocument();
    expect(api.callsTo("PUT", "/api/interior-plans/plan-simple/items/r4")).toHaveLength(1);
    expect(setItem.mock.calls.filter(([key]) => key === INTERIOR_PLANS_STORAGE_KEY)).toEqual([]);
    expect(api.server.plans[0].items.find((item) => item.id === "r4")?.confirmedQuoteId).toBe(
      undefined,
    );
  });
});
