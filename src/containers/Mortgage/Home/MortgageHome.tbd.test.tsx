// @vitest-environment jsdom
// 스펙 interior-tbd-amount 태스크 1-2 화면(로그아웃, 예시 P⁺): 목록·요약의 "미정"과 "금액 미정 n건 제외", 미정 줄 확정 체크,
// 1단계 시트(견적 칸 빈칸·금액 없이 저장하면 필수 오류), 표 보기 칸·머리·계 비고, 가리기를 켜 둬도 그대로(목록·표 두 보기).
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { PRIVACY_MODE_STORAGE_KEY } from "@/lib/utils/privacyModeStorage";
import { toStoredPlans } from "@/test/interiorPlanFixture";
import { makeSimplePlanPPlus } from "@/test/interiorSimpleFixture";
import { createMemoryStorage } from "@/test/memoryStorage";
import { renderWithQueryClient } from "@/test/renderWithQueryClient";

import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";

const P_HASH = "#/home/plan-simple";
const TABLE_HASH = "#/home/plan-simple?view=table";
const R6_NAME = "조명 빛나라조명 거실 매입등";
const R7_NAME = "도배 한솔도배";
const TBD_NOTE = "금액 미정 1건 제외";
const AMOUNT = "견적(비우면 미정)";

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

