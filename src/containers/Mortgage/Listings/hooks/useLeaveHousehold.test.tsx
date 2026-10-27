// @vitest-environment jsdom
// 나가기 뒤 인테리어 계획 목록 무효화(스펙 interior-planner AC-9, ADR-029 조건 7).
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { interiorPlanListQueryKey, useInteriorPlanList } from "@/hooks/useInteriorPlanList";
import { createFakePlanApi } from "@/test/fakePlanApi";
import { makePlanP } from "@/test/interiorPlanFixture";

import { useLeaveHousehold } from "./useLeaveHousehold";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useLeaveHousehold", () => {
  it("성공하면 interiorPlanListQueryKey()를 무효화해 보고 있던 계획 목록을 다시 받는다(옛 범위의 계획이 남지 않음)", async () => {
    // 나가기 전: 가구 범위(A의 PA + B의 PC). 나간 뒤: B는 PB·PC
    const api = createFakePlanApi({
      userId: "user-b",
      isInHousehold: true,
      plans: [makePlanP({ id: "plan-pa" }), makePlanP({ id: "plan-pc" })],
    });
    const invalidate = vi.spyOn(api.queryClient, "invalidateQueries");
    const hook = renderHook(
      () => ({
        leave: useLeaveHousehold(),
        plans: useInteriorPlanList({ enabled: true, refetchInterval: false }),
      }),
      { wrapper: api.wrapper },
    );
    await waitFor(() => expect(hook.result.current.plans.data).toHaveLength(2));
    const getsBefore = api.callsTo("GET", "/api/interior-plans").length;

    api.server.plans = [makePlanP({ id: "plan-pb" }), makePlanP({ id: "plan-pc" })];
    await act(() => hook.result.current.leave.mutateAsync());

    expect(invalidate).toHaveBeenCalledWith({ queryKey: interiorPlanListQueryKey() });
    await waitFor(() =>
      expect(hook.result.current.plans.data?.map((plan) => plan.id)).toEqual([
        "plan-pb",
        "plan-pc",
      ]),
    );
    expect(api.callsTo("GET", "/api/interior-plans").length).toBe(getsBefore + 1);
  });
});
