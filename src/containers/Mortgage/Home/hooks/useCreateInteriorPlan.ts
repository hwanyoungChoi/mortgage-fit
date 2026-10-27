import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updateInteriorPlanListCache } from "@/hooks/useInteriorPlanList";
import { apiClient } from "@/lib/api/client";
import { parseInteriorPlanWithItems } from "@/lib/utils/interiorPlanStorage";

import type {
  CreateInteriorPlanRequest,
  CreateInteriorPlanResponse,
  InteriorPlanCreateInput,
} from "@/lib/types/interiorPlan";

const createInteriorPlan = async (input: InteriorPlanCreateInput) => {
  const body = await apiClient.post<CreateInteriorPlanResponse>("/api/interior-plans", {
    plan: input,
  } satisfies CreateInteriorPlanRequest);
  const plan = parseInteriorPlanWithItems(body.plan);
  if (plan === null) throw new Error("/api/interior-plans 응답 형식이 올바르지 않습니다");
  return plan;
};

/** 서버에 새 계획(가져온 항목 포함). id·시각은 서버가 정한다. 받은 계획을 목록 끝에 붙인다(서버 순서 = 만든 시각). */
export function useCreateInteriorPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createInteriorPlan,
    onSuccess: (plan) => updateInteriorPlanListCache(queryClient, (plans) => [...plans, plan]),
  });
}