async function renderLoggedOut(storage: Storage, hash = P_HASH) {
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

const check = (name: string) => screen.getByRole("checkbox", { name: `${name} 확정` });
const openButton = (name: string) => screen.getByRole("button", { name: `${name} 열기` });

const storedItem = (storage: Storage, itemId: string) =>
  (
    JSON.parse(storage.getItem(INTERIOR_PLANS_STORAGE_KEY) ?? '{"plans":[]}') as {
      plans: InteriorPlanWithItems[];
    }
  ).plans[0].items.find((item) => item.id === itemId);

/** 표의 줄마다 칸 글자(병합된 구분 칸은 첫 줄에만 있다) */
const tableText = (table: HTMLElement) =>
  Array.from(table.querySelectorAll("tr")).map((row) =>
    Array.from(row.querySelectorAll("th, td")).map((cell) => cell.textContent ?? ""),
  );

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("목록·요약 (P⁺)", () => {
  it("R6·R7 금액 자리는 '미정'(0원 아님), R6만 체크, 지출 예정 8,000,000원 · 남은 예산 2,000,000원 · 요약 안에 문구 한 번", async () => {
    await renderLoggedOut(storageWith([makeSimplePlanPPlus()]));
    expect(openButton(R6_NAME)).toHaveTextContent(/^거실 매입등빛나라조명미정$/);
    expect(openButton(R7_NAME)).toHaveTextContent(/^한솔도배미정$/);
    for (const name of [R6_NAME, R7_NAME]) {
      expect(openButton(name).textContent).not.toContain("0원");
    }
    expect(check(R6_NAME)).toBeChecked();
    expect(check(R7_NAME)).not.toBeChecked();
    expect(headlineValue("지출 예정")).toBe("8,000,000원");
    expect(headlineValue("남은 예산")).toBe("2,000,000원");
    expect(within(summaryRegion()).getAllByText(TBD_NOTE)).toHaveLength(1);
  });

  it("미정 줄 R7 확정 체크 → 저장(금액 키 없음 그대로), '금액 미정 2건 제외', 지출 예정 8,000,000원 그대로", async () => {
    const user = userEvent.setup();
    const storage = storageWith([makeSimplePlanPPlus()]);
    await renderLoggedOut(storage);
    await user.click(check(R7_NAME));
    await waitFor(() => expect(check(R7_NAME)).toBeChecked());
    expect(storedItem(storage, "r7")?.confirmedQuoteId).toBe("rq7");
    expect(storedItem(storage, "r7")?.quotes).toStrictEqual([{ id: "rq7", vendor: "한솔도배" }]);
    expect(within(summaryRegion()).getByText("금액 미정 2건 제외")).toBeInTheDocument();
    expect(headlineValue("지출 예정")).toBe("8,000,000원");
  });

  it("R6 확정을 끄면 문구가 사라지고 8,000,000원 그대로", async () => {
    const user = userEvent.setup();
    await renderLoggedOut(storageWith([makeSimplePlanPPlus()]));
    await user.click(check(R6_NAME));
    await waitFor(() => expect(check(R6_NAME)).not.toBeChecked());
    expect(within(summaryRegion()).queryByText(/금액 미정/)).not.toBeInTheDocument();
    expect(headlineValue("지출 예정")).toBe("8,000,000원");
  });

  it("총 예산 700이면 '예산 초과 1,000,000원'과 문구가 함께 보인다", async () => {
    await renderLoggedOut(storageWith([makeSimplePlanPPlus({ budget: 700 })]));
    expect(headlineValue("남은 예산")).toBe("예산 초과 1,000,000원");
    expect(within(summaryRegion()).getAllByText(TBD_NOTE)).toHaveLength(1);
  });
});

describe("줄 시트 2단계 (P⁺, AC-2 2단계)", () => {
  // 1단계의 "금액 없이 저장하면 필수 오류"의 반전(U1): 견적 칸이 비어도 저장되고 금액 키는 생기지 않는다
  it("R6을 열면 견적 칸은 빈칸, 비고만 고쳐 저장하면 견적은 미정 그대로(금액 키 없음)이고 비고만 더해진다", async () => {
    const user = userEvent.setup();
    const storage = storageWith([makeSimplePlanPPlus()]);
    await renderLoggedOut(storage);
    await user.click(openButton(R6_NAME));
    const dialog = screen.getByRole("dialog", { name: "줄" });
    expect(within(dialog).getByLabelText(AMOUNT)).toHaveValue("");
    await user.type(within(dialog).getByLabelText("비고(선택)"), "메모");
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const stored = storedItem(storage, "r6");
    expect(stored?.quotes).toStrictEqual([
      { id: "rq6", vendor: "빛나라조명", memo: "거실 매입등" },
    ]);
    expect(stored?.memo).toBe("메모");
    expect(within(summaryRegion()).getAllByText(TBD_NOTE)).toHaveLength(1);
  });

  it("1200000을 넣어 저장하면 amountWon 1,200,000이 더해지고 지출 예정 9,200,000원 · 남은 예산 800,000원, 문구가 사라진다", async () => {
    const user = userEvent.setup();
    const storage = storageWith([makeSimplePlanPPlus()]);
    await renderLoggedOut(storage);
    await user.click(openButton(R6_NAME));
    const dialog = screen.getByRole("dialog", { name: "줄" });
    await user.type(within(dialog).getByLabelText(AMOUNT), "1200000");
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(storedItem(storage, "r6")?.quotes).toStrictEqual([
      { id: "rq6", vendor: "빛나라조명", amountWon: 1_200_000, memo: "거실 매입등" },
    ]);
    expect(headlineValue("지출 예정")).toBe("9,200,000원");
    expect(headlineValue("남은 예산")).toBe("800,000원");
    expect(within(summaryRegion()).queryByText(/금액 미정/)).not.toBeInTheDocument();
  });

  it("R1 금액을 지우고 저장하면 금액 키 둘 다 없음, 지출 예정 6,200,000원 · 남은 예산 3,800,000원 · '금액 미정 2건 제외'", async () => {
    const user = userEvent.setup();
    const storage = storageWith([makeSimplePlanPPlus()]);
    await renderLoggedOut(storage);
    await user.click(openButton("도배 육문수 실크 전체"));
    const dialog = screen.getByRole("dialog", { name: "줄" });
    await user.clear(within(dialog).getByLabelText(AMOUNT));
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const [quote] = storedItem(storage, "r1")?.quotes ?? [];
    expect(quote).toStrictEqual({ id: "rq1", vendor: "육문수", memo: "실크 전체" });
    expect(Object.hasOwn(quote, "amount")).toBe(false);
    expect(Object.hasOwn(quote, "amountWon")).toBe(false);
    expect(headlineValue("지출 예정")).toBe("6,200,000원");
    expect(headlineValue("남은 예산")).toBe("3,800,000원");
    expect(within(summaryRegion()).getAllByText("금액 미정 2건 제외")).toHaveLength(1);
  });

  it("[줄 추가]로 R6를 견적 칸을 비운 채 확정 켜고 저장 → 견적에 금액 키 없음, 목록 '미정'", async () => {
    const user = userEvent.setup();
    const plan = makeSimplePlanPPlus();
    const storage = storageWith([
      { ...plan, items: plan.items.filter((item) => item.id !== "r6") },
    ]);
    await renderLoggedOut(storage);
    await user.click(screen.getByRole("button", { name: "줄 추가" }));
    const dialog = screen.getByRole("dialog", { name: "줄 추가" });
    await user.type(within(dialog).getByLabelText("구분"), "조명");
    await user.type(within(dialog).getByLabelText("세부내용(선택)"), "거실 매입등");
    await user.type(within(dialog).getByLabelText("업체(비우면 미정)"), "빛나라조명");
    await user.click(within(dialog).getByRole("checkbox", { name: "확정" }));
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const items = (
      JSON.parse(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)!) as {
        plans: InteriorPlanWithItems[];
      }
    ).plans[0].items;
    const { id, createdAt, updatedAt, ...added } = items.at(-1)!;
    void [id, createdAt, updatedAt];
    const quoteId = added.quotes![0].id;
    expect(added).toStrictEqual({
      spaceId: "sp-whole",
      trade: "조명",
      quotes: [{ id: quoteId, vendor: "빛나라조명", memo: "거실 매입등" }],
      confirmedQuoteId: quoteId,
      status: "planned",
    });
    expect(openButton(R6_NAME)).toHaveTextContent("미정");
    expect(within(summaryRegion()).getAllByText(TBD_NOTE)).toHaveLength(1);
  });
});

