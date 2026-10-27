import { createIdsByUserStore } from "./idsByUserStorage";

import type { InteriorPlanImportStore } from "@/lib/types/interiorPlanImport";

/** 새 키(기존 키는 읽기만 하고 건드리지 않는다, AC-0). `account-imports`와 같은 `Record<userId, planId[]>` */
export const INTERIOR_PLAN_IMPORTS_STORAGE_KEY = "loan-calculator/interior-plan-imports";

/** 키 `loan-calculator/interior-plan-imports`. 사용자별로 이 기기에서 그 계정으로 옮긴 인테리어 계획 id */
export function createInteriorPlanImportStore({
  storage,
}: {
  storage: Storage;
}): InteriorPlanImportStore {
  return createIdsByUserStore({ storage, key: INTERIOR_PLAN_IMPORTS_STORAGE_KEY });
}
