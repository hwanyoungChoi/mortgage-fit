// @vitest-environment jsdom
// 스펙 interior-vendor-tbd-line-order 태스크 1-3 끌기 접착(AC-3·AC-0(d)): 키보드로 묶음 안에서 옮기면 `updatePlan` 한 번
// (로컬 setItem 1회 / 서버 PATCH 1건, 본문 `{ plan: { lineOrder } }`), 다른 묶음 위·제자리·Esc는 쓰기 0회.
// jsdom 레이아웃이 없어 `stubRowRects`로 줄 자리를 준다(qa 1-0 스파이크). 꾹 누르기·화면 모양은 브라우저 확인이다.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { stubRowRects } from "@/test/dndKitJsdom";
import { createFakePlanApi } from "@/test/fakePlanApi";
import { toStoredPlans } from "@/test/interiorPlanFixture";
import { makeSimplePlanP } from "@/test/interiorSimpleFixture";
import { createMemoryStorage } from "@/test/memoryStorage";
import { renderWithQueryClient } from "@/test/renderWithQueryClient";

import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";

const P_HASH = "#/home/plan-simple";
const R1 = "도배 육문수 실크 전체 열기";
const R2 = "도배 동네도배 합지 열기";
const MOVED_ORDER = ["r2:rq2", "r1:rq1", "r3:rq3", "r4:rq4", "r5:rq5"];

function stubLoggedOutApi() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const isMe = String(input) === "/api/me";
      return new Response(JSON.stringify(isMe ? { user: null } : { error: "notFound" }), {
        status: isMe ? 200 : 404,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}

const waitForPlans = () =>
  waitFor(() => expect(screen.queryByText("인테리어 계획을 불러오는 중")).not.toBeInTheDocument());

async function renderLoggedOut() {
  stubLoggedOutApi();
  const storage = createMemoryStorage({
    [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans([makeSimplePlanP()]),
  });
  window.location.hash = P_HASH;
  renderWithQueryClient(<AppRoutes storage={storage} />);
  await waitForPlans();
  return { storage, setItem: vi.spyOn(storage, "setItem") };
}

/** 키보드 센서는 든 다음 틱에 keydown 리스너를 붙인다. 키 사이에 한 틱씩 흘린다 */
async function press(element: Element, code: string) {
  await act(async () => {
    fireEvent.keyDown(element, { code, key: code === "Space" ? " " : code });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function pressAll(name: string, codes: string[]) {
  const button = screen.getByRole("button", { name });
  button.focus();
  for (const code of codes) await press(button, code);
}

const openNames = () =>
  screen
    .getAllByRole("button", { name: / 열기$/ })
    .map((button) => button.getAttribute("aria-label"));

const storedPlan = (storage: Storage) =>
  (
    JSON.parse(storage.getItem(INTERIOR_PLANS_STORAGE_KEY) ?? "null") as {
      plans: InteriorPlanWithItems[];
    }
  ).plans[0];

let restoreRects: () => void;

beforeEach(() => {
  restoreRects = stubRowRects();
});

afterEach(() => {
  restoreRects();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("줄 끌어 옮기기 — 키보드 (P)", () => {
  it("로그아웃: R2 스페이스 → 위 화살표 → 스페이스 → setItem 1회, 그 플랜의 lineOrder·updatedAt만 바뀜, 목록 [도배: R2, R1]", async () => {
    const { storage, setItem } = await renderLoggedOut();
    const before = storedPlan(storage);
    await pressAll(R2, ["Space", "ArrowUp", "Space"]);
    await waitFor(() => expect(setItem).toHaveBeenCalledTimes(1));
    const after = storedPlan(storage);
    expect(after.lineOrder).toStrictEqual(MOVED_ORDER);
    expect(after.items).toStrictEqual(before.items);
    const { lineOrder, updatedAt, ...rest } = after;
    void [lineOrder, updatedAt];
    const { updatedAt: beforeUpdatedAt, ...beforeRest } = before;
    void beforeUpdatedAt;
    expect(rest).toStrictEqual(beforeRest);
    expect(openNames().slice(0, 2)).toStrictEqual([R2, R1]);
  });

  it("다른 묶음 위에 놓기(R2 → 아래 화살표로 욕실 R3)·제자리 놓기·Esc → 쓰기 0회, 순서 그대로", async () => {
    const { setItem } = await renderLoggedOut();
    const names = openNames();
    await pressAll(R2, ["Space", "ArrowDown", "Space"]);
    await pressAll(R2, ["Space", "Space"]);
    await pressAll(R1, ["Space", "ArrowDown", "Escape"]);
    expect(setItem).not.toHaveBeenCalled();
    expect(openNames()).toStrictEqual(names);
  });

  it("로그인: PATCH 정확히 1건, 본문 { plan: { lineOrder } }, 항목 PUT 0건", async () => {
    const api = createFakePlanApi({ userId: "u1", plans: [makeSimplePlanP()] });
    window.location.hash = P_HASH;
    render(<AppRoutes storage={createMemoryStorage()} />, { wrapper: api.wrapper });
    await waitForPlans();
    await screen.findByRole("button", { name: R2 });
    await pressAll(R2, ["Space", "ArrowUp", "Space"]);
    await waitFor(() => expect(api.writes()).toHaveLength(1));
    expect(api.writes()).toStrictEqual([
      {
        method: "PATCH",
        path: "/api/interior-plans/plan-simple",
        body: { plan: { lineOrder: MOVED_ORDER } },
      },
    ]);
    await waitFor(() => expect(openNames().slice(0, 2)).toStrictEqual([R2, R1]));
  });
});
