// @vitest-environment jsdom
// 스펙 interior-planner "표 내보내기"(태스크 5-2) 화면: AC-11(표 내용·병합·합계·표 머리), AC-12(a)(c)(d)(e)(f)(g).
// 줄·계·표 머리는 interior-simple(줄 모델, AC-5)로 바꿨다.
// 내려받기는 `downloadTextFile`을 vi.mock해 인자(파일 이름, CSV 문자열)만 보고, 인쇄는 window.print 스파이로 센다.
// 저장소는 createMemoryStorage의 스파이로 모든 키 쓰기를 세고, 서버 요청은 fetch 스파이 횟수로 비교한다.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { INTERIOR_PLAN_TABLE_EMPTY_MESSAGE } from "@/lib/constants/interiorPlanTable";
import { downloadTextFile } from "@/lib/utils/downloadTextFile";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { LISTINGS_STORAGE_KEY } from "@/lib/utils/listingStorage";
import { PRIVACY_MODE_STORAGE_KEY } from "@/lib/utils/privacyModeStorage";
import { SESSION_HINT_STORAGE_KEY } from "@/lib/utils/sessionHintStorage";
import { TEXT_SIZE_STORAGE_KEY } from "@/lib/utils/textSizeStorage";
import { createFakePlanApi } from "@/test/fakePlanApi";
import { P_SPACES, pTime, toStoredPlans } from "@/test/interiorPlanFixture";
import { makePlanQ, Q_CSV, Q_FILE_NAME, Q_TABLE_TEXT } from "@/test/interiorPlanTableFixture";
import {
  LEGACY_L_CSV_LINES,
  makePlanL,
  makeSimplePlanP,
  SIMPLE_P_CSV_LINES,
  toCsvFile,
} from "@/test/interiorSimpleFixture";
import { makeListing } from "@/test/listingFixture";
import { createMemoryStorage } from "@/test/memoryStorage";
import { renderWithQueryClient } from "@/test/renderWithQueryClient";

import type { InteriorItem, InteriorPlanWithItems } from "@/lib/types/interiorPlan";
import type { MockInstance } from "vitest";

vi.mock("@/lib/utils/downloadTextFile", () => ({ downloadTextFile: vi.fn() }));

const download = vi.mocked(downloadTextFile);

const Q_TITLE = "우리 집 인테리어 계획";
const Q_LINE =
  "2026-10-27 기준 · 총 예산 15,000,000원 · 지출 예정 7,500,000원 · 남은 예산 7,500,000원";
const HEADER_TEXT = ["구분", "업체", "세부내용", "견적(원)", "확정(원)", "비고"];
const SCROLL_LABEL = "계획 표 (가로로 스크롤)";
const PRIVACY_NOTICE = "가리기를 끄면 내려받기·인쇄할 수 있습니다";
const BROWSER_NOTICE = "내려받기·인쇄가 안 되면 Safari·Chrome에서 열어 주세요";

/** 기기 날짜 2026-10-27(로컬 생성자라 시간대와 무관) */
const OCT_27_NOON = new Date(2026, 9, 27, 12, 0, 0);

