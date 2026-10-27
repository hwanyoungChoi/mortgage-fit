// @vitest-environment jsdom
// ADR-034 조건 8·9(qa Q4·Q10) 화면(로그아웃, 예시 M): 옛 키(만원)와 원 키가 섞인 계획을 목록·요약·표·CSV가 같은 숫자의
// "1,234,500원" 형식으로 보인다. 가리기 중에는 원 숫자가 innerHTML·aria-label에 없다(목록·요약·표, 허브는
// MortgageHub.wonUnit.test.tsx). 미정 줄에는 "0원"이 없고, 금액 0 줄은 "0원"이다. 열기만 하면 저장소에 쓰지 않는다.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { downloadTextFile } from "@/lib/utils/downloadTextFile";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { PRIVACY_MODE_STORAGE_KEY } from "@/lib/utils/privacyModeStorage";
import { toStoredPlans } from "@/test/interiorPlanFixture";
import { makePlanM, PLAN_M_CSV_LINES, simpleTime, toCsvFile } from "@/test/interiorSimpleFixture";
import { createMemoryStorage } from "@/test/memoryStorage";
import { renderWithQueryClient } from "@/test/renderWithQueryClient";

import type { InteriorItem, InteriorPlanWithItems } from "@/lib/types/interiorPlan";

vi.mock("@/lib/utils/downloadTextFile", () => ({ downloadTextFile: vi.fn() }));

const download = vi.mocked(downloadTextFile);

const M_HASH = "#/home/plan-m";
const M_TABLE_HASH = "#/home/plan-m?view=table";
const TBD_NOTE = "금액 미정 1건 제외";
/** M의 원 숫자(줄 금액·지출 예정·초과·총 예산). 가리기 중에는 어느 것도 DOM에 없다 */
const WON_SECRETS = [
  "8,000,000",
  "1,234,500",
  "1,235,000",
  "999",
  "10,469,500",
  "469,500",
  "10,000,000",
];

/** 기기 날짜 2026-10-27(로컬 생성자라 시간대와 무관) */
const OCT_27_NOON = new Date(2026, 9, 27, 12, 0, 0);

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

