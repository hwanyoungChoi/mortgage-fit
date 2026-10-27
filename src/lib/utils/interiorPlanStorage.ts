import {
  INTERIOR_ITEM_MAX_COUNT,
  INTERIOR_PLAN_CREATE_MAX_ITEMS,
  INTERIOR_PLAN_MAX_COUNT,
} from "@/lib/constants/interiorPlan";

import {
  parseInteriorItem,
  parseInteriorPlan,
  validateInteriorItemFields,
  validateInteriorPlanFields,
} from "./validateInteriorPlan";

import type {
  InteriorItem,
  InteriorItemInput,
  InteriorPlanInput,
  InteriorPlanPatch,
  InteriorPlanWithItems,
} from "@/lib/types/interiorPlan";
import type {
  InteriorPlanSnapshot,
  InteriorPlanStore,
  InteriorPlanWriteFailure,
  InteriorPlanWriteResult,
} from "@/lib/types/interiorPlanStore";

/** 새 키(기존 키는 읽지도 쓰지도 않는다, AC-0). 원문은 `{ plans: (InteriorPlan & { items })[] }` */
export const INTERIOR_PLANS_STORAGE_KEY = "loan-calculator/interior-plans";

export type InteriorPlanStoreOptions = {
  storage: Storage;
  /** `isInteriorId` 모양(16바이트 hex, ADR-010) */
  createId: () => string;
  /** `toISOString` 형식 */
  now: () => string;
};

const UNAVAILABLE_SNAPSHOT: InteriorPlanSnapshot = { status: "unavailable" };
const EMPTY_SNAPSHOT: InteriorPlanSnapshot = { status: "ok", plans: [] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 플랜 하나와 그 항목. 하나라도 어긋나면 null이다. 알려진 키만 담은 새 객체다(로컬 원문·서버 응답 공통). */
export function parseInteriorPlanWithItems(value: unknown): InteriorPlanWithItems | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;
  const plan = parseInteriorPlan(value);
  if (plan === null) return null;
  const items: InteriorItem[] = [];
  for (const raw of value.items as unknown[]) {
    const item = parseInteriorItem(raw);
    if (item === null) return null;
    items.push(item);
  }
  return { ...plan, items };
}

/**
 * 저장소 원문 → 스냅샷. 키 없음(null)은 빈 목록이다.
 * 하나라도 어긋나면 플랜을 골라 버리지 않고 전체를 corrupt로 본다(조용한 손실 방지, ADR-001).
 */
export function parseInteriorPlans(rawText: string | null): InteriorPlanSnapshot {
  if (rawText === null) return EMPTY_SNAPSHOT;
  let value: unknown;
  try {
    value = JSON.parse(rawText);
  } catch {
    return { status: "corrupt", rawText };
  }
  if (!isRecord(value) || !Array.isArray(value.plans)) return { status: "corrupt", rawText };
  const plans: InteriorPlanWithItems[] = [];
  for (const raw of value.plans as unknown[]) {
    const plan = parseInteriorPlanWithItems(raw);
    if (plan === null) return { status: "corrupt", rawText };
    plans.push(plan);
  }
  return { status: "ok", plans };
}

/** 플랜 필드에 PATCH(키 없음 = 그대로, null = 지움)를 얹는다. 검증은 부르는 쪽이 한다. */
function applyPlanPatch(plan: InteriorPlanWithItems, patch: InteriorPlanPatch): InteriorPlanInput {
  const budget = patch.budget === undefined ? plan.budget : (patch.budget ?? undefined);
  const listingId = patch.listingId === undefined ? plan.listingId : (patch.listingId ?? undefined);
  return {
    name: patch.name ?? plan.name,
    ...(budget !== undefined && { budget }),
    ...(listingId !== undefined && { listingId }),
    spaces: patch.spaces ?? plan.spaces,
  };
}

/**
 * 인테리어 플랜 스토어(로그아웃 상태의 원본). 스냅샷은 원문 문자열이 같으면 같은 참조를 돌려준다.
 * 쓰기마다 저장소를 다시 읽어 그 플랜·항목만 바꿔 쓴다. 스냅샷이 ok가 아니면(corrupt/unavailable) reset을 뺀 쓰기는
 * storage를 건드리지 않고 실패한다(ADR-001). 쓰는 값은 공용 검증(`validateInteriorPlan`)을 거친 값이다.
 */
