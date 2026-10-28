// @vitest-environment jsdom
// qa 태스크 1(스펙 interior-tbd-amount AC-1·AC-2 1단계·AC-4, 로그아웃) 빈틈:
// - AC-1 경계: 총 예산 800(남은 0원, 초과 아님)·총 예산 없음([총 예산 입력])·확정이 R6뿐(지출 예정 0원)에도 문구가 붙는다.
// - 옛 다견적 항목 F⁺(makeFullItem 변형: q1 하루바스 370 확정, q2 욕실나라 금액 없음): 표시·확정 옮김·확정 미정 견적 삭제.
// - 저장 목록에서 가리기를 켜 둬도 원 단위 줄 금액(1,800,000 등)·"미정"·세부내용이 목록/표 두 보기에 그대로 보인다(ADR-035).
// - 시트 칸 순서와 포커스: 떠 있는 [+]·미정 줄 R6 모두 시트 안(지금처럼 시트 머리), [+ 조명에 줄 추가]는 세부내용 칸.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { PRIVACY_MODE_STORAGE_KEY } from "@/lib/utils/privacyModeStorage";
import { toStoredPlans } from "@/test/interiorPlanFixture";
import {
  makeFullItem,
  makeSimplePlanP,
  makeSimplePlanPPlus,
  r6,
} from "@/test/interiorSimpleFixture";
import { createMemoryStorage } from "@/test/memoryStorage";
import { renderWithQueryClient } from "@/test/renderWithQueryClient";

import type { InteriorItem, InteriorPlanWithItems } from "@/lib/types/interiorPlan";

const P_HASH = "#/home/plan-simple";
const TABLE_HASH = "#/home/plan-simple?view=table";
const TBD_NOTE = "금액 미정 1건 제외";

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

const storedItems = (storage: Storage) =>
  (JSON.parse(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)!) as { plans: InteriorPlanWithItems[] })
    .plans[0].items;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("AC-1 경계: 남은 예산 표기와 '금액 미정 1건 제외'가 함께 보인다", () => {
  it("총 예산 800 → 남은 예산 '0원'(예산 초과 아님) · 문구 한 번", async () => {
    await renderLoggedOut(storageWith([makeSimplePlanPPlus({ budget: 800 })]));
    expect(headlineValue("남은 예산")).toBe("0원");
    expect(headlineValue("지출 예정")).toBe("8,000,000원");
    expect(within(summaryRegion()).getAllByText(TBD_NOTE)).toHaveLength(1);
    expect(within(summaryRegion()).queryByText(/예산 초과/)).not.toBeInTheDocument();
  });

  it("총 예산 없음 → 남은 예산 자리에 [총 예산 입력] · 문구 한 번", async () => {
    const { budget, ...withoutBudget } = makeSimplePlanPPlus();
    void budget;
    await renderLoggedOut(storageWith([withoutBudget]));
    expect(
      within(summaryRegion()).getByRole("button", { name: "총 예산 입력" }),
    ).toBeInTheDocument();
    expect(within(summaryRegion()).getAllByText(TBD_NOTE)).toHaveLength(1);
  });

  it("확정이 R6뿐 → 지출 예정 '0원' · 남은 예산 10,000,000원 · 문구 한 번, R6 줄에 0이 없다", async () => {
    await renderLoggedOut(storageWith([makeSimplePlanP({ items: [r6()] })]));
    expect(headlineValue("지출 예정")).toBe("0원");
    expect(headlineValue("남은 예산")).toBe("10,000,000원");
    expect(within(summaryRegion()).getAllByText(TBD_NOTE)).toHaveLength(1);
    const row = screen.getByRole("button", { name: "조명 빛나라조명 거실 매입등 열기" });
    expect(row).toHaveTextContent(/^거실 매입등빛나라조명미정$/);
  });
});

/** F⁺: makeFullItem의 fq2를 금액 없는 견적으로(연락처·메모는 그대로). 공간은 P의 하나뿐인 공간 */
function fPlus(): InteriorItem {
  const full = makeFullItem("quoting");
  return {
    ...full,
    spaceId: "sp-whole",
    quotes: [
      full.quotes![0],
      { id: "fq2", vendor: "욕실나라", contact: "02-123-4567", memo: "도기 포함" },
    ],
  };
}

const F_Q1 = "욕실 하루바스 철거·방수";
const F_Q2 = "욕실 욕실나라 도기 포함";