const storageWith = (plans: InteriorPlanWithItems[], extra: Record<string, string> = {}) =>
  createMemoryStorage({ [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans(plans), ...extra });

async function renderLoggedOut(storage: Storage, hash = M_HASH) {
  stubLoggedOutApi();
  window.location.hash = hash;
  const result = renderWithQueryClient(<AppRoutes storage={storage} />);
  await waitFor(() =>
    expect(screen.queryByText("인테리어 계획을 불러오는 중")).not.toBeInTheDocument(),
  );
  return result;
}

const summaryRegion = () => screen.getByRole("region", { name: "요약" });
const headlineValue = (label: string) =>
  within(summaryRegion()).getByText(label).nextElementSibling?.textContent;
const detailValue = (label: string) =>
  within(summaryRegion()).getByText(label).nextElementSibling?.textContent;
const openButton = (name: string) => screen.getByRole("button", { name: `${name} 열기` });

/** 표의 줄마다 칸 글자(병합된 구분 칸은 첫 줄에만 있다) */
const tableText = (table: HTMLElement) =>
  Array.from(table.querySelectorAll("tr")).map((row) =>
    Array.from(row.querySelectorAll("th, td")).map((cell) => cell.textContent ?? ""),
  );

/** M에서 총 예산 키만 바꾼다 */
const planMWith = (budgets: Pick<InteriorPlanWithItems, "budget" | "budgetWon">) => {
  const { budget, ...rest } = makePlanM();
  void budget;
  return { ...rest, ...budgets };
};

/** 원 숫자가 innerHTML과 모든 aria-label에 없다 */
function expectNoWonSecrets(container: HTMLElement) {
  for (const secret of WON_SECRETS) expect(container.innerHTML).not.toContain(secret);
  for (const element of container.querySelectorAll("[aria-label]")) {
    const label = element.getAttribute("aria-label") ?? "";
    for (const secret of WON_SECRETS) expect(label).not.toContain(secret);
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  download.mockClear();
  window.location.hash = "#/";
});

describe("목록·요약 (예시 M)", () => {
  it("줄 금액은 원(만원 키 800 → 8,000,000원), 미정 줄은 '미정', 지출 예정 10,469,500원 · 예산 초과 469,500원 · 총 예산 10,000,000원", async () => {
    const storage = storageWith([makePlanM()]);
    const raw = storage.getItem(INTERIOR_PLANS_STORAGE_KEY);
    await renderLoggedOut(storage);
    expect(openButton("도배 육문수")).toHaveTextContent(/^육문수8,000,000원$/);
    expect(openButton("욕실 하루바스")).toHaveTextContent(/^하루바스1,234,500원$/);
    expect(openButton("욕실 욕실나라")).toHaveTextContent(/^욕실나라1,235,000원$/);
    expect(openButton("조명 빛나라조명")).toHaveTextContent(/^빛나라조명999원$/);
    expect(openButton("조명 한빛전기")).toHaveTextContent(/^한빛전기미정$/);
    expect(openButton("조명 한빛전기").textContent).not.toContain("0원");
    expect(headlineValue("지출 예정")).toBe("10,469,500원");
    expect(headlineValue("남은 예산")).toBe("예산 초과 469,500원");
    expect(detailValue("총 예산")).toBe("10,000,000원");
    expect(within(summaryRegion()).getAllByText(TBD_NOTE)).toHaveLength(1);
    // 열기만 하면 쓰지 않는다(AC-0): 옛 키를 원 키로 다시 쓰지 않는다
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe(raw);
  });

  it("총 예산 { budgetWon: 12000000 } → 남은 예산 1,530,500원 · 총 예산 12,000,000원", async () => {
    await renderLoggedOut(storageWith([planMWith({ budgetWon: 12_000_000 })]));
    expect(headlineValue("지출 예정")).toBe("10,469,500원");
    expect(headlineValue("남은 예산")).toBe("1,530,500원");
    expect(detailValue("총 예산")).toBe("12,000,000원");
  });

  it("금액 0 줄({ amountWon: 0 }·{ amount: 0 })은 '0원'이고 미정이 아니다", async () => {
    const zero = (
      id: string,
      vendor: string,
      quote: { amount?: number; amountWon?: number },
    ): InteriorItem => ({
      id,
      spaceId: "sp-whole",
      trade: "셀프",
      quotes: [{ id: `${id}-q`, vendor, ...quote }],
      confirmedQuoteId: `${id}-q`,
      status: "planned",
      createdAt: simpleTime(9),
      updatedAt: simpleTime(9),
    });
    const plan = makePlanM({
      items: [
        ...makePlanM().items,
        zero("zero-won", "영원키", { amountWon: 0 }),
        zero("zero-manwon", "영만원키", { amount: 0 }),
      ],
    });
    await renderLoggedOut(storageWith([plan]));
    expect(openButton("셀프 영원키")).toHaveTextContent(/^영원키0원$/);
    expect(openButton("셀프 영만원키")).toHaveTextContent(/^영만원키0원$/);
    expect(headlineValue("지출 예정")).toBe("10,469,500원");
    expect(within(summaryRegion()).getAllByText(TBD_NOTE)).toHaveLength(1);
  });
});

describe("표 보기·CSV (예시 M, 기기 날짜 2026-10-27)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(OCT_27_NOON);
  });

  it("칸·계·표 머리가 목록·요약과 같은 숫자, CSV는 PLAN_M_CSV_LINES", async () => {
    const user = userEvent.setup();
    await renderLoggedOut(storageWith([makePlanM()]), M_TABLE_HASH);
    const table = screen.getByRole("table", { name: "섞인 집 인테리어 계획" });
    expect(tableText(table)).toEqual([
      ["구분", "업체", "세부내용", "견적(원)", "확정(원)", "비고"],
      ["도배", "육문수", "", "8,000,000", "8,000,000", ""],
      ["욕실", "하루바스", "", "1,234,500", "1,234,500", ""],
      ["욕실나라", "", "1,235,000", "1,235,000", ""],
      ["조명", "빛나라조명", "", "999", "", ""],
      ["한빛전기", "", "미정", "미정", ""],
      ["계", "", "", "", "10,469,500", TBD_NOTE],
    ]);
    expect(
      screen.getByText(
        "2026-10-27 기준 · 총 예산 10,000,000원 · 지출 예정 10,469,500원(금액 미정 1건 제외) · 예산 초과 469,500원",
      ),
    ).toBeInTheDocument();
    expect(headlineValue("지출 예정")).toBe("10,469,500원");

    await user.click(screen.getByRole("button", { name: "CSV 내려받기" }));
    expect(download).toHaveBeenCalledTimes(1);
    expect(download.mock.calls[0][1] === toCsvFile(PLAN_M_CSV_LINES)).toBe(true);
  });
});

describe("가리기 (예시 M, 목록·표 두 보기)", () => {
  it.each([
    ["목록", M_HASH],
    ["표", M_TABLE_HASH],
  ])("%s 보기: 원 숫자가 innerHTML·aria-label에 없고 요약은 •••가려짐", async (_view, hash) => {
    const { container } = await renderLoggedOut(
      storageWith([makePlanM()], { [PRIVACY_MODE_STORAGE_KEY]: "true" }),
      hash,
    );
    expect(screen.getByRole("button", { name: "가리기" })).toHaveAttribute("aria-pressed", "true");
    expectNoWonSecrets(container);
    expect(headlineValue("지출 예정")).toBe("•••가려짐");
    expect(headlineValue("남은 예산")).toBe("예산 초과 •••가려짐");
    expect(detailValue("총 예산")).toBe("•••가려짐");
  });

  it("가리기를 끄면 같은 숫자가 다시 보인다", async () => {
    const user = userEvent.setup();
    const { container } = await renderLoggedOut(
      storageWith([makePlanM()], { [PRIVACY_MODE_STORAGE_KEY]: "true" }),
    );
    await user.click(screen.getByRole("button", { name: "가리기" }));
    expect(headlineValue("지출 예정")).toBe("10,469,500원");
    expect(container.innerHTML).toContain("1,234,500원");
  });
});
