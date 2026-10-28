// @vitest-environment jsdom
// 스펙 interior-vendor-tbd-line-order 태스크 1-4 qa: fe 테스트가 덮지 않은 두 곳.
// - AC-3 저장 실패: 서버 500이면 원래 순서로 돌아오고 목록 위 안내 한 줄, 다음 끌기가 성공하면 안내가 사라진다(버그 ⑬).
// - AC-0(c) 읽기만으로 쓰기 0: `lineOrder`가 든 V를 들여쓴 JSON으로 시드하고 열기·시트 열고 닫기·들었다가 Esc·표 보기를 거쳐도
//   계획 원문 `===`, 계획 키에 쓰기 0회.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { SESSION_HINT_STORAGE_KEY } from "@/lib/utils/sessionHintStorage";
import { stubRowRects } from "@/test/dndKitJsdom";
import { createFakePlanApi, errorResponse } from "@/test/fakePlanApi";
import { makePlanV, makeSimplePlanP } from "@/test/interiorSimpleFixture";
import { createMemoryStorage } from "@/test/memoryStorage";
import { renderWithQueryClient } from "@/test/renderWithQueryClient";

const P_HASH = "#/home/plan-simple";
const R1 = "도배 육문수 실크 전체 열기";
const R2 = "도배 동네도배 합지 열기";
const FAILURE_TEXT = "순서를 저장하지 못해 원래 순서로 되돌렸습니다";

const waitForPlans = () =>
  waitFor(() => expect(screen.queryByText("인테리어 계획을 불러오는 중")).not.toBeInTheDocument());

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

describe("줄 순서 저장 실패 (AC-3, 버그 ⑬)", () => {
  it("로그인: PATCH 500이면 원래 순서 [R1, R2]와 안내 한 줄, 다음 끌기가 성공하면 안내가 사라지고 [R2, R1]", async () => {
    const api = createFakePlanApi({ userId: "u1", plans: [makeSimplePlanP()] });
    api.server.respond = (call) =>
      call.method === "PATCH" ? errorResponse(500, "internal") : undefined;
    window.location.hash = P_HASH;
    render(<AppRoutes storage={createMemoryStorage()} />, { wrapper: api.wrapper });
    await waitForPlans();
    await screen.findByRole("button", { name: R2 });
    const before = openNames();

    await pressAll(R2, ["Space", "ArrowUp", "Space"]);
    await waitFor(() =>
      expect(
        screen.getAllByRole("alert").filter((alert) => alert.textContent?.startsWith(FAILURE_TEXT)),
      ).toHaveLength(1),
    );
    expect(api.writes()).toHaveLength(1);
    await waitFor(() => expect(openNames()).toStrictEqual(before));

    api.server.respond = undefined;
    await pressAll(R2, ["Space", "ArrowUp", "Space"]);
    await waitFor(() => expect(api.writes()).toHaveLength(2));
    await waitFor(() =>
      expect(screen.queryByText(new RegExp(FAILURE_TEXT))).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(openNames().slice(0, 2)).toStrictEqual([R2, R1]));
  });
});

describe("읽기만으로 쓰기 0 (AC-0(c))", () => {
  it("로그아웃: lineOrder 든 V(들여쓴 JSON)를 열고 시트·들기 Esc·표를 거쳐도 원문 ===, 계획 키 쓰기 0회", async () => {
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
    const plan = makePlanV({
      lineOrder: ["r9:rq9", "r2:rq2", "r1:rq1", "item-gone:", "r8:rq8"],
    });
    const raw = JSON.stringify({ plans: [plan] }, null, 2);
    const storage = createMemoryStorage({ [INTERIOR_PLANS_STORAGE_KEY]: raw });
    const setItem = vi.spyOn(storage, "setItem");
    const removeItem = vi.spyOn(storage, "removeItem");
    window.location.hash = P_HASH;
    renderWithQueryClient(<AppRoutes storage={storage} />);
    await waitForPlans();
    const user = userEvent.setup();

    // lineOrder대로 읽혔다(철거 R9가 맨 앞 묶음, 도배는 R2 → R1)
    expect(openNames().slice(0, 3)).toStrictEqual(["철거 업체 미정 열기", R2, R1]);

    await user.click(screen.getByRole("button", { name: "철거 업체 미정 열기" }));
    await user.click(await screen.findByRole("button", { name: "닫기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await pressAll(R2, ["Space", "ArrowDown", "Escape"]);
    await pressAll(R2, ["Space", "Space"]);
    await user.click(screen.getByRole("radio", { name: "표" }));
    await screen.findByRole("table");
    await user.click(screen.getByRole("radio", { name: "목록" }));
    await screen.findByRole("button", { name: R2 });

    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe(raw);
    expect(setItem).not.toHaveBeenCalled();
    // 로그인 흔적(session-hint) 지우기는 기존 허용 쓰기다(MortgageHome.golden.test.tsx와 같다)
    expect(removeItem.mock.calls.filter(([key]) => key !== SESSION_HINT_STORAGE_KEY)).toStrictEqual(
      [],
    );
  });
});
