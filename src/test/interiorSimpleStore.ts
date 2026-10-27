// 스펙 interior-simple AC-0(e)(qa): 새 화면의 쓰기 함수(`interiorLineWrites`)로 실제 로컬 스토어에 계획을 만든다.
// "새 쓰기 함수가 만든 항목으로 채운 저장소 원문"을 옛 번들 읽기·로그인 이전 테스트가 같이 쓴다.
import { addLineInput } from "@/lib/utils/interiorLineWrites";
import {
  createInteriorPlanStore,
  INTERIOR_PLANS_STORAGE_KEY,
} from "@/lib/utils/interiorPlanStorage";
import { createMemoryStorage } from "@/test/memoryStorage";

import type { InteriorLineValues } from "@/lib/types/interiorLineDraft";
import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";

/** 예시 P의 줄 R1~R5(스펙 "수용 기준") — 화면에서 [줄 추가]로 적은 값 */
export const SIMPLE_P_LINES: InteriorLineValues[] = [
  { trade: "도배", vendor: "육문수", detail: "실크 전체", amount: 180, isConfirmed: true },
  { trade: "도배", vendor: "동네도배", detail: "합지", amount: 150, isConfirmed: false },
  { trade: "욕실", vendor: "하루바스", detail: "철거·방수 (1)", amount: 370, isConfirmed: true },
  { trade: "욕실", vendor: "욕실나라", detail: "철거·방수 (1)", amount: 400, isConfirmed: false },
  { trade: "욕실", vendor: "하루바스", detail: "타일 덧방 (2)", amount: 250, isConfirmed: true },
];

/** 32자 hex(로컬 id 모양, ADR-010). 부를 때마다 1씩 는다 */
export function createHexIds(prefix = "a") {
  let counter = 0;
  return () => {
    counter += 1;
    return `${prefix}${counter.toString(16).padStart(31, "0")}`;
  };
}

/** 저장소 원문 → 계획 목록(검증 없이 JSON 그대로) */
export const rawPlans = (raw: string | null) =>
  (JSON.parse(raw ?? "null") as { plans: InteriorPlanWithItems[] }).plans;

/**
 * 로그아웃 상태에서 새 화면이 만든 P: 계획 만들기(이름 "우리 집", 총 예산 1,000, 공간 [전체]) → 줄 추가 R1~R5.
 * 줄 추가 입력은 화면과 같은 `addLineInput(plan.spaces[0].id, 새 견적 id, 값)`이다.
 */
export function createPlanPWithNewWrites(storage: Storage = createMemoryStorage()) {
  const createId = createHexIds();
  let minute = 0;
  const store = createInteriorPlanStore({
    storage,
    createId,
    now: () => {
      minute += 1;
      return `2026-10-27T01:${String(minute).padStart(2, "0")}:00.000Z`;
    },
  });
  const created = store.createPlan({
    name: "우리 집",
    budget: 1000,
    spaces: [{ id: createId(), name: "전체" }],
  });
  if (!created.ok) throw new Error(`계획 만들기 실패: ${created.reason}`);
  const plan = created.plan;
  for (const values of SIMPLE_P_LINES) {
    const result = store.addItem(plan.id, addLineInput(plan.spaces[0].id, createId(), values));
    if (!result.ok) throw new Error(`줄 추가 실패: ${result.reason}`);
  }
  return { storage, store, planId: plan.id, raw: storage.getItem(INTERIOR_PLANS_STORAGE_KEY) };
}
