import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";

import { interiorPlanListQueryKey } from "./useInteriorPlanList";

import type {
  ImportInteriorPlanRequest,
  ImportInteriorPlanResponse,
  InteriorPlanWithItems,
} from "@/lib/types/interiorPlan";

const importInteriorPlan = (plan: InteriorPlanWithItems) =>
  apiClient.post<ImportInteriorPlanResponse>("/api/interior-plans/import", {
    plan,
  } satisfies ImportInteriorPlanRequest);

/** 이 기기의 계획 1개를 id·시각 그대로 계정에 넣는다. 이미 있는 id면 서버가 건너뛴다(`imported: 0`). */
export function useImportInteriorPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: importInteriorPlan,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: interiorPlanListQueryKey() }),
  });
}
