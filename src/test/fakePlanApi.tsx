// 인테리어 계획 클라이언트 테스트(스펙 interior-planner 태스크 2-3)용 가짜 `/api/*`. 서버처럼 import는 같은 id면
// `imported: 0`, 가구 구성원이면 409 `inHousehold`로 답하고, 받은 요청을 기록한다. 쓰기는 서버처럼 id·시각을 정한다.
// `respond`로 특정 요청에 다른 응답(401·404·400·연결 실패)을 끼워 넣는다.
import { QueryClientProvider } from "@tanstack/react-query";
import { act } from "@testing-library/react";
import { vi } from "vitest";

import { meQueryKey } from "@/hooks/useMe";
import { createQueryClient } from "@/lib/api/queryClient";

import type { MeResponse } from "@/lib/types/account";
import type {
  InteriorItem,
  InteriorItemInput,
  InteriorPlanCreateInput,
  InteriorPlanPatch,
  InteriorPlanWithItems,
} from "@/lib/types/interiorPlan";
import type { ReactNode } from "react";

export type PlanApiCall = { method: string; path: string; body: unknown };

export const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const errorResponse = (status: number, error: string) =>
  jsonResponse(status, { error, message: error });

/** 응답하지 않는 요청(로그인 확인 응답 전 등) */
export const PENDING = Symbol("pending");

type Override = (call: PlanApiCall) => Response | Promise<Response> | typeof PENDING | undefined;

type FakePlanApiOptions = {
  /** null이면 로그아웃(`/api/me` user null) */
  userId: string | null;
  isInHousehold?: boolean;
  /** 계정(가구 범위)의 계획 */
  plans?: InteriorPlanWithItems[];
};

const clone = <T,>(value: T): T => structuredClone(value);