export function createInteriorPlanStore({
  storage,
  createId,
  now,
}: InteriorPlanStoreOptions): InteriorPlanStore {
  const listeners = new Set<() => void>();
  let cache: { rawText: string | null; snapshot: InteriorPlanSnapshot } | null = null;

  function getSnapshot(): InteriorPlanSnapshot {
    let rawText: string | null;
    try {
      rawText = storage.getItem(INTERIOR_PLANS_STORAGE_KEY);
    } catch {
      return UNAVAILABLE_SNAPSHOT;
    }
    if (cache !== null && cache.rawText === rawText) return cache.snapshot;
    cache = { rawText, snapshot: parseInteriorPlans(rawText) };
    return cache.snapshot;
  }

  function notify() {
    for (const listener of listeners) listener();
  }

  function readWritablePlans():
    { ok: true; plans: InteriorPlanWithItems[] } | InteriorPlanWriteFailure {
    const snapshot = getSnapshot();
    if (snapshot.status !== "ok") return { ok: false, reason: snapshot.status };
    return { ok: true, plans: snapshot.plans };
  }

  /** setItem이 실패하면(용량 초과 포함) storage가 그대로이므로 스냅샷도 바뀌지 않는다. */
  function commit(plans: InteriorPlanWithItems[]): InteriorPlanWriteResult {
    try {
      storage.setItem(INTERIOR_PLANS_STORAGE_KEY, JSON.stringify({ plans }));
    } catch {
      return { ok: false, reason: "unavailable" };
    }
    notify();
    return { ok: true };
  }

  /** 저장소를 다시 읽고 그 플랜 하나만 바꿔 쓴다. `change`가 실패를 돌려주면 쓰지 않는다. */
  function writePlan(
    planId: string,
    change: (plan: InteriorPlanWithItems) => InteriorPlanWithItems | InteriorPlanWriteFailure,
  ): InteriorPlanWriteResult {
    const current = readWritablePlans();
    if (!current.ok) return current;
    const index = current.plans.findIndex((plan) => plan.id === planId);
    if (index === -1) return { ok: false, reason: "notFound" };
    const next = change(current.plans[index]);
    if ("ok" in next) return next;
    return commit(current.plans.with(index, next));
  }

  /** 그 항목 하나만 바꾸거나(`InteriorItem`) 지운다(null) */
  function writeItem(
    planId: string,
    itemId: string,
    change: (item: InteriorItem) => InteriorItem | null | InteriorPlanWriteFailure,
  ): InteriorPlanWriteResult {
    return writePlan(planId, (plan) => {
      const index = plan.items.findIndex((item) => item.id === itemId);
      if (index === -1) return { ok: false, reason: "notFound" };
      const next = change(plan.items[index]);
      if (next !== null && "ok" in next) return next;
      const items =
        next === null
          ? plan.items.filter((item) => item.id !== itemId)
          : plan.items.with(index, next);
      return { ...plan, items };
    });
  }

  return {
    getSnapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    notify,

    createPlan({ items: itemInputs = [], ...planInput }) {
      const current = readWritablePlans();
      if (!current.ok) return current;
      if (current.plans.length >= INTERIOR_PLAN_MAX_COUNT) return { ok: false, reason: "limit" };
      const fields = validateInteriorPlanFields(planInput);
      if (fields === null || itemInputs.length > INTERIOR_PLAN_CREATE_MAX_ITEMS) {
        return { ok: false, reason: "invalid" };
      }
      const itemFields: InteriorItemInput[] = [];
      for (const input of itemInputs) {
        const item = validateInteriorItemFields(input);
        if (item === null) return { ok: false, reason: "invalid" };
        itemFields.push(item);
      }
      const timestamp = now();
      const baseTime = Date.parse(timestamp);
      const plan: InteriorPlanWithItems = {
        id: createId(),
        ...fields,
        createdAt: timestamp,
        updatedAt: timestamp,
        // 항목 i는 기준 시각 + i ms(서버 POST와 같다). 로그인 이전 뒤 서버 GET(`created_at, id`)에서도 입력 순서가 된다.
        items: itemFields.map((item, index) => {
          const itemTime = new Date(baseTime + index).toISOString();
          return { id: createId(), ...item, createdAt: itemTime, updatedAt: itemTime };
        }),
      };
      const result = commit([...current.plans, plan]);
      return result.ok ? { ok: true, plan } : result;
    },

    updatePlan(planId, patch) {
      return writePlan(planId, (plan) => {
        const fields = validateInteriorPlanFields(applyPlanPatch(plan, patch));
        if (fields === null) return { ok: false, reason: "invalid" };
        const { id, createdAt, items } = plan;
        return { id, ...fields, createdAt, updatedAt: now(), items };
      });
    },

    removePlan(planId) {
      const current = readWritablePlans();
      if (!current.ok) return current;
      if (!current.plans.some((plan) => plan.id === planId)) {
        return { ok: false, reason: "notFound" };
      }
      return commit(current.plans.filter((plan) => plan.id !== planId));
    },

    addItem(planId, input) {
      const fields = validateInteriorItemFields(input);
      if (fields === null) return { ok: false, reason: "invalid" };
      const timestamp = now();
      const item: InteriorItem = {
        id: createId(),
        ...fields,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const result = writePlan(planId, (plan) =>
        plan.items.length >= INTERIOR_ITEM_MAX_COUNT
          ? { ok: false, reason: "limit" }
          : { ...plan, items: [...plan.items, item] },
      );
      return result.ok ? { ok: true, item } : result;
    },

    updateItem(planId, itemId, input) {
      const fields = validateInteriorItemFields(input);
      if (fields === null) return { ok: false, reason: "invalid" };
      return writeItem(planId, itemId, (item) => ({
        id: item.id,
        ...fields,
        createdAt: item.createdAt,
        updatedAt: now(),
      }));
    },

    removeItem(planId, itemId) {
      return writeItem(planId, itemId, () => null);
    },

    reset() {
      try {
        storage.removeItem(INTERIOR_PLANS_STORAGE_KEY);
      } catch {
        return { ok: false, reason: "unavailable" };
      }
      notify();
      return { ok: true };
    },
  };
}