describe("AC-1 옛 다견적 항목 F⁺ (q1 하루바스 370 확정, q2 욕실나라 금액 없음)", () => {
  it("줄 2개, q2 줄 '미정', 지출 예정 3,700,000원, 미정 0건(q2는 미확정)", async () => {
    await renderLoggedOut(storageWith([makeSimplePlanP({ items: [fPlus()] })]));
    expect(screen.getByRole("button", { name: `${F_Q1} 열기` })).toHaveTextContent("3,700,000원");
    expect(screen.getByRole("button", { name: `${F_Q2} 열기` })).toHaveTextContent(
      /^도기 포함욕실나라미정$/,
    );
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(headlineValue("지출 예정")).toBe("3,700,000원");
    expect(within(summaryRegion()).queryByText(/금액 미정/)).not.toBeInTheDocument();
  });

  it("q2 확정 → 확정이 q2로 옮겨 가 지출 예정 0원 · 미정 1건, '다른 견적 확정이 풀렸습니다' 안내, 견적은 그대로", async () => {
    const user = userEvent.setup();
    const storage = storageWith([makeSimplePlanP({ items: [fPlus()] })]);
    await renderLoggedOut(storage);
    await user.click(screen.getByRole("checkbox", { name: `${F_Q2} 확정` }));
    expect(await within(screen.getByRole("main")).findByRole("status")).toHaveTextContent(
      "같은 항목의 다른 견적 확정이 풀렸습니다",
    );
    expect(screen.getByRole("checkbox", { name: `${F_Q2} 확정` })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: `${F_Q1} 확정` })).not.toBeChecked();
    expect(headlineValue("지출 예정")).toBe("0원");
    expect(within(summaryRegion()).getAllByText(TBD_NOTE)).toHaveLength(1);
    const [stored] = storedItems(storage);
    const { updatedAt, ...rest } = stored;
    void updatedAt;
    const { updatedAt: before, ...original } = fPlus();
    void before;
    expect(rest).toStrictEqual({ ...original, confirmedQuoteId: "fq2" });
    expect(Object.hasOwn(stored.quotes![1], "amount")).toBe(false);
    expect(Object.hasOwn(stored.quotes![1], "amountWon")).toBe(false);
  });

  it("확정된 q2(미정)를 줄 시트에서 삭제 → confirmedQuoteId 키만 빠지고 q1·지급·연락처 그대로, 미정 0건", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const item = { ...fPlus(), confirmedQuoteId: "fq2" };
    const storage = storageWith([makeSimplePlanP({ items: [item] })]);
    await renderLoggedOut(storage);
    expect(within(summaryRegion()).getAllByText(TBD_NOTE)).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: `${F_Q2} 열기` }));
    const dialog = screen.getByRole("dialog", { name: "줄" });
    expect(within(dialog).getByLabelText("견적(비우면 미정)")).toHaveValue("");
    await user.click(within(dialog).getByRole("button", { name: "삭제" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(confirm).toHaveBeenCalledWith("이 줄을 지울까요?");

    const [stored] = storedItems(storage);
    const { confirmedQuoteId, updatedAt, quotes, ...hidden } = item;
    void [confirmedQuoteId, updatedAt];
    const { updatedAt: storedUpdatedAt, ...storedRest } = stored;
    void storedUpdatedAt;
    expect(storedRest).toStrictEqual({ ...hidden, quotes: [quotes![0]] });
    expect(Object.hasOwn(stored, "confirmedQuoteId")).toBe(false);
    expect(within(summaryRegion()).queryByText(/금액 미정/)).not.toBeInTheDocument();
    expect(headlineValue("지출 예정")).toBe("0원");
  });
});

describe("저장 목록에서 가리기를 켜 둬도 원 단위 줄 금액·'미정'·세부내용이 보인다 (P⁺, 목록·표, AC-5)", () => {
  const VISIBLE = [
    "1,800,000",
    "1,500,000",
    "3,700,000",
    "4,000,000",
    "2,500,000",
    "8,000,000",
    "2,000,000",
    "10,000,000",
    "미정",
    "거실 매입등",
    "실크 전체",
    "철거·방수",
  ];

  it.each([
    ["목록", P_HASH],
    ["표", TABLE_HASH],
  ])("%s 보기", async (_view, hash) => {
    const { container } = await renderLoggedOut(
      storageWith([makeSimplePlanPPlus()], { [PRIVACY_MODE_STORAGE_KEY]: "true" }),
      hash,
    );
    expect(screen.queryByRole("button", { name: "가리기" })).not.toBeInTheDocument();
    for (const text of VISIBLE) expect(container.innerHTML, text).toContain(text);
    expect(container.innerHTML).not.toContain("가려짐");
    expect(headlineValue("지출 예정")).toBe("8,000,000원");
    expect(within(summaryRegion()).getByText(TBD_NOTE)).toBeInTheDocument();
  });
});

describe("시트 첫 포커스와 칸 순서", () => {
  it("떠 있는 [+]·미정 줄 R6·[+ 조명에 줄 추가] 모두 칸 순서 구분 → 세부내용 → 업체 → 견적 → 비고, 포커스는 시트 안(묶음 끝 [+]는 세부내용)", async () => {
    const user = userEvent.setup();
    await renderLoggedOut(storageWith([makeSimplePlanPPlus()]));
    const order = [
      "구분",
      "세부내용(선택)",
      "업체(비우면 미정)",
      "견적(비우면 미정)",
      "비고(선택)",
    ];
    const textLabels = (dialog: HTMLElement) =>
      Array.from(
        dialog.querySelectorAll("input:not([type=checkbox]), textarea"),
        (input) => dialog.querySelector(`label[for="${input.id}"]`)?.textContent,
      );

    await user.click(screen.getByRole("button", { name: "줄 추가" }));
    const added = screen.getByRole("dialog", { name: "줄 추가" });
    expect(added.contains(document.activeElement)).toBe(true);
    expect(textLabels(added)).toEqual(order);
    await user.click(within(added).getByRole("button", { name: "취소" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "조명 빛나라조명 거실 매입등 열기" }));
    const line = screen.getByRole("dialog", { name: "줄" });
    expect(line.contains(document.activeElement)).toBe(true);
    expect(textLabels(line)).toEqual(order);
    expect(within(line).getByLabelText("견적(비우면 미정)")).toHaveValue("");
    await user.click(within(line).getByRole("button", { name: "취소" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "조명에 줄 추가" }));
    const grouped = screen.getByRole("dialog", { name: "줄 추가" });
    expect(within(grouped).getByLabelText("구분")).toHaveValue("조명");
    expect(within(grouped).getByLabelText("세부내용(선택)")).toHaveFocus();
    expect(textLabels(grouped)).toEqual(order);
  });
});