export function createFakePlanApi({
  userId,
  isInHousehold = false,
  plans = [],
}: FakePlanApiOptions) {
  let clock = Date.parse("2026-10-27T00:00:00.000Z");
  /** 서버 시각. 쓰기마다 1초씩 간다(updatedAt이 바뀌는 것을 보이게) */
  const nextTime = () => {
    clock += 1000;
    return new Date(clock).toISOString();
  };
  let idCounter = 0;
  const nextId = (prefix: string) => {
    idCounter += 1;
    return `${prefix}${String(idCounter).padStart(4, "0")}`;
  };

  const meOf = (inHousehold: boolean): MeResponse =>
    userId === null
      ? { user: null }
      : { user: { id: userId, household: inHousehold ? { memberCount: 2 } : null } };

  const server = {
    me: meOf(isInHousehold),
    plans: clone(plans),
    calls: [] as PlanApiCall[],
    respond: undefined as Override | undefined,
  };

  const findPlan = (planId: string) => server.plans.find((plan) => plan.id === planId);

  const route = (call: PlanApiCall): Response => {
    const { method, path, body } = call;
    const key = `${method} ${path}`;
    if (key === "GET /api/me") return jsonResponse(200, server.me);
    if (key === "GET /api/listings") return jsonResponse(200, { listings: [] });
    if (key === "POST /api/listings/import") {
      const { listings } = body as { listings: unknown[] };
      return jsonResponse(200, { imported: listings.length, skipped: 0 });
    }
    if (key === "GET /api/budget") return jsonResponse(200, { budget: null });
    if (key === "POST /api/budget/import") {
      return jsonResponse(200, { budget: (body as { budget: number }).budget });
    }
    if (key === "GET /api/listing-order") return jsonResponse(200, { ids: null });
    if (key === "POST /api/listing-order/import") {
      return jsonResponse(200, { ids: (body as { ids: string[] }).ids });
    }
    if (key === "POST /api/household/leave") {
      server.me = meOf(false);
      return new Response(null, { status: 204 });
    }
    const invite = /^\/api\/household\/invites\/([^/]+)(\/accept)?$/.exec(path);
    if (invite !== null) {
      if (method === "GET" && invite[2] === undefined) {
        return jsonResponse(200, { expiresAt: "2099-01-01T00:00:00.000Z" });
      }
      if (method === "POST" && invite[2] === "/accept") {
        server.me = meOf(true);
        return jsonResponse(200, { household: { memberCount: 2 } });
      }
    }

    if (key === "GET /api/interior-plans") return jsonResponse(200, { plans: server.plans });
    if (key === "POST /api/interior-plans/import") {
      if (server.me.user?.household) return errorResponse(409, "inHousehold");
      const { plan } = body as { plan: InteriorPlanWithItems };
      if (findPlan(plan.id) !== undefined) return jsonResponse(200, { imported: 0 });
      server.plans.push(clone(plan));
      return jsonResponse(200, { imported: 1 });
    }
    if (key === "POST /api/interior-plans") {
      const { plan: input } = body as { plan: InteriorPlanCreateInput };
      const time = nextTime();
      const { items = [], ...fields } = input;
      const plan: InteriorPlanWithItems = {
        ...fields,
        id: nextId("srvplan"),
        createdAt: time,
        updatedAt: time,
        items: items.map((item) => ({
          ...item,
          id: nextId("srvitem"),
          createdAt: time,
          updatedAt: time,
        })),
      };
      server.plans.push(plan);
      return jsonResponse(201, { plan });
    }
    const planPath = /^\/api\/interior-plans\/([^/]+)$/.exec(path);
    if (planPath !== null) {
      const plan = findPlan(decodeURIComponent(planPath[1]));
      if (plan === undefined) return errorResponse(404, "notFound");
      if (method === "PATCH") {
        const { plan: patch } = body as { plan: InteriorPlanPatch };
        for (const [field, value] of Object.entries(patch)) {
          if (value === null) delete (plan as Record<string, unknown>)[field];
          else (plan as Record<string, unknown>)[field] = value;
        }
        plan.updatedAt = nextTime();
        const { items: _items, ...fields } = plan;
        void _items;
        return jsonResponse(200, { plan: fields });
      }
      if (method === "DELETE") {
        server.plans = server.plans.filter((candidate) => candidate !== plan);
        return new Response(null, { status: 204 });
      }
    }
    const itemsPath = /^\/api\/interior-plans\/([^/]+)\/items(?:\/([^/]+))?$/.exec(path);
    if (itemsPath !== null) {
      const plan = findPlan(decodeURIComponent(itemsPath[1]));
      if (plan === undefined) return errorResponse(404, "notFound");
      const itemId = itemsPath[2] === undefined ? undefined : decodeURIComponent(itemsPath[2]);
      if (method === "POST" && itemId === undefined) {
        const { item: input } = body as { item: InteriorItemInput };
        const time = nextTime();
        const item: InteriorItem = {
          ...input,
          id: nextId("srvitem"),
          createdAt: time,
          updatedAt: time,
        };
        plan.items.push(item);
        return jsonResponse(201, { item });
      }
      const index = plan.items.findIndex((item) => item.id === itemId);
      if (index === -1) return errorResponse(404, "notFound");
      if (method === "PUT") {
        const { item: input } = body as { item: InteriorItemInput };
        const item: InteriorItem = {
          ...input,
          id: plan.items[index].id,
          createdAt: plan.items[index].createdAt,
          updatedAt: nextTime(),
        };
        plan.items[index] = item;
        return jsonResponse(200, { item });
      }
      if (method === "DELETE") {
        plan.items.splice(index, 1);
        return new Response(null, { status: 204 });
      }
    }
    return errorResponse(404, "notFound");
  };

  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const path = String(input);
    const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    const call = { method, path, body };
    server.calls.push(call);
    const overridden = server.respond?.(call);
    if (overridden === PENDING) return new Promise<Response>(() => {});
    if (overridden !== undefined) return overridden;
    return route(call);
  });
  vi.stubGlobal("fetch", fetchMock);

  const queryClient = createQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return {
    server,
    queryClient,
    wrapper,
    fetchMock,
    /** 이 경로·메서드로 받은 요청 */
    callsTo: (method: string, path: string) =>
      server.calls.filter((call) => call.method === method && call.path === path),
    /** 쓰기 요청(GET 아님) 전부 */
    writes: () => server.calls.filter((call) => call.method !== "GET"),
    /** 같은 userId에서 가구 가입(true)·나가기(false). 앱처럼 `/api/me`를 다시 받는다. */
    async setHousehold(isNowInHousehold: boolean) {
      server.me = meOf(isNowInHousehold);
      await act(() => queryClient.refetchQueries({ queryKey: meQueryKey() }));
    },
    /** 다른 기기·함께 쓰는 사람이 서버에서 항목을 고쳤다(다음 조회에 보인다) */
    editItemOnServer(planId: string, itemId: string, change: Partial<InteriorItemInput>) {
      const plan = findPlan(planId);
      const index = plan?.items.findIndex((item) => item.id === itemId) ?? -1;
      if (plan === undefined || index === -1) throw new Error(`없는 항목 ${planId}/${itemId}`);
      plan.items[index] = { ...plan.items[index], ...change, updatedAt: nextTime() };
      return plan.items[index];
    },
  };
}

export type FakePlanApi = ReturnType<typeof createFakePlanApi>;