describe("표 보기 (P⁺, 기기 날짜 2026-10-27)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(OCT_27_NOON);
  });

  it("미정 칸·표 머리·계 비고, 문구는 요약·표 머리·계 비고에 각각 한 번", async () => {
    await renderLoggedOut(storageWith([makeSimplePlanPPlus()]), TABLE_HASH);
    const table = screen.getByRole("table", { name: "우리 집 인테리어 계획" });
    expect(tableText(table)).toEqual([
      ["구분", "업체", "세부내용", "견적(원)", "확정(원)", "비고"],
      ["도배", "육문수", "실크 전체", "1,800,000", "1,800,000", ""],
      ["동네도배", "합지", "1,500,000", "", ""],
      ["한솔도배", "", "미정", "", ""],
      ["욕실", "하루바스", "철거·방수 (1)", "3,700,000", "3,700,000", ""],
      ["욕실나라", "철거·방수 (1)", "4,000,000", "", ""],
      ["하루바스", "타일 덧방 (2)", "2,500,000", "2,500,000", ""],
      ["조명", "빛나라조명", "거실 매입등", "미정", "미정", ""],
      ["계", "", "", "", "8,000,000", TBD_NOTE],
    ]);
    expect(
      screen.getByText(
        "2026-10-27 기준 · 총 예산 10,000,000원 · 지출 예정 8,000,000원(금액 미정 1건 제외) · 남은 예산 2,000,000원",
      ),
    ).toBeInTheDocument();
    expect(within(summaryRegion()).getAllByText(TBD_NOTE)).toHaveLength(1);
    expect(within(table).getAllByText(TBD_NOTE)).toHaveLength(1);
  });
});

describe("저장 목록에서 가리기를 켜 둬도 우리 집은 그대로 (P⁺, 목록·표 두 보기, AC-5)", () => {
  const VISIBLE = ["미정", "8,000,000원", "거실 매입등"];

  it.each([
    ["목록", P_HASH],
    ["표", TABLE_HASH],
  ])("%s 보기: '미정'·금액·세부내용이 보이고 가려짐·[가리기]가 없다", async (view, hash) => {
    const { container } = await renderLoggedOut(
      storageWith([makeSimplePlanPPlus()], { [PRIVACY_MODE_STORAGE_KEY]: "true" }),
      hash,
    );
    expect(screen.queryByRole("button", { name: "가리기" })).not.toBeInTheDocument();
    for (const text of VISIBLE) expect(container.innerHTML).toContain(text);
    expect(container.innerHTML).not.toContain("가려짐");
    expect(within(summaryRegion()).getByText(TBD_NOTE)).toBeInTheDocument();
    if (view === "목록") expect(check(R6_NAME)).toBeInTheDocument();
  });
});
