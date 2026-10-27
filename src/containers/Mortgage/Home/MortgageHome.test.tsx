// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { makePlanP, toStoredPlans } from "@/test/interiorPlanFixture";
import { createMemoryStorage } from "@/test/memoryStorage";
import { renderWithQueryClient } from "@/test/renderWithQueryClient";

import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";

const P_DEFAULT_SPACE_NAMES = [
  "전체",
  "현관",
  "거실",
  "주방",
  "욕실1",
  "욕실2",
  "방1",
  "방2",
  "방3",
  "베란다",
];

/** 로그아웃 상태(`/api/me` → user null). 우리 집은 로컬 스토어가 원본이다 */
function stubLoggedOutApi() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const body =
        String(input) === "/api/me" ? { user: null } : { error: "notFound", message: "" };
      return new Response(JSON.stringify(body), {
        status: String(input) === "/api/me" ? 200 : 404,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}

/** 로그인 확인(`/api/me`) 응답 전에는 출처가 loading이라 화면이 "불러오는 중"이다. 로그아웃이 확인될 때까지 기다린다 */
async function renderApp(storage: Storage, hash = "#/home") {
  window.location.hash = hash;
  const result = renderWithQueryClient(<AppRoutes storage={storage} />);
  await waitFor(() =>
    expect(screen.queryByText("인테리어 계획을 불러오는 중")).not.toBeInTheDocument(),
  );
  return result;
}

const storageWith = (plans: InteriorPlanWithItems[], extra: Record<string, string> = {}) =>
  createMemoryStorage({ [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans(plans), ...extra });

const storedPlans = (storage: Storage) =>
  (
    JSON.parse(storage.getItem(INTERIOR_PLANS_STORAGE_KEY) ?? '{"plans":[]}') as {
      plans: InteriorPlanWithItems[];
    }
  ).plans;

describe("우리 집 화면: 만들기·계획 수 상한 (스펙 interior-planner AC-1·AC-5)", () => {
  beforeEach(() => {
    stubLoggedOutApi();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.location.hash = "#/";
  });

  describe("AC-1 빈 상태 → 만들기 → 공간", () => {
    it("빈 상태 → [계획 만들기] 이름 '우리 집'·방 3·욕실 2 → #/home/{planId}, 공간 10개 순서, 새로고침 후 그대로", async () => {
      const user = userEvent.setup();
      const storage = createMemoryStorage();
      const { unmount } = await renderApp(storage);

      expect(
        screen.getByText("계약한 집의 인테리어 예산·견적·지급을 정리합니다"),
      ).toBeInTheDocument();
      expect(screen.getByText("저장 목록의 매물 카드에서도 만들 수 있어요")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "우리 집" })).toHaveAttribute("aria-current", "page");

      await user.click(screen.getByRole("button", { name: "계획 만들기" }));
      const dialog = screen.getByRole("dialog", { name: "인테리어 계획 만들기" });
      // 기본값 방 3·욕실 2
      expect(
        within(within(dialog).getByRole("group", { name: "방 수" })).getByRole("radio", {
          name: "3개",
        }),
      ).toBeChecked();
      expect(
        within(within(dialog).getByRole("group", { name: "욕실 수" })).getByRole("radio", {
          name: "2개",
        }),
      ).toBeChecked();
      await user.type(within(dialog).getByRole("textbox", { name: "계획 이름" }), "우리 집");
      await user.click(within(dialog).getByRole("button", { name: "만들기" }));

      await waitFor(() => expect(window.location.hash).toMatch(/^#\/home\/[0-9a-f]{32}$/));
      const planId = window.location.hash.slice("#/home/".length);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 1, name: "우리 집" })).toBeInTheDocument();
      expect(storedPlans(storage).map((plan) => [plan.id, plan.name])).toEqual([
        [planId, "우리 집"],
      ]);
      expect(storedPlans(storage)[0].spaces.map((space) => space.name)).toEqual(
        P_DEFAULT_SPACE_NAMES,
      );
      const storedRaw = storage.getItem(INTERIOR_PLANS_STORAGE_KEY);

      // 새로고침: 같은 저장소로 앱을 다시 띄운다
      unmount();
      await renderApp(storage, `#/home/${planId}`);
      expect(screen.getByRole("heading", { level: 1, name: "우리 집" })).toBeInTheDocument();
      expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe(storedRaw);
    });

    it("방 1·욕실 1이면 공간 7개(욕실1·방1만)", async () => {
      const user = userEvent.setup();
      const storage = createMemoryStorage();
      await renderApp(storage);
      await user.click(screen.getByRole("button", { name: "계획 만들기" }));
      const dialog = screen.getByRole("dialog", { name: "인테리어 계획 만들기" });
      await user.type(within(dialog).getByRole("textbox", { name: "계획 이름" }), "작은 집");
      await user.click(
        within(within(dialog).getByRole("group", { name: "방 수" })).getByRole("radio", {
          name: "1개",
        }),
      );
      await user.click(
        within(within(dialog).getByRole("group", { name: "욕실 수" })).getByRole("radio", {
          name: "1개",
        }),
      );
      await user.click(within(dialog).getByRole("button", { name: "만들기" }));
      await waitFor(() => expect(window.location.hash).toMatch(/^#\/home\/[0-9a-f]{32}$/));
      expect(storedPlans(storage)[0].spaces.map((space) => space.name)).toEqual([
        "전체",
        "현관",
        "거실",
        "주방",
        "욕실1",
        "방1",
        "베란다",
      ]);
    });
  });

  describe("AC-5 상한", () => {
    it("플랜 2개면 고르기에서 [계획 만들기] 활성, 3개면 비활성과 안내", async () => {
      const plan = (id: string, name: string) => makePlanP({ id, name });
      const { unmount } = await renderApp(storageWith([plan("p1", "첫째"), plan("p2", "둘째")]));
      expect(screen.getByRole("heading", { name: "계획 고르기" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "계획 만들기" })).toBeEnabled();
      unmount();

      await renderApp(storageWith([plan("p1", "첫째"), plan("p2", "둘째"), plan("p3", "셋째")]));
      expect(
        screen
          .getAllByRole("link")
          .filter((link) => link.getAttribute("href")?.startsWith("#/home/")),
      ).toHaveLength(3);
      expect(screen.getByRole("button", { name: "계획 만들기" })).toBeDisabled();
      expect(screen.getByText("계획은 3개까지 만들 수 있습니다")).toBeInTheDocument();
    });

    it("플랜 3개면 계획 관리의 [다른 계획 만들기]도 비활성", async () => {
      const user = userEvent.setup();
      const plans = ["p1", "p2", "p3"].map((id) => makePlanP({ id, name: id }));
      await renderApp(storageWith(plans), "#/home/p1");
      await user.click(screen.getByRole("button", { name: "계획 관리" }));
      expect(screen.getByRole("button", { name: "다른 계획 만들기" })).toBeDisabled();
    });
  });
});
