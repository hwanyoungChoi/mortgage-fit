// @vitest-environment jsdom
// 수락 뒤 인테리어 계획 목록 무효화(스펙 interior-planner AC-9, ADR-029 조건 7).
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { interiorPlanListQueryKey, useInteriorPlanList } from "@/hooks/useInteriorPlanList";
import { createFakePlanApi } from "@/test/fakePlanApi";
import { makePlanP } from "@/test/interiorPlanFixture";

import { useAcceptHouseholdInvite } from "./useAcceptHouseholdInvite";

const TOKEN = "AbCdEfGhIjKlMnOpQrStUv";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useAcceptHouseholdInvite", () => {
  it("성공하면 interiorPlanListQueryKey()를 무효화해 B의 계획(PB) 대신 가구 범위(PA)를 다시 받는다", async () => {
    const api = createFakePlanApi({
      userId: "user-b",
      plans: [makePlanP({ id: "plan-pb" })],
    });
    const invalidate = vi.spyOn(api.queryClient, "invalidateQueries");
    const onAccepted = vi.fn();
    const hook = renderHook(
      () => ({
        accept: useAcceptHouseholdInvite({ onAccepted }),
        plans: useInteriorPlanList({ enabled: true, refetchInterval: false }),
      }),
      { wrapper: api.wrapper },
    );
    await waitFor(() => expect(hook.result.current.plans.data).toHaveLength(1));
    const getsBefore = api.callsTo("GET", "/api/interior-plans").length;

    api.server.plans = [makePlanP({ id: "plan-pa" })];
    await act(() => hook.result.current.accept.mutateAsync(TOKEN));

    expect(onAccepted).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: interiorPlanListQueryKey() });
    await waitFor(() =>
      expect(hook.result.current.plans.data?.map((plan) => plan.id)).toEqual(["plan-pa"]),
    );
    expect(api.callsTo("GET", "/api/interior-plans").length).toBe(getsBefore + 1);
  });
});
