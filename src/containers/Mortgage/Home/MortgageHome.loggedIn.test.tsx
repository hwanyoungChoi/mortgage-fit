// @vitest-environment jsdom
// [우리 집] 로그인 상태 화면(스펙 interior-planner AC-7·8·9 클라이언트, "화면 — 상태", "반복 사용 불편 방지").
// 화면 → 출처 훅 → API 훅 연결을 본다(훅 단위 테스트로는 이벤트 미전달을 못 잡는다).
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { SESSION_HINT_STORAGE_KEY } from "@/lib/utils/sessionHintStorage";
import { createFakePlanApi, errorResponse } from "@/test/fakePlanApi";
import { makePlanP, toStoredPlans } from "@/test/interiorPlanFixture";
import { createMemoryStorage } from "@/test/memoryStorage";

import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";

const USER_ID = "user-a";
const PLANS_PATH = "/api/interior-plans";
const TILE_PUT = `${PLANS_PATH}/plan-p/items/item-tile`;
const MOVED_NOTICE = "이 기기의 인테리어 계획을 계정으로 옮겼습니다";

type RenderOptions = {
  isInHousehold?: boolean;
  serverPlans?: InteriorPlanWithItems[];
  localPlans?: InteriorPlanWithItems[];
  hash?: string;
};

function renderLoggedIn({
  isInHousehold = false,
  serverPlans = [makePlanP()],
  localPlans = [],
  hash = "#/home",
}: RenderOptions = {}) {
  const storage = createMemoryStorage({
    [SESSION_HINT_STORAGE_KEY]: "1",
    ...(localPlans.length === 0 ? {} : { [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans(localPlans) }),
  });
  const api = createFakePlanApi({ userId: USER_ID, isInHousehold, plans: serverPlans });
  window.location.hash = hash;
  const view = render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });
  return { storage, api, view };
}

const budgetInput = (dialog: HTMLElement) =>
  within(dialog).getByLabelText("예산(선택)") as HTMLInputElement;

