// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import {
  INTERIOR_PROCESS_BASE_DATE,
  INTERIOR_PROCESS_SOURCES,
  INTERIOR_TRADES,
} from "@/lib/constants/interiorPlan";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { PRIVACY_MODE_STORAGE_KEY } from "@/lib/utils/privacyModeStorage";
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

/** 로그아웃 상태(`/api/me` → user null). 우리 집은 아직 로컬 스토어만 쓴다 */
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

function renderApp(storage: Storage, hash = "#/home") {
  window.location.hash = hash;
  return renderWithQueryClient(<AppRoutes storage={storage} />);
}

const storageWith = (plans: InteriorPlanWithItems[], extra: Record<string, string> = {}) =>
  createMemoryStorage({ [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans(plans), ...extra });

const storedPlans = (storage: Storage) =>
  (
    JSON.parse(storage.getItem(INTERIOR_PLANS_STORAGE_KEY) ?? '{"plans":[]}') as {
      plans: InteriorPlanWithItems[];
    }
  ).plans;

/** 요약 줄의 큰 값(남은 예산·앞으로 낼 돈) */
const headlineValue = (label: string) =>
  within(screen.getByRole("region", { name: "요약" })).getByText(label).nextElementSibling
    ?.textContent;

/** 요약 줄의 작은 값(총 예산·예상 총액·확정·지급함) */
const detailValue = (label: string) =>
  within(screen.getByRole("region", { name: "요약" })).getByText(label, { selector: "dt" })
    .nextElementSibling?.textContent;

/** 목록 묶음(공간별·공종별)의 [이름, 제목 줄 글자] */
function itemGroups() {
  return screen
    .getAllByRole("region")
    .filter((region) => !["요약", "할 일"].includes(region.getAttribute("aria-label") ?? ""))
    .filter((region) => region.hasAttribute("aria-label"))
    .map((region) => within(region).getByRole("heading", { level: 3 }).textContent);
}

/** 할 일 묶음 하나의 줄 글자 */
function todoEntries(title: RegExp) {
  const heading = within(screen.getByRole("region", { name: "할 일" })).getByRole("heading", {
    name: title,
  });
  const group = heading.parentElement as HTMLElement;
  return within(group)
    .getAllByRole("button")
    .map((button) => button.textContent);
}

async function openSpacesSheet(user: User) {
  await user.click(screen.getByRole("button", { name: "공간 편집" }));
  return screen.getByRole("dialog", { name: "공간 편집" });
}

const spaceNamesIn = (dialog: HTMLElement) =>
  within(dialog)
    .getAllByRole("textbox")
    .map((input) => (input as HTMLInputElement).value);

async function openNewItemSheet(user: User) {
  await user.click(screen.getByRole("button", { name: "항목 추가" }));
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
      const { unmount } = renderApp(storage);

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
      expect(spaceNamesIn(await openSpacesSheet(user))).toEqual(P_DEFAULT_SPACE_NAMES);

      // 새로고침: 같은 저장소로 앱을 다시 띄운다
      unmount();
      renderApp(storage, `#/home/${planId}`);
      expect(screen.getByRole("heading", { level: 1, name: "우리 집" })).toBeInTheDocument();
      expect(spaceNamesIn(await openSpacesSheet(user))).toEqual(P_DEFAULT_SPACE_NAMES);
    });

    it("방 1·욕실 1이면 공간 7개(욕실1·방1만)", async () => {
      const user = userEvent.setup();
      const storage = createMemoryStorage();
      renderApp(storage);
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
      expect(spaceNamesIn(await openSpacesSheet(user))).toEqual([
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

  describe("AC-2·3·4 플랜 P 화면 값 (기기 날짜 2026-11-10)", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(2026, 10, 10, 12, 0, 0));
    });

    it("요약: 남은 예산 370 · 앞으로 낼 돈 1,250 · 총 예산 3,000 · 예상 총액 2,630 · 확정 1,530 · 지급함 280, ③에 50만원 초과", () => {
      renderApp(storageWith([makePlanP()]));
      expect(headlineValue("남은 예산")).toBe("370만원");
      expect(headlineValue("앞으로 낼 돈")).toBe("1,250만원");
      expect(detailValue("총 예산")).toBe("3,000만원");
      expect(detailValue("예상 총액")).toBe("2,630만원");
      expect(detailValue("확정")).toBe("1,530만원");
      expect(detailValue("지급함")).toBe("280만원");
      expect(screen.getByRole("button", { name: "전체 샷시 열기" })).toHaveTextContent(
        "1,250만원50만원 초과",
      );
      expect(screen.getAllByText(/초과$/)).toHaveLength(1);
    });

    it("총 예산 2,500 → '예산 초과 130만원'", () => {
      renderApp(storageWith([makePlanP({ budget: 2500 })]));
      expect(headlineValue("남은 예산")).toBe("예산 초과 130만원");
    });

    it("총 예산이 없으면 남은 예산 칸 대신 [총 예산 입력], 누르면 계획 관리 시트", async () => {
      const user = userEvent.setup();
      const { budget: _budget, ...withoutBudget } = makePlanP();
      void _budget;
      renderApp(storageWith([withoutBudget]));
      expect(detailValue("총 예산")).toBe("—");
      await user.click(screen.getByRole("button", { name: "총 예산 입력" }));
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("공간별 묶음은 전체 1,250 · 거실 280 · 주방 500 · 욕실1 600(항목 없는 공간 숨김), [공종별] → ?view=trade, 샷시 → 타일 → 도배 → 주방가구", async () => {
      const user = userEvent.setup();
      renderApp(storageWith([makePlanP()]), "#/home/plan-p");
      expect(itemGroups()).toEqual(["전체1,250만원", "거실280만원", "주방500만원", "욕실1600만원"]);

      await user.click(screen.getByRole("radio", { name: "공종별" }));
      await waitFor(() => expect(window.location.hash).toBe("#/home/plan-p?view=trade"));
      expect(itemGroups()).toEqual([
        "샷시1,250만원",
        "타일600만원",
        "도배280만원",
        "주방가구500만원",
      ]);
      expect(screen.getByRole("radio", { name: "공종별" })).toBeChecked();

      await user.click(screen.getByRole("radio", { name: "공간별" }));
      await waitFor(() => expect(window.location.hash).toBe("#/home/plan-p"));
      expect(itemGroups()[0]).toBe("전체1,250만원");
    });

    it("?view=trade로 열면(새로고침) 공종별 그대로", () => {
      renderApp(storageWith([makePlanP()]), "#/home/plan-p?view=trade");
      expect(screen.getByRole("radio", { name: "공종별" })).toBeChecked();
      expect(itemGroups()[0]).toBe("샷시1,250만원");
    });

    it("할 일: 지급 예정 샷시 잔금 1,000(11/5 지남) → 도배 잔금 250(11/20), 견적 받기 주방가구, 확정하기 타일", () => {
      renderApp(storageWith([makePlanP()]));
      expect(todoEntries(/^지급 예정/)).toEqual([
        "전체 · 샷시 잔금1,000만원 · 11/5지남",
        "거실 · 도배 잔금250만원 · 11/20",
      ]);
      expect(todoEntries(/^견적 받기/)).toEqual(["주방 · 주방가구"]);
      expect(todoEntries(/^확정하기/)).toEqual(["욕실1 · 타일견적 1개"]);
    });

    it("샷시 잔금을 시트에서 지급함으로 저장 → 지급 예정에서 사라지고 지급함 1,280 · 앞으로 낼 돈 250", async () => {
      const user = userEvent.setup();
      renderApp(storageWith([makePlanP()]));
      await user.click(screen.getByRole("button", { name: "전체 샷시 열기" }));
      const dialog = screen.getByRole("dialog", { name: "항목" });
      expect(
        within(dialog).getByText("지급 합계 1,250만원 / 확정 1,250만원 — 0만원 남음"),
      ).toBeInTheDocument();
      await user.click(within(dialog).getByRole("checkbox", { name: "지급 2 지급함" }));
      await user.click(within(dialog).getByRole("button", { name: "저장" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(todoEntries(/^지급 예정/)).toEqual(["거실 · 도배 잔금250만원 · 11/20"]);
      expect(detailValue("지급함")).toBe("1,280만원");
      expect(headlineValue("앞으로 낼 돈")).toBe("250만원");
    });

    it("(a) 시트에서 견적 D로 확정을 옮기면 확정 1,430 · 초과 사라짐 · 앞으로 낼 돈 1,150", async () => {
      const user = userEvent.setup();
      renderApp(storageWith([makePlanP()]));
      await user.click(screen.getByRole("button", { name: "전체 샷시 열기" }));
      const dialog = screen.getByRole("dialog", { name: "항목" });
      await user.click(within(dialog).getByRole("radio", { name: "견적 1 확정" }));
      await user.click(within(dialog).getByRole("button", { name: "저장" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(detailValue("확정")).toBe("1,430만원");
      expect(detailValue("지급함")).toBe("280만원");
      expect(headlineValue("앞으로 낼 돈")).toBe("1,150만원");
      expect(screen.queryAllByText(/초과$/)).toHaveLength(0);
    });
  });

  describe("항목 시트: 확정·상태 전이 (AC-1·AC-4)", () => {
    it("견적 중 항목의 견적을 [확정]하면 상태가 '확정'으로 바뀌고 저장된다", async () => {
      const user = userEvent.setup();
      const storage = storageWith([makePlanP()]);
      renderApp(storage);
      await user.click(screen.getByRole("button", { name: "욕실1 타일 열기" }));
      const dialog = screen.getByRole("dialog", { name: "항목" });
      const status = within(dialog).getByRole("group", { name: "상태" });
      expect(within(status).getByRole("radio", { name: "견적 중" })).toBeChecked();
      await user.click(within(dialog).getByRole("radio", { name: "견적 1 확정" }));
      expect(within(status).getByRole("radio", { name: "확정" })).toBeChecked();
      await user.click(within(dialog).getByRole("button", { name: "저장" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      const tile = storedPlans(storage)[0].items.find((item) => item.id === "item-tile");
      expect([tile?.confirmedQuoteId, tile?.status]).toEqual(["q-c", "confirmed"]);
      expect(detailValue("확정")).toBe("2,180만원");
    });

    it("진행 중 항목에서 확정해도 상태는 진행 중 그대로", async () => {
      const user = userEvent.setup();
      const plan = withItem(makePlanP(), "item-tile", (item) => ({
        ...item,
        status: "inProgress",
      }));
      renderApp(storageWith([plan]));
      await user.click(screen.getByRole("button", { name: "욕실1 타일 열기" }));
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
      renderApp(storage);
      await user.click(screen.getByRole("button", { name: "전체 샷시 열기" }));
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
      expect(detailValue("확정")).toBe("280만원");
    });
  });

  describe("AC-5 항목 시트 검증: 오류는 그 칸 아래, 저장 막힘, 입력 유지", () => {
    it("소수 예산·업체 빈칸·견적 금액 0·끝 < 시작 → 각 칸 아래 오류, 저장 안 됨, 입력 그대로 → 고치면 저장", async () => {
      const user = userEvent.setup();
      const storage = storageWith([makePlanP()]);
      const before = storage.getItem(INTERIOR_PLANS_STORAGE_KEY);
      renderApp(storage);

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
      renderApp(storageWith([makePlanP()]));
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
      renderApp(storage);
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
      renderApp(storageWith([makePlanP()]));
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
    it("항목 99개면 [항목 추가] 활성, 100개면 비활성과 안내(공간 묶음 [추가]도 비활성)", () => {
      const bulk = (count: number) =>
        Array.from({ length: count }, (_, index) => ({
          ...makePlanP().items[3],
          id: `bulk${index}`,
        }));
      const { unmount } = renderApp(storageWith([makePlanP({ items: bulk(99) })]));
      expect(screen.getByRole("button", { name: "항목 추가" })).toBeEnabled();
      unmount();

      renderApp(storageWith([makePlanP({ items: bulk(100) })]));
      expect(screen.getByRole("button", { name: "항목 추가" })).toBeDisabled();
      expect(screen.getByText("항목은 계획마다 100개까지 적을 수 있습니다")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "주방에 항목 추가" })).toBeDisabled();
    });

    it("플랜 2개면 고르기에서 [계획 만들기] 활성, 3개면 비활성과 안내", () => {
      const plan = (id: string, name: string) => makePlanP({ id, name });
      const { unmount } = renderApp(storageWith([plan("p1", "첫째"), plan("p2", "둘째")]));
      expect(screen.getByRole("heading", { name: "계획 고르기" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "계획 만들기" })).toBeEnabled();
      unmount();

      renderApp(storageWith([plan("p1", "첫째"), plan("p2", "둘째"), plan("p3", "셋째")]));
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
      renderApp(storageWith(plans), "#/home/p1");
      await user.click(screen.getByRole("button", { name: "계획 관리" }));
      expect(screen.getByRole("button", { name: "다른 계획 만들기" })).toBeDisabled();
    });
  });

  describe("AC-5 공간 삭제 막기", () => {
    it("항목 있는 공간 삭제 → '이 공간의 항목 n개를 먼저 옮기거나 지우세요', 공간은 남는다. 빈 공간은 지울 수 있다", async () => {
      const user = userEvent.setup();
      const plan = makePlanP();
      const twoInLiving = {
        ...plan,
        items: [
          ...plan.items,
          {
            ...plan.items[0],
            id: "item-living-2",
            trade: "조명",
            createdAt: plan.items[3].createdAt,
          },
        ],
      };
      const storage = storageWith([twoInLiving]);
      renderApp(storage);
      const dialog = await openSpacesSheet(user);

      await user.click(within(dialog).getByRole("button", { name: "거실 삭제" }));
      expect(within(dialog).getByRole("alert")).toHaveTextContent(
        "이 공간의 항목 2개를 먼저 옮기거나 지우세요",
      );
      expect(spaceNamesIn(dialog)).toContain("거실");

      await user.click(within(dialog).getByRole("button", { name: "주방 삭제" }));
      expect(within(dialog).getByRole("alert")).toHaveTextContent(
        "이 공간의 항목 1개를 먼저 옮기거나 지우세요",
      );

      await user.click(within(dialog).getByRole("button", { name: "현관 삭제" }));
      expect(spaceNamesIn(dialog)).not.toContain("현관");
      await user.click(within(dialog).getByRole("button", { name: "저장" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(storedPlans(storage)[0].spaces.map((space) => space.name)).toEqual(
        P_DEFAULT_SPACE_NAMES.filter((name) => name !== "현관"),
      );
    });
  });

  describe("가리기 (화면 · 반복 사용 불편 방지)", () => {
    const planWithPrivateText = () =>
      withItem(makePlanP(), "item-sash", (item) => ({
        ...item,
        quotes: item.quotes?.map((quote) => ({
          ...quote,
          contact: "010-1234-5678",
          memo: "현장 실측 완료",
        })),
        memo: "베란다 확장 포함",
      }));

    const pageText = () => document.body.textContent ?? "";

    it("[가리기]를 켜면 금액을 렌더하지 않고(•••), 연락처·메모는 플랜 화면에 없다. 끄면 다시 보인다", async () => {
      const user = userEvent.setup();
      const storage = storageWith([planWithPrivateText()]);
      renderApp(storage);
      expect(pageText()).toMatch(/\d만원/);

      await user.click(screen.getByRole("button", { name: "가리기" }));
      expect(screen.getByRole("button", { name: "가리기" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(pageText()).not.toMatch(/\d만원/);
      // 날짜(11/5)는 금액이 아니라 보인다. 금액 숫자는 단위 없이도 남지 않는다
      for (const amount of ["370", "1,250", "3,000", "2,630", "1,530", "280", "1,000", "250"]) {
        expect(pageText()).not.toContain(amount);
      }
      expect(screen.getAllByText("•••").length).toBeGreaterThan(0);
      for (const secret of ["010-1234-5678", "현장 실측 완료", "베란다 확장 포함"]) {
        expect(pageText()).not.toContain(secret);
      }
      // 저장 목록과 같은 설정 키다
      expect(storage.getItem(PRIVACY_MODE_STORAGE_KEY)).toBe("true");

      await user.click(screen.getByRole("button", { name: "가리기" }));
      expect(headlineValue("앞으로 낼 돈")).toBe("1,250만원");
    });

    it("이미 가리기가 켜져 있으면(저장 목록에서 켬) 처음부터 가린다", () => {
      renderApp(storageWith([makePlanP()], { [PRIVACY_MODE_STORAGE_KEY]: "true" }));
      expect(screen.getByRole("button", { name: "가리기" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(pageText()).not.toMatch(/\d만원/);
    });
  });

  describe("AC-3 공정 순서 시트·공종 칩", () => {
    it("14단계 · '자료마다 다릅니다' 문구 · 출처 2개 · 기준일", async () => {
      const user = userEvent.setup();
      renderApp(storageWith([makePlanP()]));
      await user.click(screen.getByRole("button", { name: "공정 순서" }));
      const dialog = screen.getByRole("dialog", { name: "공정 순서" });
      const steps = within(within(dialog).getAllByRole("list")[0]).getAllByRole("listitem");
      expect(steps.map((step) => step.textContent?.replace(/^\d+/, ""))).toEqual([
        "철거",
        "샷시",
        "설비",
        "전기",
        "목공",
        "타일",
        "욕실",
        "도장",
        "필름",
        "도배",
        "바닥",
        "주방가구",
        "조명",
        "입주 청소",
      ]);
      expect(
        within(dialog).getByText(
          "타일과 도장, 도배와 바닥의 앞뒤는 자료마다 다릅니다. 업체와 일정을 맞추세요",
        ),
      ).toBeInTheDocument();
      const sources = within(dialog).getAllByRole("link");
      expect(sources).toHaveLength(2);
      expect(sources.map((link) => link.getAttribute("href"))).toEqual(
        INTERIOR_PROCESS_SOURCES.map((source) => source.url),
      );
      expect(sources.map((link) => link.getAttribute("href"))).toEqual([
        expect.stringContaining("ajd.co.kr"),
        "https://weolbu.com/community/2470493",
      ]);
      expect(within(dialog).getByText(`기준일 ${INTERIOR_PROCESS_BASE_DATE}`)).toBeInTheDocument();
      expect(INTERIOR_PROCESS_BASE_DATE).toBe("2026-10-26");
    });

    it("항목 시트의 공종 칩 순서가 공정 순서 상수와 같다", async () => {
      const user = userEvent.setup();
      renderApp(storageWith([makePlanP()]));
      const dialog = await openNewItemSheet(user);
      const chips = within(within(dialog).getByRole("group", { name: "공종 고르기" })).getAllByRole(
        "button",
      );
      expect(chips.map((chip) => chip.textContent)).toEqual(INTERIOR_TRADES);
    });
  });
});
