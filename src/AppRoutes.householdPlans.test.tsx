// @vitest-environment jsdom
// 함께 쓰기 수락·나가기와 인테리어 계획(스펙 interior-planner AC-9·10, "동기화·이전 규칙", U12).
// 화면(저장 목록 [나가기]·초대 [함께 쓰기 시작]) → 훅 → 계획 이전 연결을 본다.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { ACCOUNT_IMPORTS_STORAGE_KEY } from "@/lib/utils/accountImportStorage";
import { INTERIOR_PLAN_IMPORTS_STORAGE_KEY } from "@/lib/utils/interiorPlanImportStorage";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { LISTINGS_STORAGE_KEY } from "@/lib/utils/listingStorage";
import { SESSION_HINT_STORAGE_KEY } from "@/lib/utils/sessionHintStorage";
import { createFakePlanApi, errorResponse } from "@/test/fakePlanApi";
import { makePlanP, toStoredPlans } from "@/test/interiorPlanFixture";
import { makeListing } from "@/test/listingFixture";
import { createMemoryStorage } from "@/test/memoryStorage";

import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";

const USER_ID = "user-b";
const IMPORT_PATH = "/api/interior-plans/import";
const TOKEN = "AbCdEfGhIjKlMnOpQrStUv";
const PLAN_PARAGRAPH =
  "인테리어 계획: 함께 쓰는 동안 상대가 내 계획에 넣은 항목은 내 계획과 함께 나가고, 내가 상대 계획에 넣은 항목은 그 계획에 남습니다.";

const devicePlan = () => makePlanP({ id: "device-plan", name: "기기 계획", items: [] });

function renderApp({
  isInHousehold,
  localPlans,
  hash,
  extra = {},
}: {
  isInHousehold: boolean;
  localPlans: InteriorPlanWithItems[];
  hash: string;
  extra?: Record<string, string>;
}) {
  const storage = createMemoryStorage({
    [SESSION_HINT_STORAGE_KEY]: "1",
    [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans(localPlans),
    ...extra,
  });
  const api = createFakePlanApi({
    userId: USER_ID,
    isInHousehold,
    plans: isInHousehold ? [makePlanP({ id: "plan-pa", name: "A 계획" })] : [],
  });
  const setItem = vi.spyOn(storage, "setItem");
  window.location.hash = hash;
  render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });
  const planImports = () => api.callsTo("POST", IMPORT_PATH);
  return { storage, api, setItem, planImports };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("나가기(이 기기에 기록 없는 계획이 있는 B)", () => {
  it("확인 문구에 계획 귀속 문단(U12)이 있고, 나가면 같은 세션에서 기기 계획을 1회 옮기고 [우리 집]에 알린다", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { storage, api, planImports } = renderApp({
      isInHousehold: true,
      localPlans: [devicePlan()],
      hash: "#/listings",
    });
    const leaveButton = await screen.findByRole("button", { name: "함께 쓰기에서 나가기" });
    // 가구 중에는 보내지 않는다
    expect(planImports()).toHaveLength(0);
    expect(storage.getItem(INTERIOR_PLAN_IMPORTS_STORAGE_KEY)).toBeNull();

    await user.click(leaveButton);

    expect(confirm).toHaveBeenCalledTimes(1);
    const message = confirm.mock.calls[0][0] as string;
    expect(message.split("\n")).toContain(PLAN_PARAGRAPH);
    // 기존 문단은 그대로이고 계획 문단은 매물 안내 뒤, 마지막 줄 앞
    expect(message.startsWith("함께 쓰기에서 나갈까요?")).toBe(true);
    expect(message.endsWith("상대가 지운 매물은 돌아오지 않습니다.")).toBe(true);

    await waitFor(() => expect(planImports()).toHaveLength(1));
    expect((planImports()[0].body as { plan: InteriorPlanWithItems }).plan).toEqual(devicePlan());
    await waitFor(() =>
      expect(JSON.parse(storage.getItem(INTERIOR_PLAN_IMPORTS_STORAGE_KEY)!)).toEqual({
        [USER_ID]: ["device-plan"],
      }),
    );

    // 나간 뒤 [우리 집]: 내 계획(옮긴 기기 계획)만, 알림 1회
    api.server.plans = api.server.plans.filter((plan) => plan.id !== "plan-pa");
    await user.click(screen.getByRole("link", { name: "우리 집" }));
    expect(
      await screen.findByText("이 기기의 인테리어 계획을 계정으로 옮겼습니다"),
    ).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "기기 계획" })).toBeInTheDocument();
    expect(screen.queryByText("A 계획")).not.toBeInTheDocument();
    expect(planImports()).toHaveLength(1);
  });

  it("확인창에서 취소하면 나가지 않고 계획도 보내지 않는다", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { api, planImports } = renderApp({
      isInHousehold: true,
      localPlans: [devicePlan()],
      hash: "#/listings",
    });
    await user.click(await screen.findByRole("button", { name: "함께 쓰기에서 나가기" }));
    expect(api.callsTo("POST", "/api/household/leave")).toHaveLength(0);
    expect(planImports()).toHaveLength(0);
  });
});