/** 다른 기기·함께 쓰는 사람의 저장을 이 화면이 받아 오게 한다(창 포커스 재조회) */
async function refocus() {
  await act(async () => {
    window.dispatchEvent(new Event("visibilitychange"));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("로그인 상태 [우리 집] — 서버 출처", () => {
  it("서버 계획을 그린다(로컬 원본은 그리지도 쓰지도 않음)", async () => {
    const local = makePlanP({ id: "local-only", name: "기기 계획" });
    const { storage, api } = renderLoggedIn({ localPlans: [local], isInHousehold: true });
    const before = storage.getItem(INTERIOR_PLANS_STORAGE_KEY);
    expect(await screen.findByRole("button", { name: "타일 C타일 열기" })).toBeInTheDocument();
    expect(screen.queryByText("기기 계획")).not.toBeInTheDocument();
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe(before);
    // 가구라 이전은 건너뜀
    expect(api.callsTo("POST", `${PLANS_PATH}/import`)).toHaveLength(0);
  });

  it("조회 실패: '인테리어 계획을 불러오지 못했습니다' + [다시 시도] → 다시 받아 그린다", async () => {
    const user = userEvent.setup();
    const { api } = renderLoggedIn();
    api.server.respond = (call) =>
      call.path === PLANS_PATH && call.method === "GET"
        ? errorResponse(500, "internal")
        : undefined;
    expect(await screen.findByText("인테리어 계획을 불러오지 못했습니다")).toBeInTheDocument();
    api.server.respond = undefined;
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("button", { name: "타일 C타일 열기" })).toBeInTheDocument();
    expect(screen.queryByText("인테리어 계획을 불러오지 못했습니다")).not.toBeInTheDocument();
  });

  it("401: 기존 세션 만료 안내 '로그인이 끝났습니다. 다시 로그인해 주세요'", async () => {
    const { api } = renderLoggedIn();
    api.server.respond = (call) =>
      call.path === PLANS_PATH ? errorResponse(401, "unauthorized") : undefined;
    expect(
      await screen.findByText("로그인이 끝났습니다. 다시 로그인해 주세요"),
    ).toBeInTheDocument();
  });

  it("로그인 이전: 혼자면 기기 계획을 옮기고 '옮겼습니다'를 [우리 집]에 한 번만 보인다", async () => {
    const user = userEvent.setup();
    const local = makePlanP({ id: "local-plan", name: "기기 계획", items: [] });
    const { api } = renderLoggedIn({ serverPlans: [], localPlans: [local] });
    expect(await screen.findByText(MOVED_NOTICE)).toBeInTheDocument();
    expect(api.callsTo("POST", `${PLANS_PATH}/import`)).toHaveLength(1);
    // 옮긴 뒤의 서버 목록(그 계획 하나)을 연다
    expect(await screen.findByRole("heading", { name: "기기 계획" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "계산" }));
    await user.click(screen.getByRole("link", { name: "우리 집" }));
    expect(await screen.findByRole("heading", { name: "기기 계획" })).toBeInTheDocument();
    expect(screen.queryByText(MOVED_NOTICE)).not.toBeInTheDocument();
  });

  it("로그인 이전: 가구면 알림 없음, import 0건, 목록이 불러오는 중에 멈추지 않는다", async () => {
    const local = makePlanP({ id: "local-plan", name: "기기 계획", items: [] });
    const { api } = renderLoggedIn({ isInHousehold: true, localPlans: [local] });
    expect(await screen.findByRole("button", { name: "타일 C타일 열기" })).toBeInTheDocument();
    expect(screen.queryByText(MOVED_NOTICE)).not.toBeInTheDocument();
    expect(screen.queryByText("인테리어 계획을 불러오는 중")).not.toBeInTheDocument();
    expect(api.callsTo("POST", `${PLANS_PATH}/import`)).toHaveLength(0);
  });
});

describe("같은 항목 동시 편집(AC-9 클라이언트)", () => {
  it("시트를 연 뒤 상대가 저장 → 재조회로 값이 바뀌어도 입력 유지 → [저장]은 '다른 사람이 고쳤습니다', PUT 0회, 입력 유지 → [최신 값 불러오기] 뒤 저장하면 PUT", async () => {
    const user = userEvent.setup();
    const { api } = renderLoggedIn({ isInHousehold: true });
    await user.click(await screen.findByRole("button", { name: "타일 C타일 열기" }));
    const dialog = screen.getByRole("dialog", { name: "항목" });
    expect(budgetInput(dialog).value).toBe("600");
    await user.clear(budgetInput(dialog));
    await user.type(budgetInput(dialog), "610");

    // 상대가 같은 항목 예산을 900으로 저장, 이 화면이 재조회로 받는다
    api.editItemOnServer("plan-p", "item-tile", { budget: 900 });
    const getsBefore = api.callsTo("GET", PLANS_PATH).length;
    await refocus();
    await waitFor(() => expect(api.callsTo("GET", PLANS_PATH).length).toBe(getsBefore + 1));
    await act(async () => {});
    // 폴링으로 데이터가 바뀌어도 열린 시트 입력은 그대로
    expect(budgetInput(screen.getByRole("dialog", { name: "항목" })).value).toBe("610");

    await user.click(
      within(screen.getByRole("dialog", { name: "항목" })).getByRole("button", { name: "저장" }),
    );
    const alert = await within(screen.getByRole("dialog", { name: "항목" })).findByRole("alert");
    expect(alert).toHaveTextContent(/^다른 사람이 고쳤습니다/);
    expect(api.callsTo("PUT", TILE_PUT)).toHaveLength(0);
    expect(api.server.plans[0].items[1].budget).toBe(900);
    expect(budgetInput(screen.getByRole("dialog", { name: "항목" })).value).toBe("610");

    await user.click(screen.getByRole("button", { name: "최신 값 불러오기" }));
    const reloaded = screen.getByRole("dialog", { name: "항목" });
    expect(budgetInput(reloaded).value).toBe("900");
    expect(within(reloaded).queryByRole("alert")).not.toBeInTheDocument();
    await user.clear(budgetInput(reloaded));
    await user.type(budgetInput(reloaded), "950");
    await user.click(within(reloaded).getByRole("button", { name: "저장" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.callsTo("PUT", TILE_PUT)).toHaveLength(1);
    expect(api.server.plans[0].items[1].budget).toBe(950);
  });

  it("다른 항목이 바뀐 재조회는 충돌이 아니다: 저장하면 PUT 1회, 둘 다 남는다", async () => {
    const user = userEvent.setup();
    const { api } = renderLoggedIn({ isInHousehold: true });
    await user.click(await screen.findByRole("button", { name: "타일 C타일 열기" }));
    const dialog = screen.getByRole("dialog", { name: "항목" });
    await user.clear(budgetInput(dialog));
    await user.type(budgetInput(dialog), "610");
    api.editItemOnServer("plan-p", "item-kitchen", { budget: 800 });
    await refocus();
    await waitFor(() => expect(api.callsTo("GET", PLANS_PATH).length).toBeGreaterThanOrEqual(2));
    await act(async () => {});

    await user.click(
      within(screen.getByRole("dialog", { name: "항목" })).getByRole("button", { name: "저장" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.callsTo("PUT", TILE_PUT)).toHaveLength(1);
    expect(api.server.plans[0].items.map((item) => item.budget)).toEqual([300, 610, 1200, 800]);
  });

  it("함께 쓰는 중 상대가 지운 항목을 저장하면(404) '함께 쓰는 사람이 삭제한 항목입니다'", async () => {
    const user = userEvent.setup();
    const { api } = renderLoggedIn({ isInHousehold: true });
    await user.click(await screen.findByRole("button", { name: "타일 C타일 열기" }));
    const dialog = screen.getByRole("dialog", { name: "항목" });
    await user.clear(budgetInput(dialog));
    await user.type(budgetInput(dialog), "610");
    // 상대가 지움(이 화면은 아직 모름)
    api.server.plans[0].items = api.server.plans[0].items.filter((item) => item.id !== "item-tile");

    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    expect(await screen.findByText("함께 쓰는 사람이 삭제한 항목입니다")).toBeInTheDocument();
    expect(api.callsTo("PUT", TILE_PUT)).toHaveLength(1);
  });
});
