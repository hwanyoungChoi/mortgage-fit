import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiRequestError } from "@/lib/api/client";
import { householdOf } from "@/lib/utils/household";

import { useImportInteriorPlan } from "./useImportInteriorPlan";
import { meQueryKey, useMe } from "./useMe";

import type {
  ImportInteriorPlanRequest,
  ImportInteriorPlanResponse,
  InteriorPlanWithItems,
} from "@/lib/types/interiorPlan";
import type {
  InteriorPlanImportFailureReason,
  InteriorPlanImportResult,
  InteriorPlanImportState,
  InteriorPlanImportStore,
} from "@/lib/types/interiorPlanImport";
import type { InteriorPlanSnapshot, InteriorPlanStore } from "@/lib/types/interiorPlanStore";

/**
 * `/api/interior-plans/import` 본문 한도(`server/interiorPlans/handleInteriorPlans.ts`의 `IMPORT_MAX_BYTES`, 넘으면 413).
 * 계획 하나(항목 100개)는 한글만이면 최악 ~0.7MB, 짝 없는 서로게이트(`\uXXXX` 6바이트)면 그 2배라 넘을 수 있다.
 * 그래서 보낼 본문을 그대로 재서 넘으면 보내지 않고 그 계획만 이전 실패로 둔다(스펙 "크기 상한 계산").
 */
const IMPORT_MAX_BODY_BYTES = 1024 * 1024;

const textEncoder = new TextEncoder();
/** `apiClient`가 보내는 본문과 같은 직렬화(JSON.stringify, UTF-8)의 바이트 수 */
const jsonByteLength = (value: unknown) => textEncoder.encode(JSON.stringify(value)).byteLength;

export type InteriorPlanImport = {
  /** 아직 이 사용자의 이전을 시작하지 않았으면 null */
  state: InteriorPlanImportState | null;
  /** 실패한 이전을 다시 한다. 이미 옮긴 id는 기록에 있어 보내지 않는다. */
  retry: () => void;
};

/**
 * 이 사용자의 이전이 끝났거나 건너뛰기로 정해졌다(함께 쓰는 중 건너뜀·실패 포함). 그 전까지 서버 계획을 조회하지 않는다
 * (빈 목록 깜빡임 방지).
 */
export function isInteriorPlanImportSettled(
  state: InteriorPlanImportState | null,
  userId: string,
): boolean {
  return state !== null && state.userId === userId && state.status !== "running";
}

/** 400은 계정 계획 3개 상한이다(필드는 로컬 저장소가 같은 검증 함수로 이미 본 값). 413은 본문 한도. 나머지는 연결·서버 오류. */
function toFailureReason(error: unknown): InteriorPlanImportFailureReason {
  if (!(error instanceof ApiRequestError)) return "network";
  if (error.status === 400) return "limit";
  if (error.status === 413) return "tooLarge";
  return "network";
}

/** 서버가 함께 쓰는 중이라고 거절했다(클라이언트의 `me.household`가 낡았을 때의 최종 방어, ADR-029 조건 5). */
function isInHouseholdRejection(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 409;
}

type ImportLocalPlansOptions = {
  userId: string;
  /** 함께 쓰는 중이면 보내지도 기록하지도 않는다(기기 계획이 함께 쓰는 목록으로 올라가지 않게, ADR-029). */
  isInHousehold: boolean;
  snapshot: InteriorPlanSnapshot;
  importStore: InteriorPlanImportStore;
  send: (plan: InteriorPlanWithItems) => Promise<ImportInteriorPlanResponse>;
};

/**
 * 이 기기의 계획 중 이 계정으로 아직 옮기지 않은 것을 1개씩 보낸다. 로컬 원문은 읽기만 한다(AC-0).
 * 성공(`imported` 0 또는 1)할 때마다 그 id를 기록해, 서버에서 지운 계획이 다시 로그인할 때 되살아나지 않는다.
 * 본문이 한도를 넘는 계획은 보내지 않고 다음 계획으로 넘어간다. 연결·상한 실패는 거기서 멈춘다(남은 것도 같은 이유로 실패한다).
 */
