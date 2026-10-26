// 계정 이전 훅 테스트(스펙 interior-planner 태스크 0-2)용 가짜 `/api/*`. 서버처럼 import는 COALESCE로 처리하고,
// 받은 요청을 기록한다. `setHousehold`로 같은 userId에서 함께 쓰기 가입·나가기를 흉내 낸다(`/api/me` 재조회).
import { QueryClientProvider } from "@tanstack/react-query";
import { act } from "@testing-library/react";
import { vi } from "vitest";

import { meQueryKey } from "@/hooks/useMe";
import { createQueryClient } from "@/lib/api/queryClient";

import type { MeResponse } from "@/lib/types/account";
import type { ReactNode } from "react";

export type ApiCall = { method: string; path: string; body: unknown };

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

type FakeAccountApiOptions = {
  userId: string;
  isInHousehold: boolean;
  /** 계정(가구)의 현재 예산·순서 */
  budget?: number | null;
  ids?: string[] | null;
};

export function createFakeAccountApi({
  userId,
  isInHousehold,
  budget = null,
  ids = null,
}: FakeAccountApiOptions) {
  const server = {
    me: {
      user: { id: userId, household: isInHousehold ? { memberCount: 2 } : null },
    } as MeResponse,
    budget,
    ids,
    calls: [] as ApiCall[],
  };

  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const path = String(input);
    const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    server.calls.push({ method, path, body });
    const route = `${method} ${path}`;
    if (route === "GET /api/me") return jsonResponse(200, server.me);
    if (route === "GET /api/listings") return jsonResponse(200, { listings: [] });
    if (route === "POST /api/listings/import") {
      const { listings } = body as { listings: unknown[] };
      return jsonResponse(200, { imported: listings.length, skipped: 0 });
    }
    if (route === "GET /api/budget") return jsonResponse(200, { budget: server.budget });
    if (route === "POST /api/budget/import") {
      server.budget ??= (body as { budget: number }).budget;
      return jsonResponse(200, { budget: server.budget });
    }
    if (route === "GET /api/listing-order") return jsonResponse(200, { ids: server.ids });
    if (route === "POST /api/listing-order/import") {
      server.ids ??= (body as { ids: string[] }).ids;
      return jsonResponse(200, { ids: server.ids });
    }
    return jsonResponse(404, { error: "notFound", message: route });
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
    /** 이 경로·메서드로 받은 요청 */
    callsTo: (method: string, path: string) =>
      server.calls.filter((call) => call.method === method && call.path === path),
    /** 같은 userId에서 가구 가입(true)·나가기(false). 앱처럼 `/api/me`를 다시 받는다. */
    async setHousehold(isNowInHousehold: boolean) {
      server.me = {
        user: { id: userId, household: isNowInHousehold ? { memberCount: 2 } : null },
      };
      await act(() => queryClient.refetchQueries({ queryKey: meQueryKey() }));
    },
  };
}
