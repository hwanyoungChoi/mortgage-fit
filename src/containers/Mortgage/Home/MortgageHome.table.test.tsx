// @vitest-environment jsdom
// 스펙 interior-planner "표 내보내기"(태스크 5-2) 화면: AC-11(표 내용·병합·합계·표 머리), AC-12(a)(c)(d)(e)(f)(g).
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
import { makePlanP, P_SPACES, pTime, toStoredPlans } from "@/test/interiorPlanFixture";
import { makePlanQ, Q_CSV, Q_FILE_NAME, Q_TABLE_TEXT } from "@/test/interiorPlanTableFixture";
import { makeListing } from "@/test/listingFixture";
import { createMemoryStorage } from "@/test/memoryStorage";
import { renderWithQueryClient } from "@/test/renderWithQueryClient";

import type { InteriorItem, InteriorPlanWithItems } from "@/lib/types/interiorPlan";
import type { MockInstance } from "vitest";

vi.mock("@/lib/utils/downloadTextFile", () => ({ downloadTextFile: vi.fn() }));

const download = vi.mocked(downloadTextFile);

const Q_TITLE = "우리 집 인테리어 계획";
const Q_LINE = "2026-10-27 기준 · 총 예산 15,000,000원 · 예상 총액 11,500,000원";
const HEADER_TEXT = ["구분", "업체", "세부내용", "견적(원)", "확정(원)", "비고"];
const SCROLL_LABEL = "계획 표 (가로로 스크롤)";
const PRIVACY_NOTICE = "가리기를 끄면 내려받기·인쇄할 수 있습니다";
const BROWSER_NOTICE = "내려받기·인쇄가 안 되면 Safari·Chrome에서 열어 주세요";
const MASKED = "•••가려짐";

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

      const [bathFirst, bathSecond] = within(bodies[0]).getAllByRole("row");
      const bathHeader = within(bathFirst).getByRole("rowheader");
      expect(bathHeader).toHaveTextContent("욕실");
      expect((bathHeader as HTMLTableCellElement).rowSpan).toBe(2);
      expect(bathHeader).toHaveAttribute("scope", "rowgroup");
      expect(within(bathFirst).getAllByRole("cell")).toHaveLength(5);
      expect(bathFirst.children).toHaveLength(6);
      expect(within(bathSecond).queryByRole("rowheader")).not.toBeInTheDocument();
      expect(within(bathSecond).getAllByRole("cell")).toHaveLength(5);
      expect(bathSecond.children).toHaveLength(5);

      for (const [body, trade] of [
        [bodies[1], "필름"],
        [bodies[2], "바닥"],
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

    it("P: 샷시(확정 E샷시 12,500,000) → 타일 → 도배 → 주방가구, 계 21,800,000 / 15,300,000", async () => {
      await renderApp(storageWith([makePlanP()]), "#/home/plan-p?view=table");
      expect(tableText(planTable()).slice(1)).toEqual([
        ["샷시", "E샷시", "[전체]", "12,500,000", "12,500,000", "예산 대비 500,000원 초과"],
        ["타일", "C타일", "[욕실1]", "6,500,000", "", "미확정"],
        ["도배", "A도배", "[거실]", "2,800,000", "2,800,000", ""],
        ["주방가구", "", "[주방]", "", "", "예산 5,000,000원"],
        ["계", "", "", "21,800,000", "15,300,000", ""],
      ]);
      expect(
        screen.getByText("2026-10-27 기준 · 총 예산 30,000,000원 · 예상 총액 26,300,000원"),
      ).toBeInTheDocument();
    });

    it("총 예산이 없으면 표 머리 줄에서 그 조각만 빠진다", async () => {
      const { budget: _budget, ...withoutBudget } = makePlanQ();
      void _budget;
      await renderApp(storageWith([withoutBudget]), "#/home/plan-q?view=table");
      expect(screen.getByText("2026-10-27 기준 · 예상 총액 11,500,000원")).toBeInTheDocument();
    });

    it("합계 0(견적 0개 항목만): 계 줄 '0'·'0'", async () => {
      const onlyAircon = makePlanQ({ items: [makePlanQ().items[4]] });
      await renderApp(storageWith([onlyAircon]), "#/home/plan-q?view=table");
      expect(tableText(planTable()).at(-1)).toEqual(["계", "", "", "0", "0", ""]);
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
      expect(tableText(planTable()).at(-1)).toEqual([
        "계",
        "",
        "",
        "999,999,999,000,000",
        "999,999,999,000,000",
        "",
      ]);
    });

    it("읽기 전용: 표 보기에는 [항목 추가]·묶음 목록이 없고, 줄·칸을 눌러도 항목 시트가 열리지 않는다", async () => {
      const user = userEvent.setup();
      await renderApp(storageWith([makePlanQ()]), "#/home/plan-q?view=table");
      expect(screen.queryByRole("button", { name: "항목 추가" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /열기$/ })).not.toBeInTheDocument();
      const table = planTable();
      expect(within(table).queryByRole("button")).not.toBeInTheDocument();
      expect(within(table).queryByRole("link")).not.toBeInTheDocument();
      await user.click(within(table).getByRole("rowheader", { name: "욕실" }));
      await user.click(within(table).getByText("동네욕실"));
      await user.click(within(table).getAllByRole("row")[1]);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      // 공간별로 돌아가면 [항목 추가]가 다시 있다
      await user.click(screen.getByRole("radio", { name: "공간별" }));
      await waitFor(() => expect(window.location.hash).toBe("#/home/plan-q"));
      expect(screen.getByRole("button", { name: "항목 추가" })).toBeInTheDocument();
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
      await user.click(screen.getByRole("radio", { name: "공종별" }));
      await waitFor(() => expect(window.location.hash).toBe("#/home/plan-q?view=trade"));
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

  describe("AC-12(d) 가리기·항목 0개", () => {
    const SECRETS = [
      "3,700,000",
      "2,300,000",
      "1,800,000",
      "9,800,000",
      "7,500,000",
      "15,000,000",
      "11,500,000",
      "폐기물처리",
      "철거, 방수",
      "2.2T 장판",
      "샷시·몰딩",
      "추후 구매",
      "미확정",
      "700,000",
      "1,500,000",
    ];

    it("가리기 켜짐: 구분·업체·[공간]·열 제목·'계'만 보이고 값은 DOM에 없음(innerHTML), 버튼 비활성 + 가리기 안내, 강제 클릭도 0회 → 끄면 활성", async () => {
      const user = userEvent.setup();
      const { container } = await renderApp(
        storageWith([makePlanQ()], { [PRIVACY_MODE_STORAGE_KEY]: "true" }),
        "#/home/plan-q?view=table",
      );
      for (const secret of SECRETS) {
        expect(container.innerHTML).not.toContain(secret);
        expect(document.body.innerHTML).not.toContain(secret);
      }
      expect(screen.getByRole("heading", { level: 2, name: Q_TITLE })).toBeInTheDocument();
      expect(screen.getByText(/^2026-10-27 기준 · /)).toHaveTextContent(
        `2026-10-27 기준 · ${MASKED} · ${MASKED}`,
      );
      expect(tableText(planTable())).toEqual([
        HEADER_TEXT,
        ["욕실", "숨고_하루바스", `[욕실1] ${MASKED}`, MASKED, MASKED, MASKED],
        ["동네욕실", "[욕실2]", MASKED, "", MASKED],
        ["필름", "숨고_빛인테리어필름", `[전체] ${MASKED}`, MASKED, MASKED, ""],
        ["바닥", "육문수", `[전체] ${MASKED}`, MASKED, MASKED, ""],
        ["에어컨", "", "[거실]", "", "", MASKED],
        ["계", "", "", MASKED, MASKED, ""],
      ]);

      expect(downloadButton()).toBeDisabled();
      expect(printButton()).toBeDisabled();
      expect(screen.getByText(PRIVACY_NOTICE)).toBeInTheDocument();
      expect(screen.queryByText(BROWSER_NOTICE)).not.toBeInTheDocument();

      // 비활성 버튼을 눌러도, 비활성을 우회해 핸들러를 직접 불러도 호출 0회
      fireEvent.click(downloadButton());
      fireEvent.click(printButton());
      forceReactClick(downloadButton());
      forceReactClick(printButton());
      expect(download).not.toHaveBeenCalled();
      expect(printSpy).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: "가리기" }));
      expect(downloadButton()).toBeEnabled();
      expect(printButton()).toBeEnabled();
      expect(screen.getByText(BROWSER_NOTICE)).toBeInTheDocument();
      expect(screen.queryByText(PRIVACY_NOTICE)).not.toBeInTheDocument();
      expect(screen.getByText(Q_LINE)).toBeInTheDocument();
      await user.click(downloadButton());
      expect(download).toHaveBeenCalledTimes(1);
      expect(download.mock.calls[0][1] === Q_CSV).toBe(true);
    });

    it("화면에서 [가리기]를 켜면 바로 버튼 비활성·값 사라짐", async () => {
      const user = userEvent.setup();
      const { container } = await renderApp(storageWith([makePlanQ()]), "#/home/plan-q?view=table");
      expect(container.innerHTML).toContain("3,700,000");
      await user.click(screen.getByRole("button", { name: "가리기" }));
      expect(container.innerHTML).not.toContain("3,700,000");
      expect(downloadButton()).toBeDisabled();
      expect(printButton()).toBeDisabled();
      expect(screen.getByText(PRIVACY_NOTICE)).toBeInTheDocument();
    });

    it("항목 0개: 표·표 머리 대신 빈 문구, 두 버튼 비활성, 안내 줄 없음, 강제 클릭도 0회", async () => {
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

    it("항목 0개 + 가리기 켜짐: 빈 문구만, 가리기 안내 없음", async () => {
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
      await user.click(screen.getByRole("radio", { name: "공간별" }));
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
      await screen.findByRole("link", { name: "저장 목록", current: "page" });
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      window.history.back();
      await waitFor(() => expect(window.location.hash).toBe("#/home/plan-q?view=table"));
      expect(await screen.findByRole("table", { name: Q_TITLE })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "표" })).toBeChecked();
    });

    it("?view=trade는 공종별 그대로, 모르는 view 값은 공간별(표 없음)", async () => {
      const storage = storageWith([makePlanQ()]);
      const first = await renderApp(storage, "#/home/plan-q?view=trade");
      expect(screen.getByRole("radio", { name: "공종별" })).toBeChecked();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "항목 추가" })).toBeInTheDocument();
      first.unmount();

      for (const hash of ["#/home/plan-q?view=bogus", "#/home/plan-q?view=TABLE"]) {
        const view = await renderApp(storage, hash);
        expect(screen.getByRole("radio", { name: "공간별" })).toBeChecked();
        expect(screen.queryByRole("table")).not.toBeInTheDocument();
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
      [TEXT_SIZE_STORAGE_KEY]: "small",
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

      for (const name of ["공간별", "공종별", "표", "공간별", "표"]) {
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

    it("가리기 토글은 privacy-mode 키에만 쓴다(그 밖의 키 0회)", async () => {
      const user = userEvent.setup();
      const storage = storageWith([makePlanQ()], SEED);
      await renderApp(storage, "#/home/plan-q?view=table");
      await act(async () => {});
      const writes = spyStorageWrites(storage);
      await user.click(screen.getByRole("button", { name: "가리기" }));
      await user.click(screen.getByRole("button", { name: "가리기" }));
      expect(writes.setItem.mock.calls.map(([key]) => key)).toEqual([
        PRIVACY_MODE_STORAGE_KEY,
        PRIVACY_MODE_STORAGE_KEY,
      ]);
      expect(writes.removeItem).not.toHaveBeenCalled();
      expect(writes.clear).not.toHaveBeenCalled();
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

    for (const name of ["공간별", "공종별", "표"]) {
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
      .replace(
        "바닥,육문수,[전체] 2.2T 장판,1800000,1800000,",
        "바닥,육문수,[전체] 2.2T 장판,1900000,1900000,",
      )
      .replace("계,,,9800000,7500000,", "계,,,9900000,7600000,");
    expect(download.mock.calls[1][1] === expected).toBe(true);
    expect(tableText(planTable()).at(-1)).toEqual(["계", "", "", "9,900,000", "7,600,000", ""]);
  });
});
