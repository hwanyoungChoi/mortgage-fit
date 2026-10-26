import { useEffect, useSyncExternalStore } from "react";

import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";

import type {
  InteriorItem,
  InteriorItemInput,
  InteriorPlanCreateInput,
  InteriorPlanPatch,
  InteriorPlanWithItems,
} from "@/lib/types/interiorPlan";
import type {
  InteriorPlanSnapshot,
  InteriorPlanStore,
  InteriorPlanWriteFailure,
  InteriorPlanWriteResult,
} from "@/lib/types/interiorPlanStore";
import type { StorageWriteResult } from "@/lib/types/storage";

/**
 * [우리 집] 화면이 쓰는 플랜 출처. 지금은 로컬 스토어(로그아웃 상태의 원본)뿐이다.
 * 쓰기는 서버 API와 같은 단위(플랜 POST·PATCH·DELETE, 항목 POST·PUT·DELETE)의 Promise 결과라,
 * 로그인 상태의 서버 출처(태스크 2)를 이 경계 안에 더해도 화면은 바뀌지 않는다(`useListingSource`와 같은 경계).
 */
export type InteriorPlanSource = {
  snapshot: InteriorPlanSnapshot;
  createPlan: (
    input: InteriorPlanCreateInput,
  ) => Promise<{ ok: true; plan: InteriorPlanWithItems } | InteriorPlanWriteFailure>;
  updatePlan: (planId: string, patch: InteriorPlanPatch) => Promise<InteriorPlanWriteResult>;
  removePlan: (planId: string) => Promise<InteriorPlanWriteResult>;
  addItem: (
    planId: string,
    input: InteriorItemInput,
  ) => Promise<{ ok: true; item: InteriorItem } | InteriorPlanWriteFailure>;
  updateItem: (
    planId: string,
    itemId: string,
    input: InteriorItemInput,
  ) => Promise<InteriorPlanWriteResult>;
  removeItem: (planId: string, itemId: string) => Promise<InteriorPlanWriteResult>;
  /** 손상된 원문 지우기(사용자가 확인한 뒤) */
  reset: () => StorageWriteResult;
};

/** 플랜 스냅샷을 구독한다. 다른 탭에서 바뀌면(`storage` 이벤트) 다시 읽는다. */
export function useInteriorPlanSource(store: InteriorPlanStore): InteriorPlanSource {
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      // key가 null이면 다른 탭에서 storage.clear()를 부른 경우다.
      if (event.key === INTERIOR_PLANS_STORAGE_KEY || event.key === null) store.notify();
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [store]);

  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);

  return {
    snapshot,
    createPlan: async (input) => store.createPlan(input),
    updatePlan: async (planId, patch) => store.updatePlan(planId, patch),
    removePlan: async (planId) => store.removePlan(planId),
    addItem: async (planId, input) => store.addItem(planId, input),
    updateItem: async (planId, itemId, input) => store.updateItem(planId, itemId, input),
    removeItem: async (planId, itemId) => store.removeItem(planId, itemId),
    reset: store.reset,
  };
}