describe("이 기기에서 수락(플랜 이전 기록은 미리 완료 표시하지 않음)", () => {
  it("수락 때 매물 기록(account-imports)은 쓰지만 interior-plan-imports는 쓰지 않는다: 옮기지 못한 기기 계획은 기록에 없다", async () => {
    const user = userEvent.setup();
    const { storage, api, setItem, planImports } = renderApp({
      isInHousehold: false,
      localPlans: [devicePlan()],
      hash: `#/invite/${TOKEN}`,
      extra: { [LISTINGS_STORAGE_KEY]: JSON.stringify([makeListing({ id: "listing-1" })]) },
    });
    // 로그인 이전이 연결 실패로 끝나 계획이 기록되지 않은 상태에서 수락한다
    api.server.respond = (call) =>
      call.path === IMPORT_PATH ? errorResponse(500, "internal") : undefined;
    const start = await screen.findByRole("button", { name: "함께 쓰기 시작" });
    await waitFor(() => expect(planImports()).toHaveLength(1));
    expect(storage.getItem(INTERIOR_PLAN_IMPORTS_STORAGE_KEY)).toBeNull();
    setItem.mockClear();

    await user.click(start);
    await waitFor(() => expect(window.location.hash).toBe("#/listings"));

    const keysWritten = setItem.mock.calls.map(([key]) => key);
    // 스파이가 살아 있다: 기존 매물 기록은 수락 때 썼다(markDeviceImportsDone, 기존 동작)
    expect(keysWritten).toContain(ACCOUNT_IMPORTS_STORAGE_KEY);
    expect(keysWritten).not.toContain(INTERIOR_PLAN_IMPORTS_STORAGE_KEY);
    expect(storage.getItem(INTERIOR_PLAN_IMPORTS_STORAGE_KEY)).toBeNull();
  });

  it("이미 옮긴 계획 기록이 있으면 수락 전후 그 원문이 바이트 단위로 같다", async () => {
    const user = userEvent.setup();
    const { storage, planImports } = renderApp({
      isInHousehold: false,
      localPlans: [devicePlan()],
      hash: `#/invite/${TOKEN}`,
    });
    const start = await screen.findByRole("button", { name: "함께 쓰기 시작" });
    await waitFor(() => expect(planImports()).toHaveLength(1));
    await waitFor(() => expect(storage.getItem(INTERIOR_PLAN_IMPORTS_STORAGE_KEY)).not.toBeNull());
    const before = storage.getItem(INTERIOR_PLAN_IMPORTS_STORAGE_KEY);

    await user.click(start);
    await waitFor(() => expect(window.location.hash).toBe("#/listings"));
    expect(storage.getItem(INTERIOR_PLAN_IMPORTS_STORAGE_KEY)).toBe(before);
    expect(planImports()).toHaveLength(1);
  });
});