async function importLocalPlans({
  userId,
  isInHousehold,
  snapshot,
  importStore,
  send,
}: ImportLocalPlansOptions): Promise<InteriorPlanImportResult> {
  if (isInHousehold) return { status: "skipped", reason: "household" };
  if (snapshot.status !== "ok") return { status: "skipped", reason: snapshot.status };
  const importedIds = new Set(importStore.read()[userId] ?? []);
  const pending = snapshot.plans.filter((plan) => !importedIds.has(plan.id));
  if (pending.length === 0) return { status: "done", importedCount: 0 };

  let importedCount = 0;
  let tooLargeCount = 0;
  for (const [index, plan] of pending.entries()) {
    // 스냅샷의 계획은 알려진 키만 담은 값이라 이 본문이 그대로 보내진다.
    if (jsonByteLength({ plan } satisfies ImportInteriorPlanRequest) > IMPORT_MAX_BODY_BYTES) {
      tooLargeCount += 1;
      continue;
    }
    try {
      importedCount += (await send(plan)).imported;
    } catch (error) {
      if (isInHouseholdRejection(error)) return { status: "skipped", reason: "serverHousehold" };
      return {
        status: "failed",
        reason: toFailureReason(error),
        failedCount: pending.length - index + tooLargeCount,
      };
    }
    importStore.add(userId, [plan.id]);
  }
  if (tooLargeCount > 0)
    return { status: "failed", reason: "tooLarge", failedCount: tooLargeCount };
  return { status: "done", importedCount };
}

/** 함께 쓰는 중이라 건너뛴 사용자가 나갔다(같은 세션에서 household가 null로 바뀜). 이때 한 번 다시 한다. */
function shouldRunAfterLeave(state: InteriorPlanImportState, isInHousehold: boolean): boolean {
  return state.status === "skipped" && state.reason === "household" && !isInHousehold;
}

type InteriorPlanImportOptions = {
  /** 로그아웃 상태의 계획 원본. 읽기만 한다. */
  interiorPlanStore: InteriorPlanStore;
  interiorPlanImportStore: InteriorPlanImportStore;
  /** 실제로 옮긴 계획이 있을 때 한 번 부른다. 바뀌지 않는 함수를 넘긴다(useCallback). */
  onImported: () => void;
};

/**
 * 로그인 확인 직후 이 기기의 인테리어 계획을 계정으로 옮긴다. 앱에서 한 번만 부른다(`AppRoutes`).
 * 화면을 오가도 결과가 남고, 실행 중에는 다시 시작하지 않는다. 함께 쓰는 중이면 건너뛰고, 나가면 그때 한 번 한다
 * (매물·예산·순서 이전과 같은 규칙, 스펙 "동기화·이전 규칙"). 수락 때 미리 완료로 기록하지 않는다.
 */
export function useInteriorPlanImport({
  interiorPlanStore,
  interiorPlanImportStore,
  onImported,
}: InteriorPlanImportOptions): InteriorPlanImport {
  const queryClient = useQueryClient();
  const me = useMe();
  const userId = me.data?.user?.id ?? null;
  const { mutateAsync: sendImport } = useImportInteriorPlan();
  const isInHousehold = householdOf(me.data) !== null;
  const [state, setState] = useState<InteriorPlanImportState | null>(null);
  const isRunningRef = useRef(false);

  const run = useCallback(
    async (targetUserId: string, isTargetInHousehold: boolean) => {
      if (isRunningRef.current) return;
      isRunningRef.current = true;
      setState({ userId: targetUserId, status: "running" });
      const result = await importLocalPlans({
        userId: targetUserId,
        isInHousehold: isTargetInHousehold,
        snapshot: interiorPlanStore.getSnapshot(),
        importStore: interiorPlanImportStore,
        send: sendImport,
      });
      isRunningRef.current = false;
      setState({ userId: targetUserId, ...result });
      // 서버는 함께 쓰는 중이라는데 me는 혼자로 보였다. me를 다시 받아 함께 쓰는 중으로 맞춘다.
      if (result.status === "skipped" && result.reason === "serverHousehold") {
        void queryClient.invalidateQueries({ queryKey: meQueryKey() });
      }
      if (result.status === "done" && result.importedCount > 0) onImported();
    },
    [interiorPlanStore, interiorPlanImportStore, sendImport, queryClient, onImported],
  );

  // 서버가 거절한 뒤 me도 함께 쓰는 중을 보이면, 처음부터 건너뛴 것과 같게 둔다(나가면 한 번 다시 한다).
  // me가 계속 혼자로 보이면 이 세션에서는 다시 보내지 않는다(같은 409를 되풀이하지 않게).
  useEffect(() => {
    if (state?.status === "skipped" && state.reason === "serverHousehold" && isInHousehold) {
      setState({ userId: state.userId, status: "skipped", reason: "household" });
    }
  }, [state, isInHousehold]);

  useEffect(() => {
    if (userId === null) return;
    if (state?.userId === userId && !shouldRunAfterLeave(state, isInHousehold)) return;
    void run(userId, isInHousehold);
  }, [userId, isInHousehold, state, run]);

  return {
    state,
    retry: () => {
      if (userId !== null) void run(userId, isInHousehold);
    },
  };
}
