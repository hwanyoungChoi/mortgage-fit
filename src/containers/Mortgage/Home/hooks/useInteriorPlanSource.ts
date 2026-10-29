import { useQueryClient } from "@tanstack/react-query";

import { interiorPlanListQueryKey } from "@/hooks/useInteriorPlanList";
import {
  useInteriorPlanListSource,
  type InteriorPlanListSource,
} from "@/hooks/useInteriorPlanListSource";
import { ApiRequestError } from "@/lib/api/client";
import { isInteriorItemEditConflict } from "@/lib/utils/interiorItemConflict";

import { useCreateInteriorItem } from "./useCreateInteriorItem";
import { useCreateInteriorPlan } from "./useCreateInteriorPlan";
import { useDeleteInteriorItem } from "./useDeleteInteriorItem";
import { useDeleteInteriorPlan } from "./useDeleteInteriorPlan";
import { useUpdateInteriorItem } from "./useUpdateInteriorItem";
import { useUpdateInteriorPlan } from "./useUpdateInteriorPlan";

import type { InteriorPlanImport } from "@/hooks/useInteriorPlanImport";
import type {
  InteriorItem,
  InteriorItemInput,
  InteriorPlanCreateInput,
  InteriorPlanPatch,
  InteriorPlanWithItems,
} from "@/lib/types/interiorPlan";
import type {
  InteriorPlanSourceWriteFailure,
  InteriorPlanSourceWriteResult,
  InteriorPlanStore,
} from "@/lib/types/interiorPlanStore";
import type { SessionHintStore } from "@/lib/types/sessionHint";
import type { StorageWriteResult } from "@/lib/types/storage";

type InteriorPlanSourceOptions = {
  /** 로그아웃 상태의 원본. 로그인 중에는 쓰지 않는다(AC-0). */
  store: InteriorPlanStore;
  /** 읽기만 한다(로그인했던 브라우저인지). 401일 때만 세션 종료로 지운다. */
  sessionHintStore: SessionHintStore;
  /** 로그인 직후 이 기기 계획의 이전. 끝나기 전에는 출처를 loading으로 두고 서버 계획을 조회하지 않는다. */
  planImport: InteriorPlanImport;
};

/**
 * [인테리어] 화면이 쓰는 계획 출처(로그아웃: 로컬 스토어 / 로그인: 서버). `useListingSource`와 같은 경계다.
 * 읽기는 `useInteriorPlanListSource`(홈과 같이 씀)이고, 여기서 쓰기를 얹는다(ADR-031 D5 B).
 * 쓰기는 두 출처 모두 서버 API와 같은 단위(계획 POST·PATCH·DELETE, 항목 POST·PUT·DELETE)의 Promise 결과다.
 * 출처가 정해지기 전(loading·error)에는 쓰지 않고 `notReady`로 실패한다(로컬로 몰래 쓰지 않는다).
 */
export type InteriorPlanSource = Omit<InteriorPlanListSource, "expireSession"> & {
  createPlan: (
    input: InteriorPlanCreateInput,
  ) => Promise<{ ok: true; plan: InteriorPlanWithItems } | InteriorPlanSourceWriteFailure>;
  updatePlan: (planId: string, patch: InteriorPlanPatch) => Promise<InteriorPlanSourceWriteResult>;
  removePlan: (planId: string) => Promise<InteriorPlanSourceWriteResult>;
  addItem: (
    planId: string,
    input: InteriorItemInput,
  ) => Promise<{ ok: true; item: InteriorItem } | InteriorPlanSourceWriteFailure>;
  /**
   * 항목 전체를 바꾼다. `openedUpdatedAt`은 시트를 연 시점의 항목 `updatedAt`이다. 저장 직전 목록의 값과 다르면
   * 쓰지 않고 `conflict`로 실패한다(같은 항목 동시 편집 경고, 서버 조건부 PUT 없음).
   */
  updateItem: (
    planId: string,
    itemId: string,
    input: InteriorItemInput,
    openedUpdatedAt: string,
  ) => Promise<InteriorPlanSourceWriteResult>;
  removeItem: (planId: string, itemId: string) => Promise<InteriorPlanSourceWriteResult>;
  /** 손상된 로컬 원문 지우기(사용자가 확인한 뒤) */
  reset: () => StorageWriteResult;
};

const NOT_READY: InteriorPlanSourceWriteFailure = { ok: false, reason: "notReady" };
const CONFLICT: InteriorPlanSourceWriteFailure = { ok: false, reason: "conflict" };