function stubLoggedOutApi() {
  const fetchMock = vi.fn(async (input: string) => {
    const isMe = String(input) === "/api/me";
    return new Response(JSON.stringify(isMe ? { user: null } : { error: "notFound" }), {
      status: isMe ? 200 : 404,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const storageWith = (plans: InteriorPlanWithItems[], extra: Record<string, string> = {}) =>
  createMemoryStorage({ [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans(plans), ...extra });

/** 로그인 확인(`/api/me`)이 끝나 플랜 화면이 보일 때까지 기다린다 */
async function renderApp(storage: Storage, hash: string) {
  window.location.hash = hash;
  const result = renderWithQueryClient(<AppRoutes storage={storage} />);
  await waitFor(() =>
    expect(screen.queryByText("인테리어 계획을 불러오는 중")).not.toBeInTheDocument(),
  );
  return result;
}

const planTable = (title = Q_TITLE) => screen.getByRole("table", { name: title });
const downloadButton = () => screen.getByRole("button", { name: "CSV 내려받기" });
const printButton = () => screen.getByRole("button", { name: "인쇄·PDF" });

/** 표의 줄마다 칸 글자(병합된 구분 칸은 첫 줄에만 있다) */
const tableText = (table: HTMLElement) =>
  Array.from(table.querySelectorAll("tr")).map((row) =>
    Array.from(row.querySelectorAll("th, td")).map((cell) => cell.textContent ?? ""),
  );

/** 비활성 버튼을 우회해 React onClick을 직접 부른다(강제 클릭) */
function forceReactClick(button: HTMLElement) {
  const propsKey = Object.keys(button).find((key) => key.startsWith("__reactProps$"));
  if (propsKey === undefined) throw new Error("React props를 찾지 못함");
  const props = (button as unknown as Record<string, { onClick?: (event: unknown) => void }>)[
    propsKey
  ];
  expect(props.onClick).toBeTypeOf("function");
  act(() => props.onClick?.({ currentTarget: button, preventDefault() {} }));
}

/** 저장소 쓰기 스파이(키 무관) */
function spyStorageWrites(storage: Storage) {
  return {
    setItem: vi.spyOn(storage, "setItem"),
    removeItem: vi.spyOn(storage, "removeItem"),
    clear: vi.spyOn(storage, "clear"),
  };
}

/** 주입한 저장소를 거치지 않고 window.localStorage·sessionStorage에 직접 쓰는 것도 센다 */
function spyBrowserStorageWrites() {
  const spies = [
    vi.spyOn(Storage.prototype, "setItem"),
    vi.spyOn(Storage.prototype, "removeItem"),
    vi.spyOn(Storage.prototype, "clear"),
  ];
  return () => spies.reduce((count, spy) => count + spy.mock.calls.length, 0);
}

let printSpy: MockInstance<() => void>;

beforeEach(() => {
  download.mockReset();
  printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("표 보기 (로그아웃, 기기 날짜 2026-10-27)", () => {
  beforeEach(() => {
    stubLoggedOutApi();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(OCT_27_NOON);
  });

  describe("AC-11 표 내용·병합·합계·표 머리", () => {
    it("Q: [표] 선택, 표 머리 제목·기준일 줄, 표 이름 = 제목, 열 제목 6개와 Q 표 값", async () => {
      await renderApp(storageWith([makePlanQ()]), "#/home/plan-q?view=table");
      expect(screen.getByRole("radio", { name: "표" })).toBeChecked();
      expect(screen.getByRole("heading", { level: 2, name: Q_TITLE })).toBeInTheDocument();
      expect(screen.getByText(Q_LINE)).toBeInTheDocument();

      const table = planTable();
      expect(
        within(table)
          .getAllByRole("columnheader")
          .map((th) => th.textContent),
      ).toEqual(HEADER_TEXT);
      expect(tableText(table)).toEqual([HEADER_TEXT, ...Q_TABLE_TEXT]);
    });

    it("병합: 구분마다 tbody 하나, 첫 줄만 구분 rowheader(rowSpan = 줄 수) + cell 5, 다음 줄은 cell 5, 계 줄 rowheader '계' + cell 5", async () => {
      await renderApp(storageWith([makePlanQ()]), "#/home/plan-q?view=table");
      const table = planTable();
      const bodies = Array.from(table.querySelectorAll("tbody"));
      expect(bodies).toHaveLength(4);

      const bathRows = within(bodies[2]).getAllByRole("row");
      expect(bathRows).toHaveLength(4);
      const [bathFirst, ...bathRest] = bathRows;
      const bathHeader = within(bathFirst).getByRole("rowheader");
      expect(bathHeader).toHaveTextContent("욕실");
      expect((bathHeader as HTMLTableCellElement).rowSpan).toBe(4);
      expect(bathHeader).toHaveAttribute("scope", "rowgroup");
      expect(within(bathFirst).getAllByRole("cell")).toHaveLength(5);
      expect(bathFirst.children).toHaveLength(6);
      for (const row of bathRest) {
        expect(within(row).queryByRole("rowheader")).not.toBeInTheDocument();
        expect(within(row).getAllByRole("cell")).toHaveLength(5);
        expect(row.children).toHaveLength(5);
      }

      for (const [body, trade] of [
        [bodies[0], "바닥"],
        [bodies[1], "필름"],
        [bodies[3], "에어컨"],
      ] as const) {
        const rows = within(body).getAllByRole("row");
        expect(rows).toHaveLength(1);
        const header = within(rows[0]).getByRole("rowheader", { name: trade });
        expect((header as HTMLTableCellElement).rowSpan).toBe(1);
        expect(within(rows[0]).getAllByRole("cell")).toHaveLength(5);
      }

      const footRows = within(table.querySelector("tfoot") as HTMLElement).getAllByRole("row");
      expect(footRows).toHaveLength(1);
      expect(within(footRows[0]).getByRole("rowheader")).toHaveTextContent("계");
      expect(within(footRows[0]).getAllByRole("cell")).toHaveLength(5);
      expect(footRows[0].children).toHaveLength(6);
    });

    it("가로 스크롤 영역: role=region '계획 표 (가로로 스크롤)', tabIndex 0, 안에 표", async () => {
      await renderApp(storageWith([makePlanQ()]), "#/home/plan-q?view=table");
      const region = screen.getByRole("region", { name: SCROLL_LABEL });
      expect(region).toHaveAttribute("tabindex", "0");
      expect(within(region).getByRole("table", { name: Q_TITLE })).toBeInTheDocument();
    });

    it("P: 목록과 같은 순서 5줄 + 계 8,000,000(견적 칸 비움), 표 머리 지출 예정·남은 예산", async () => {
      await renderApp(storageWith([makeSimplePlanP()]), "#/home/plan-simple?view=table");
      expect(tableText(planTable()).slice(1)).toEqual([
        ["도배", "육문수", "실크 전체", "1,800,000", "1,800,000", ""],
        ["동네도배", "합지", "1,500,000", "", ""],
        ["욕실", "하루바스", "철거·방수 (1)", "3,700,000", "3,700,000", ""],
        ["욕실나라", "철거·방수 (1)", "4,000,000", "", ""],
        ["하루바스", "타일 덧방 (2)", "2,500,000", "2,500,000", ""],
        ["계", "", "", "", "8,000,000", ""],
      ]);
      expect(
        screen.getByText(
          "2026-10-27 기준 · 총 예산 10,000,000원 · 지출 예정 8,000,000원 · 남은 예산 2,000,000원",
        ),
      ).toBeInTheDocument();
    });

    it("P 총 예산 700 → 표 머리 '예산 초과 1,000,000원'", async () => {
      await renderApp(
        storageWith([makeSimplePlanP({ budget: 700 })]),
        "#/home/plan-simple?view=table",
      );
      expect(
        screen.getByText(
          "2026-10-27 기준 · 총 예산 7,000,000원 · 지출 예정 8,000,000원 · 예산 초과 1,000,000원",
        ),
      ).toBeInTheDocument();
    });

    it("총 예산이 없으면 표 머리 줄에서 그 조각만 빠진다", async () => {
      const { budget: _budget, ...withoutBudget } = makePlanQ();
      void _budget;
      await renderApp(storageWith([withoutBudget]), "#/home/plan-q?view=table");
      expect(screen.getByText("2026-10-27 기준 · 지출 예정 7,500,000원")).toBeInTheDocument();
    });

    it("합계 0(견적 0개 항목만): 계 줄 확정 '0', 견적 칸 비움", async () => {
      const onlyAircon = makePlanQ({ items: [makePlanQ().items[4]] });
      await renderApp(storageWith([onlyAircon]), "#/home/plan-q?view=table");
      expect(tableText(planTable()).at(-1)).toEqual(["계", "", "", "", "0", ""]);
    });

    it("항목 100개 모두 확정 999,999,999 → 계 '999,999,999,000,000'", async () => {
      const items: InteriorItem[] = Array.from({ length: 100 }, (_, index) => ({
        id: `max-${index}`,
        spaceId: P_SPACES[index % P_SPACES.length].id,
        trade: "도배",
        quotes: [{ id: `mq-${index}`, vendor: "업체", amount: 999_999_999 }],
        confirmedQuoteId: `mq-${index}`,
        status: "confirmed",
        createdAt: pTime(1),
        updatedAt: pTime(1),
      }));
      await renderApp(storageWith([makePlanQ({ items })]), "#/home/plan-q?view=table");
      expect(tableText(planTable()).at(-1)).toEqual(["계", "", "", "", "999,999,999,000,000", ""]);
    });

    it("읽기 전용: 표 보기에는 [줄 추가]·묶음 목록이 없고, 줄·칸을 눌러도 줄 시트가 열리지 않는다", async () => {
      const user = userEvent.setup();
      await renderApp(storageWith([makePlanQ()]), "#/home/plan-q?view=table");
      expect(screen.queryByRole("button", { name: "줄 추가" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /열기$/ })).not.toBeInTheDocument();
      const table = planTable();
      expect(within(table).queryByRole("button")).not.toBeInTheDocument();
      expect(within(table).queryByRole("link")).not.toBeInTheDocument();
      await user.click(within(table).getByRole("rowheader", { name: "욕실" }));
      await user.click(within(table).getByText("동네욕실"));
      await user.click(within(table).getAllByRole("row")[1]);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      // 목록으로 돌아가면 [줄 추가]가 다시 있다
      await user.click(screen.getByRole("radio", { name: "목록" }));
      await waitFor(() => expect(window.location.hash).toBe("#/home/plan-q"));
      expect(screen.getByRole("button", { name: "줄 추가" })).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });
  });

  describe("AC-12(a)(c) 내려받기·인쇄", () => {
    it("[CSV 내려받기] → downloadTextFile(파일 이름 '우리 집-인테리어-2026-10-27.csv', 'Q CSV'와 === 같은 문자열) 1회", async () => {
      const user = userEvent.setup();
      await renderApp(storageWith([makePlanQ()]), "#/home/plan-q?view=table");
      expect(download).not.toHaveBeenCalled();
      await user.click(downloadButton());
      expect(download).toHaveBeenCalledTimes(1);
      const [fileName, text] = download.mock.calls[0];
      expect(fileName).toBe(Q_FILE_NAME);
      expect(text === Q_CSV).toBe(true);
      expect(printSpy).not.toHaveBeenCalled();
    });

    it("P·L의 [CSV 내려받기]도 표와 같은 줄: P 7행, L 6행(옛 비고 조각 없음)", async () => {
      const user = userEvent.setup();
      const storage = storageWith([makeSimplePlanP(), makePlanL()]);
      const first = await renderApp(storage, "#/home/plan-simple?view=table");
      await user.click(downloadButton());
      expect(download.mock.calls[0][0]).toBe("우리 집-인테리어-2026-10-27.csv");
      expect(download.mock.calls[0][1] === toCsvFile(SIMPLE_P_CSV_LINES)).toBe(true);
      first.unmount();

      await renderApp(storage, "#/home/plan-l?view=table");
      await user.click(downloadButton());
      expect(download).toHaveBeenCalledTimes(2);
      expect(download.mock.calls[1][0]).toBe("옛 계획-인테리어-2026-10-27.csv");
      expect(download.mock.calls[1][1] === toCsvFile(LEGACY_L_CSV_LINES)).toBe(true);
    });

    it("항목이 있고 가리기가 꺼져 있으면 버튼 활성 + 안내 'Safari·Chrome에서 열어 주세요'(U21), 가리기 안내 없음", async () => {
      await renderApp(storageWith([makePlanQ()]), "#/home/plan-q?view=table");
      expect(downloadButton()).toBeEnabled();
      expect(printButton()).toBeEnabled();
      expect(screen.getByText(BROWSER_NOTICE)).toBeInTheDocument();
      expect(screen.queryByText(PRIVACY_NOTICE)).not.toBeInTheDocument();
    });

    it("[인쇄·PDF]는 클릭 1회에 window.print 1회, 마운트·보기 전환만으로는 0회", async () => {
      const user = userEvent.setup();
      await renderApp(storageWith([makePlanQ()]), "#/home/plan-q");
      await user.click(screen.getByRole("radio", { name: "표" }));
      await waitFor(() => expect(window.location.hash).toBe("#/home/plan-q?view=table"));
      expect(planTable()).toBeInTheDocument();
      await user.click(screen.getByRole("radio", { name: "목록" }));
      await waitFor(() => expect(window.location.hash).toBe("#/home/plan-q"));
      await user.click(screen.getByRole("radio", { name: "표" }));
      await waitFor(() => expect(window.location.hash).toBe("#/home/plan-q?view=table"));
      expect(printSpy).not.toHaveBeenCalled();

      await user.click(printButton());
      expect(printSpy).toHaveBeenCalledTimes(1);
      expect(download).not.toHaveBeenCalled();
    });

    it("표 보기로 바로 열어도(마운트) window.print 0회", async () => {
      await renderApp(storageWith([makePlanQ()]), "#/home/plan-q?view=table");
      expect(planTable()).toBeInTheDocument();
      expect(printSpy).not.toHaveBeenCalled();
      expect(download).not.toHaveBeenCalled();
    });
  });

  describe("AC-12(d) 가리기·줄 0개", () => {
    it("privacy-mode가 켜져 있어도 표 머리·표·계는 꺼짐과 같고, 버튼 활성 + 고정 안내, CSV는 같은 원문·인쇄 1회", async () => {
      const user = userEvent.setup();
      await renderApp(
        storageWith([makePlanQ()], { [PRIVACY_MODE_STORAGE_KEY]: "true" }),
        "#/home/plan-q?view=table",
      );

      expect(screen.queryByRole("button", { name: "가리기" })).not.toBeInTheDocument();
      expect(screen.getByText(Q_LINE)).toBeInTheDocument();
      expect(tableText(planTable())).toEqual([HEADER_TEXT, ...Q_TABLE_TEXT]);
      expect(document.body.innerHTML).not.toContain("가려짐");
      expect(downloadButton()).toBeEnabled();
      expect(printButton()).toBeEnabled();
      expect(screen.getByText(BROWSER_NOTICE)).toBeInTheDocument();
      expect(screen.queryByText(PRIVACY_NOTICE)).not.toBeInTheDocument();

      await user.click(downloadButton());
      await user.click(printButton());
      expect(download).toHaveBeenCalledTimes(1);
      expect(download.mock.calls[0][1] === Q_CSV).toBe(true);
      expect(printSpy).toHaveBeenCalledTimes(1);
    });

    it("같은 앱에서 저장 목록 [가리기]를 켠 뒤 탭으로 와도 표·내보내기는 그대로, 저장 목록에 돌아가면 여전히 가려져 있다", async () => {
      const user = userEvent.setup();
      const storage = storageWith([makePlanQ()], {
        [LISTINGS_STORAGE_KEY]: JSON.stringify([makeListing()]),
      });
      await renderApp(storage, "#/listings");
      const tab = (name: string) =>
        within(screen.getByRole("navigation", { name: "화면" })).getByRole("link", { name });
      await user.click(await screen.findByRole("button", { name: "가리기" }));
      expect(screen.getByRole("button", { name: "가리기" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.getByRole("main").innerHTML).toContain("가려짐");

      await user.click(tab("인테리어"));
      await user.click(await screen.findByRole("radio", { name: "표" }));
      await waitFor(() => expect(window.location.hash).toBe("#/home?view=table"));
      expect(tableText(planTable())).toEqual([HEADER_TEXT, ...Q_TABLE_TEXT]);
      expect(screen.getByText(Q_LINE)).toBeInTheDocument();
      expect(screen.getByRole("main").innerHTML).not.toContain("가려짐");
      expect(downloadButton()).toBeEnabled();
      expect(screen.queryByText(PRIVACY_NOTICE)).not.toBeInTheDocument();

      await user.click(tab("매물"));
      expect(await screen.findByRole("button", { name: "가리기" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.getByRole("main").innerHTML).toContain("가려짐");
      expect(storage.getItem(PRIVACY_MODE_STORAGE_KEY)).toBe("true");
    });

    it("줄 0개: 표·표 머리 대신 빈 문구, 두 버튼 비활성, 안내 줄 없음, 강제 클릭도 0회", async () => {
      await renderApp(storageWith([makePlanQ({ items: [] })]), "#/home/plan-q?view=table");
      expect(screen.getByText(INTERIOR_PLAN_TABLE_EMPTY_MESSAGE)).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { level: 2, name: Q_TITLE })).not.toBeInTheDocument();
      expect(screen.queryByRole("region", { name: SCROLL_LABEL })).not.toBeInTheDocument();
      expect(downloadButton()).toBeDisabled();
      expect(printButton()).toBeDisabled();
      expect(screen.queryByText(BROWSER_NOTICE)).not.toBeInTheDocument();
      expect(screen.queryByText(PRIVACY_NOTICE)).not.toBeInTheDocument();
      forceReactClick(downloadButton());
      forceReactClick(printButton());
      expect(download).not.toHaveBeenCalled();
      expect(printSpy).not.toHaveBeenCalled();
    });

    it("줄 0개 + 가리기 켜짐: 빈 문구만, 가리기 안내 없음", async () => {
      await renderApp(
        storageWith([makePlanQ({ items: [] })], { [PRIVACY_MODE_STORAGE_KEY]: "true" }),
        "#/home/plan-q?view=table",
      );
      expect(screen.getByText(INTERIOR_PLAN_TABLE_EMPTY_MESSAGE)).toBeInTheDocument();
      expect(downloadButton()).toBeDisabled();
      expect(printButton()).toBeDisabled();
      expect(screen.queryByText(PRIVACY_NOTICE)).not.toBeInTheDocument();
      expect(screen.queryByText(BROWSER_NOTICE)).not.toBeInTheDocument();
    });
  });

  describe("AC-12(g) 날짜는 렌더의 now 하나", () => {
    it("23:59:59에 렌더 → 00:00:01에 클릭해도 표 머리와 파일 이름 모두 2026-10-27", async () => {
      vi.setSystemTime(new Date(2026, 9, 27, 23, 59, 59));
      await renderApp(storageWith([makePlanQ()]), "#/home/plan-q?view=table");
      expect(screen.getByText(Q_LINE)).toBeInTheDocument();

      vi.setSystemTime(new Date(2026, 9, 28, 0, 0, 1));
      fireEvent.click(downloadButton());
      expect(download).toHaveBeenCalledTimes(1);
      expect(download.mock.calls[0][0]).toBe(Q_FILE_NAME);
      expect(screen.getByText(Q_LINE)).toBeInTheDocument();
    });

    it("다음 렌더(보기 전환) 뒤에는 표 머리와 파일 이름이 함께 새 날짜", async () => {
      const user = userEvent.setup();
      vi.setSystemTime(new Date(2026, 9, 27, 23, 59, 59));
      await renderApp(storageWith([makePlanQ()]), "#/home/plan-q?view=table");
      vi.setSystemTime(new Date(2026, 9, 28, 0, 0, 1));
      await user.click(screen.getByRole("radio", { name: "목록" }));
      await user.click(screen.getByRole("radio", { name: "표" }));
      await waitFor(() => expect(window.location.hash).toBe("#/home/plan-q?view=table"));
      expect(screen.getByText(/^2026-10-28 기준 · /)).toBeInTheDocument();
      await user.click(downloadButton());
      expect(download.mock.calls[0][0]).toBe("우리 집-인테리어-2026-10-28.csv");
    });
  });

  describe("AC-12(e) 주소 view=table", () => {
    it("[표] → ?view=table(replace, 이력 안 늘어남) → 새로고침해도 표 → 다른 탭 갔다 뒤로 가기해도 표", async () => {
      const user = userEvent.setup();
      const storage = storageWith([makePlanQ()]);
      const { unmount } = await renderApp(storage, "#/home/plan-q");
      const historyBefore = window.history.length;
      await user.click(screen.getByRole("radio", { name: "표" }));
      await waitFor(() => expect(window.location.hash).toBe("#/home/plan-q?view=table"));
      expect(window.history.length).toBe(historyBefore);
      expect(planTable()).toBeInTheDocument();

      // 새로고침
      unmount();
      await renderApp(storage, "#/home/plan-q?view=table");
      expect(screen.getByRole("radio", { name: "표" })).toBeChecked();
      expect(planTable()).toBeInTheDocument();

      // 다른 화면으로 이동(주소 push, 탭은 replace라 링크 이동처럼 해시를 바꾼다) → 뒤로 가기
      window.location.hash = "#/listings";
      await screen.findByRole("link", { name: "매물", current: "page" });
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      window.history.back();
      await waitFor(() => expect(window.location.hash).toBe("#/home/plan-q?view=table"));
      expect(await screen.findByRole("table", { name: Q_TITLE })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "표" })).toBeChecked();
    });

    it("옛 ?view=trade·space와 list·빈 값·TABLE·모르는 값은 목록(표 없음), 주소에서 view를 지운다(이력 안 늘어남)", async () => {
      const storage = storageWith([makePlanQ()]);
      for (const query of ["trade", "space", "list", "", "TABLE", "bogus"]) {
        // 주소를 연 직후(그 이동 자체의 이력)부터 센다
        window.location.hash = `#/home/plan-q?view=${query}`;
        const historyBefore = window.history.length;
        const view = await renderApp(storage, `#/home/plan-q?view=${query}`);
        await waitFor(() => expect(window.location.hash).toBe("#/home/plan-q"));
        expect(window.history.length, query).toBe(historyBefore);
        expect(screen.getByRole("radio", { name: "목록" })).toBeChecked();
        expect(screen.queryByRole("table")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "줄 추가" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "CSV 내려받기" })).not.toBeInTheDocument();
        view.unmount();
      }
    });

    it("#/home?listing={id}&view=table(연결 플랜 없음) → 만들기 시트, 주소는 listing만 지운 #/home?view=table", async () => {
      const listing = makeListing({ id: "listing-r", name: "래미안 84" });
      const storage = createMemoryStorage({ [LISTINGS_STORAGE_KEY]: JSON.stringify([listing]) });
      window.location.hash = "#/home?listing=listing-r&view=table";
      renderWithQueryClient(<AppRoutes storage={storage} />);
      const sheet = await screen.findByRole("dialog", { name: "인테리어 계획 만들기" });
      expect(within(sheet).getByRole("textbox", { name: "계획 이름" })).toHaveValue("래미안 84");
      await waitFor(() => expect(window.location.hash).toBe("#/home?view=table"));
    });
  });

  describe("AC-12(f) 저장소 쓰기 0회(모든 키)", () => {
    const SEED = {
      [LISTINGS_STORAGE_KEY]: JSON.stringify([makeListing()], null, 2),
      [PRIVACY_MODE_STORAGE_KEY]: "false",
      [TEXT_SIZE_STORAGE_KEY]: "smallest",
    };

    it("표 보기 진입·보기 전환 왕복·내려받기·인쇄 동안 setItem·removeItem·clear 0회, 원문 그대로", async () => {
      const user = userEvent.setup();
      const storage = storageWith([makePlanQ()], SEED);
      const rawBefore = Object.fromEntries(
        Array.from({ length: storage.length }, (_, index) => {
          const key = storage.key(index) as string;
          return [key, storage.getItem(key)];
        }),
      );
      const writes = spyStorageWrites(storage);

      await renderApp(storage, "#/home/plan-q?view=table");
      expect(planTable()).toBeInTheDocument();
      await act(async () => {});
      // 앱 시작의 로그인 확인 결과에 따른 session-hint 정리는 태스크 5 전부터 있던 예외(AC-0, useListingSource)다.
      // 표 보기로 연 마운트에서 그 밖의 쓰기는 없다.
      expect(writes.setItem).not.toHaveBeenCalled();
      expect(writes.clear).not.toHaveBeenCalled();
      expect(writes.removeItem.mock.calls).toEqual([[SESSION_HINT_STORAGE_KEY]]);
      writes.removeItem.mockClear();
      const browserWrites = spyBrowserStorageWrites();

      for (const name of ["목록", "표", "목록", "표"]) {
        await user.click(screen.getByRole("radio", { name }));
      }
      await waitFor(() => expect(window.location.hash).toBe("#/home/plan-q?view=table"));
      await user.click(downloadButton());
      await user.click(printButton());
      expect(download).toHaveBeenCalledTimes(1);
      expect(printSpy).toHaveBeenCalledTimes(1);

      expect(writes.setItem).not.toHaveBeenCalled();
      expect(writes.removeItem).not.toHaveBeenCalled();
      expect(writes.clear).not.toHaveBeenCalled();
      expect(browserWrites()).toBe(0);
      for (const [key, raw] of Object.entries(rawBefore)) {
        expect(storage.getItem(key) === raw).toBe(true);
      }
      expect(storage.length).toBe(Object.keys(rawBefore).length);
    });

    it("privacy-mode가 켜져 있어도 표 보기·보기 전환은 privacy-mode를 포함해 어떤 키에도 쓰지 않는다", async () => {
      const user = userEvent.setup();
      const storage = storageWith([makePlanQ()], { ...SEED, [PRIVACY_MODE_STORAGE_KEY]: "true" });
      await renderApp(storage, "#/home/plan-q?view=table");
      await act(async () => {});
      const writes = spyStorageWrites(storage);

      for (const name of ["목록", "표"]) {
        await user.click(screen.getByRole("radio", { name }));
      }
      await waitFor(() => expect(window.location.hash).toBe("#/home/plan-q?view=table"));

      expect(writes.setItem).not.toHaveBeenCalled();
      expect(writes.removeItem).not.toHaveBeenCalled();
      expect(writes.clear).not.toHaveBeenCalled();
      expect(storage.getItem(PRIVACY_MODE_STORAGE_KEY) === "true").toBe(true);
    });
  });
});

describe("표 보기 (로그인 상태)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(OCT_27_NOON);
  });

  function renderLoggedIn(isInHousehold: boolean) {
    const storage = createMemoryStorage({ [SESSION_HINT_STORAGE_KEY]: "1" });
    const api = createFakePlanApi({ userId: "user-a", isInHousehold, plans: [makePlanQ()] });
    window.location.hash = "#/home/plan-q?view=table";
    render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });
    return { storage, api };
  }

  it("AC-12(f) 보기 전환·내려받기·인쇄로 새 API 요청 0건, 저장소 쓰기 0회", async () => {
    const user = userEvent.setup();
    const { storage, api } = renderLoggedIn(false);
    expect(await screen.findByRole("table", { name: Q_TITLE })).toBeInTheDocument();
    await act(async () => {});
    const callsBefore = api.fetchMock.mock.calls.length;
    const writes = spyStorageWrites(storage);
    const browserWrites = spyBrowserStorageWrites();

    for (const name of ["목록", "표"]) {
      await user.click(screen.getByRole("radio", { name }));
    }
    await waitFor(() => expect(window.location.hash).toBe("#/home/plan-q?view=table"));
    await user.click(downloadButton());
    await user.click(printButton());
    await act(async () => {});

    expect(download).toHaveBeenCalledTimes(1);
    expect(download.mock.calls[0][1] === Q_CSV).toBe(true);
    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(api.fetchMock.mock.calls.length).toBe(callsBefore);
    expect(api.writes()).toEqual([]);
    expect(writes.setItem).not.toHaveBeenCalled();
    expect(writes.removeItem).not.toHaveBeenCalled();
    expect(writes.clear).not.toHaveBeenCalled();
    expect(browserWrites()).toBe(0);
  });

  it("AC-12(g) 재조회로 데이터가 바뀐 뒤 누르면 새 값이 파일에 들어간다(낡은 값 아님)", async () => {
    const user = userEvent.setup();
    const { api } = renderLoggedIn(true);
    expect(await screen.findByRole("table", { name: Q_TITLE })).toBeInTheDocument();
    await user.click(downloadButton());
    expect(download.mock.calls[0][1] === Q_CSV).toBe(true);

    // 함께 쓰는 사람이 q5 예산 150 → 160, q1 확정 견적 금액 180 → 190
    api.editItemOnServer("plan-q", "q5-aircon", { budget: 160 });
    api.editItemOnServer("plan-q", "q1-floor", {
      quotes: [{ id: "qq-1", vendor: "육문수", amount: 190, memo: "2.2T 장판" }],
    });
    await act(async () => {
      window.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() =>
      expect(screen.getByText("추후 구매 · 예산 1,600,000원")).toBeInTheDocument(),
    );

    await user.click(downloadButton());
    expect(download).toHaveBeenCalledTimes(2);
    const expected = Q_CSV.replace(
      '"추후 구매 · 예산 1,500,000원"',
      '"추후 구매 · 예산 1,600,000원"',
    )
      .replace("바닥,육문수,2.2T 장판,1800000,1800000,", "바닥,육문수,2.2T 장판,1900000,1900000,")
      .replace("계,,,,7500000,", "계,,,,7600000,");
    expect(expected).not.toBe(Q_CSV);
    expect(download.mock.calls[1][1] === expected).toBe(true);
    expect(tableText(planTable()).at(-1)).toEqual(["계", "", "", "", "7,600,000", ""]);
  });
});
