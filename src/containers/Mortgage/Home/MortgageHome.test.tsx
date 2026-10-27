// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { INTERIOR_TRADES } from "@/lib/constants/interiorPlan";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { makePlanP, toStoredPlans, withItem } from "@/test/interiorPlanFixture";
import { createMemoryStorage } from "@/test/memoryStorage";
import { renderWithQueryClient } from "@/test/renderWithQueryClient";

import type { InteriorItem, InteriorPlanWithItems } from "@/lib/types/interiorPlan";

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

type User = ReturnType<typeof userEvent.setup>;

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

/** 요약 줄의 큰 값(남은 예산·지출 예정) */
const headlineValue = (label: string) =>
  within(screen.getByRole("region", { name: "요약" })).getByText(label).nextElementSibling
    ?.textContent;

async function openNewItemSheet(user: User) {
  await user.click(screen.getByRole("button", { name: "줄 추가" }));
  return screen.getByRole("dialog", { name: "항목 추가" });
}

describe("우리 집 화면 (스펙 interior-planner AC-1~5)", () => {
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

  describe("항목 시트: 확정·상태 전이 (AC-1·AC-4)", () => {
    it("견적 중 항목의 견적을 [확정]하면 상태가 '확정'으로 바뀌고 저장된다", async () => {
      const user = userEvent.setup();
      const storage = storageWith([makePlanP()]);
      await renderApp(storage);
      await user.click(screen.getByRole("button", { name: "타일 C타일 열기" }));
      const dialog = screen.getByRole("dialog", { name: "항목" });
      const status = within(dialog).getByRole("group", { name: "상태" });
      expect(within(status).getByRole("radio", { name: "견적 중" })).toBeChecked();
      await user.click(within(dialog).getByRole("radio", { name: "견적 1 확정" }));
      expect(within(status).getByRole("radio", { name: "확정" })).toBeChecked();
      await user.click(within(dialog).getByRole("button", { name: "저장" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      const tile = storedPlans(storage)[0].items.find((item) => item.id === "item-tile");
      expect([tile?.confirmedQuoteId, tile?.status]).toEqual(["q-c", "confirmed"]);
      expect(headlineValue("지출 예정")).toBe("2,180만원");
    });

    it("진행 중 항목에서 확정해도 상태는 진행 중 그대로", async () => {
      const user = userEvent.setup();
      const plan = withItem(makePlanP(), "item-tile", (item) => ({
        ...item,
        status: "inProgress",
      }));
      await renderApp(storageWith([plan]));
      await user.click(screen.getByRole("button", { name: "타일 C타일 열기" }));
      const dialog = screen.getByRole("dialog", { name: "항목" });
      await user.click(within(dialog).getByRole("radio", { name: "견적 1 확정" }));
      expect(
        within(within(dialog).getByRole("group", { name: "상태" })).getByRole("radio", {
          name: "진행 중",
        }),
      ).toBeChecked();
    });

    it("확정한 견적 E를 지우면 확정이 풀리고, 저장하면 confirmedQuoteId 키가 없다", async () => {
      const user = userEvent.setup();
      const storage = storageWith([makePlanP()]);
      await renderApp(storage);
      await user.click(screen.getByRole("button", { name: "샷시 E샷시 열기" }));
      const dialog = screen.getByRole("dialog", { name: "항목" });
      expect(within(dialog).getByRole("radio", { name: "견적 2 확정" })).toBeChecked();
      await user.click(within(dialog).getByRole("button", { name: "견적 2 삭제" }));
      expect(within(dialog).getByRole("radio", { name: "견적 1 확정" })).not.toBeChecked();
      expect(within(dialog).queryByRole("button", { name: "확정 취소" })).not.toBeInTheDocument();
      await user.click(within(dialog).getByRole("button", { name: "저장" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      const sash = storedPlans(storage)[0].items.find((item) => item.id === "item-sash");
      expect(sash?.quotes?.map((quote) => quote.id)).toEqual(["q-d"]);
      expect(sash !== undefined && "confirmedQuoteId" in sash).toBe(false);
      expect(headlineValue("지출 예정")).toBe("280만원");
    });
  });

  describe("AC-5 항목 시트 검증: 오류는 그 칸 아래, 저장 막힘, 입력 유지", () => {
    it("소수 예산·업체 빈칸·견적 금액 0·끝 < 시작 → 각 칸 아래 오류, 저장 안 됨, 입력 그대로 → 고치면 저장", async () => {
      const user = userEvent.setup();
      const storage = storageWith([makePlanP()]);
      const before = storage.getItem(INTERIOR_PLANS_STORAGE_KEY);
      await renderApp(storage);

      const dialog = await openNewItemSheet(user);
      await user.click(
        within(within(dialog).getByRole("group", { name: "공종 고르기" })).getByRole("button", {
          name: "타일",
        }),
      );
      const budget = within(dialog).getByLabelText("예산(선택)");
      await user.type(budget, "123.5");
      await user.click(within(dialog).getByRole("button", { name: "견적 추가" }));
      const vendor = within(dialog).getByRole("textbox", { name: "견적 1 업체" });
      const amount = within(dialog).getByLabelText("견적 1 금액");
      await user.type(amount, "0");
      const start = within(dialog).getByLabelText("시작");
      const end = within(dialog).getByLabelText("끝");
      fireEvent.change(start, { target: { value: "2026-11-10" } });
      fireEvent.change(end, { target: { value: "2026-11-01" } });

      await user.click(within(dialog).getByRole("button", { name: "저장" }));

      expect(budget).toHaveAccessibleDescription(
        expect.stringContaining("정수(만원 단위)로 입력하세요"),
      );
      expect(vendor).toHaveAccessibleDescription("업체 이름을 입력하세요");
      expect(amount).toHaveAccessibleDescription("0보다 큰 금액을 입력하세요");
      expect(end).toHaveAccessibleDescription("끝 날짜가 시작 날짜보다 앞입니다");
      expect(start).not.toHaveAccessibleDescription();
      // 오류 문구는 그 칸 바로 뒤(같은 칸 묶음 안)에 있다
      for (const input of [vendor, end]) {
        const error = document.getElementById(`${input.id}-error`) as HTMLElement;
        expect(input.parentElement).toContainElement(error);
        expect(
          input.compareDocumentPosition(error) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      }
      // 첫 오류(예산)로 포커스
      expect(budget).toHaveFocus();
      // 저장되지 않고 입력이 그대로다
      expect(screen.getByRole("dialog", { name: "항목 추가" })).toBe(dialog);
      expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe(before);
      expect(budget).toHaveValue("123.5");
      expect(amount).toHaveValue("0");
      expect(end).toHaveValue("2026-11-01");

      // 고치면 저장된다(반올림 없이 입력한 정수 그대로)
      await user.clear(budget);
      await user.type(budget, "600");
      await user.type(vendor, "가나타일");
      await user.clear(amount);
      await user.type(amount, "650");
      fireEvent.change(end, { target: { value: "2026-11-10" } });
      await user.click(within(dialog).getByRole("button", { name: "저장" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

      const added = storedPlans(storage)[0].items.at(-1) as InteriorItem;
      expect(added).toMatchObject({
        spaceId: "sp-all",
        trade: "타일",
        budget: 600,
        quotes: [{ vendor: "가나타일", amount: 650 }],
        status: "planned",
        startDate: "2026-11-10",
        endDate: "2026-11-10",
      });
    });

    it("예산 1,000,000,000은 오류, 999,999,999는 통과", async () => {
      const user = userEvent.setup();
      await renderApp(storageWith([makePlanP()]));
      const dialog = await openNewItemSheet(user);
      await user.type(within(dialog).getByRole("textbox", { name: "공종" }), "방충망");
      const budget = within(dialog).getByLabelText("예산(선택)");
      await user.type(budget, "1000000000");
      await user.click(within(dialog).getByRole("button", { name: "저장" }));
      expect(budget).toHaveAccessibleDescription(
        expect.stringContaining("최대 9자리(999,999,999만원)까지 입력할 수 있습니다"),
      );
      await user.clear(budget);
      await user.type(budget, "999999999");
      await user.click(within(dialog).getByRole("button", { name: "저장" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("공종 31자는 오류, 30자는 저장(직접 입력 공종은 공종별 맨 뒤)", async () => {
      const user = userEvent.setup();
      const storage = storageWith([makePlanP()]);
      await renderApp(storage);
      const dialog = await openNewItemSheet(user);
      const trade = within(dialog).getByRole("textbox", { name: "공종" });
      await user.type(trade, "가".repeat(31));
      await user.click(within(dialog).getByRole("button", { name: "저장" }));
      expect(trade).toHaveAccessibleDescription(
        expect.stringContaining("30자 이하로 입력하세요(현재 31자)"),
      );
      expect(storedPlans(storage)[0].items).toHaveLength(4);
      await user.type(trade, "{Backspace}");
      await user.click(within(dialog).getByRole("button", { name: "저장" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(storedPlans(storage)[0].items.at(-1)?.trade).toBe("가".repeat(30));
    });

    it("견적 5개면 [견적 추가] 비활성과 안내", async () => {
      const user = userEvent.setup();
      await renderApp(storageWith([makePlanP()]));
      const dialog = await openNewItemSheet(user);
      const addQuote = within(dialog).getByRole("button", { name: "견적 추가" });
      for (let count = 1; count <= 4; count += 1) {
        await user.click(addQuote);
        expect(addQuote).toBeEnabled();
      }
      await user.click(addQuote);
      expect(within(dialog).getAllByRole("textbox", { name: /^견적 \d 업체$/ })).toHaveLength(5);
      expect(addQuote).toBeDisabled();
      expect(within(dialog).getByText("견적은 5개까지 적을 수 있습니다")).toBeInTheDocument();
      // 하나 지우면 다시 추가할 수 있다
      await user.click(within(dialog).getByRole("button", { name: "견적 5 삭제" }));
      expect(addQuote).toBeEnabled();
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

  describe("항목 시트 공종 칩", () => {
    it("항목 시트의 공종 칩 순서가 공정 순서 상수와 같다", async () => {
      const user = userEvent.setup();
      await renderApp(storageWith([makePlanP()]));
      const dialog = await openNewItemSheet(user);
      const chips = within(within(dialog).getByRole("group", { name: "공종 고르기" })).getAllByRole(
        "button",
      );
      expect(chips.map((chip) => chip.textContent)).toEqual(INTERIOR_TRADES);
    });
  });
});