/**
 * 만들기(계획 POST·항목 POST)의 400은 상한(계획 3개·항목 100개)이다. 필드는 화면이 같은 검증 함수로 먼저 본다.
 * 404는 함께 쓰는 중이면 상대가 지웠을 수도 있어 사유를 나눈다(혼자면 notFound). 응답 형식 오류는 연결 오류로 본다.
 */
function toWriteFailure(
  error: unknown,
  isCreate: boolean,
  isInHousehold: boolean,
): InteriorPlanSourceWriteFailure {
  if (!(error instanceof ApiRequestError)) return { ok: false, reason: "network" };
  if (error.status === 401) return { ok: false, reason: "unauthorized" };
  if (error.status === 404) {
    return { ok: false, reason: isInHousehold ? "deletedInHousehold" : "notFound" };
  }
  if (error.status === 400) return { ok: false, reason: isCreate ? "limit" : "invalid" };
  if (error.status === 413) return { ok: false, reason: "invalid" };
  return { ok: false, reason: "network" };
}

export function useInteriorPlanSource({
  store,
  sessionHintStore,
  planImport,
}: InteriorPlanSourceOptions): InteriorPlanSource {
  const queryClient = useQueryClient();
  const { expireSession, ...read } = useInteriorPlanListSource({
    store,
    sessionHintStore,
    planImport,
  });
  const { status, household } = read;
  const createPlan = useCreateInteriorPlan();
  const updatePlan = useUpdateInteriorPlan();
  const deletePlan = useDeleteInteriorPlan();
  const createItem = useCreateInteriorItem();
  const updateItem = useUpdateInteriorItem();
  const deleteItem = useDeleteInteriorItem();

  /** 저장 직전의 목록. 그린 값이 아니라 지금 캐시·저장소에서 읽는다(폴링 결과가 막 들어온 경우까지 보려고). */
  const readLatestPlans = (): InteriorPlanWithItems[] => {
    if (status === "loggedIn") {
      return queryClient.getQueryData<InteriorPlanWithItems[]>(interiorPlanListQueryKey()) ?? [];
    }
    const snapshot = store.getSnapshot();
    return snapshot.status === "ok" ? snapshot.plans : [];
  };

  /** 서버 쓰기. 401이면 로그아웃 상태로, 그 밖의 실패는 목록을 다시 받아 지금 값을 보인다(지워진 계획·항목을 걷는다). */
  const writeServer = async <T extends { ok: true }>(
    write: () => Promise<T>,
    isCreate = false,
  ): Promise<T | InteriorPlanSourceWriteFailure> => {
    try {
      return await write();
    } catch (error) {
      const failure = toWriteFailure(error, isCreate, household !== null);
      if (failure.reason === "unauthorized") expireSession();
      else void queryClient.invalidateQueries({ queryKey: interiorPlanListQueryKey() });
      return failure;
    }
  };

  const writeBySource = async <T extends { ok: true }>(
    local: () => T | InteriorPlanSourceWriteFailure,
    server: () => Promise<T>,
    isCreate = false,
  ): Promise<T | InteriorPlanSourceWriteFailure> => {
    if (status === "loggedOut") return local();
    if (status === "loggedIn") return writeServer(server, isCreate);
    return NOT_READY;
  };

  const done = { ok: true } as const;

  return {
    ...read,
    createPlan: (input) =>
      writeBySource<{ ok: true; plan: InteriorPlanWithItems }>(
        () => store.createPlan(input),
        async () => ({ ok: true, plan: await createPlan.mutateAsync(input) }),
        true,
      ),
    updatePlan: (planId, patch) =>
      writeBySource(
        () => store.updatePlan(planId, patch),
        async () => {
          await updatePlan.mutateAsync({ planId, patch });
          return done;
        },
      ),
    removePlan: (planId) =>
      writeBySource(
        () => store.removePlan(planId),
        async () => {
          await deletePlan.mutateAsync(planId);
          return done;
        },
      ),
    addItem: (planId, input) =>
      writeBySource<{ ok: true; item: InteriorItem }>(
        () => store.addItem(planId, input),
        async () => ({ ok: true, item: await createItem.mutateAsync({ planId, item: input }) }),
        true,
      ),
    updateItem: async (planId, itemId, input, openedUpdatedAt) => {
      if (isInteriorItemEditConflict(readLatestPlans(), planId, itemId, openedUpdatedAt)) {
        return CONFLICT;
      }
      return writeBySource(
        () => store.updateItem(planId, itemId, input),
        async () => {
          await updateItem.mutateAsync({ planId, itemId, item: input });
          return done;
        },
      );
    },
    removeItem: (planId, itemId) =>
      writeBySource(
        () => store.removeItem(planId, itemId),
        async () => {
          await deleteItem.mutateAsync({ planId, itemId });
          return done;
        },
      ),
    reset: store.reset,
  };
}
