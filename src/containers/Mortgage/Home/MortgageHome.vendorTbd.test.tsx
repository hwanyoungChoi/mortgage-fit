// @vitest-environment jsdom
// 스펙 interior-vendor-tbd-line-order 태스크 1-2 화면(AC-1): 예시 V(업체 미정 R8·R9)의 목록 글자·흐린 글자 클래스·접근 가능한 이름·
// 요약·표 칸·1단계 시트(업체 칸 빈칸, 업체 없이 저장하면 필수 오류·쓰기 0회, 업체를 채우면 그 키만 더해짐)·허브.
// 로그아웃(로컬)과 로그인(서버 응답 파서가 업체 없는 견적을 받는다) 두 출처로 목록을 본다.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { createFakePlanApi } from "@/test/fakePlanApi";
import { toStoredPlans } from "@/test/interiorPlanFixture";
import { legacyY, makePlanV, makeSimplePlanP, r8, r9 } from "@/test/interiorSimpleFixture";
import { createMemoryStorage } from "@/test/memoryStorage";
import { renderWithQueryClient } from "@/test/renderWithQueryClient";

import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";

const P_HASH = "#/home/plan-simple";
const TABLE_HASH = "#/home/plan-simple?view=table";
const R8_NAME = "조명 업체 미정 거실 간접등";
const R9_NAME = "철거 업체 미정";

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

const storageWith = (plans: InteriorPlanWithItems[]) =>
  createMemoryStorage({ [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans(plans) });

const waitForPlans = () =>
  waitFor(() => expect(screen.queryByText("인테리어 계획을 불러오는 중")).not.toBeInTheDocument());

async function renderLoggedOut(storage: Storage, hash = P_HASH) {
  stubLoggedOutApi();
  window.location.hash = hash;
  renderWithQueryClient(<AppRoutes storage={storage} />);
  await waitForPlans();
}

const openButton = (name: string) => screen.getByRole("button", { name: `${name} 열기` });
const check = (name: string) => screen.getByRole("checkbox", { name: `${name} 확정` });

/** 여는 버튼 왼쪽 글자 묶음의 줄들(금액 제외) */
const textLines = (name: string) =>
  Array.from(openButton(name).firstElementChild?.children ?? []) as HTMLElement[];

/** 여는 버튼의 금액 자리(글자 묶음 다음 형제) */
const amountText = (name: string) => openButton(name).lastElementChild?.textContent;

/** 묶음(줄을 감싼 `section[aria-label]`)마다 [구분, 여는 버튼 이름들], 화면 순서 */
const sectionsInOrder = () => {
  const groups: [string | null, (string | null)[]][] = [];
  for (const button of screen.getAllByRole("button", { name: / 열기$/ })) {
    const trade = button.closest("section[aria-label]")?.getAttribute("aria-label") ?? null;
    const name = button.getAttribute("aria-label");
    const last = groups.at(-1);
    if (last !== undefined && last[0] === trade) last[1].push(name);
    else groups.push([trade, [name]]);
  }
  return groups;
};

const summaryRegion = () => screen.getByRole("region", { name: "요약" });
const headlineValue = (label: string) =>
  within(summaryRegion()).getByText(label).nextElementSibling?.textContent;

const storedItem = (storage: Storage, itemId: string) =>
  (
    JSON.parse(storage.getItem(INTERIOR_PLANS_STORAGE_KEY) ?? '{"plans":[]}') as {
      plans: InteriorPlanWithItems[];
    }
  ).plans[0].items.find((item) => item.id === itemId);

/** 표의 줄마다 칸 글자(병합된 구분 칸은 첫 줄에만 있다) */
const tableText = () =>
  Array.from(screen.getByRole("table").querySelectorAll("tr")).map((row) =>
    Array.from(row.querySelectorAll("th, td")).map((cell) => cell.textContent ?? ""),
  );

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

/** 목록 한 번 그린 뒤 V의 표시를 판정한다(로그아웃·로그인 같은 기대값) */
function expectVList() {
  expect(sectionsInOrder()).toStrictEqual([
    ["도배", ["도배 육문수 실크 전체 열기", "도배 동네도배 합지 열기", "도배 한솔도배 열기"]],
    [
      "욕실",
      [
        "욕실 하루바스 철거·방수 (1) 열기",
        "욕실 욕실나라 철거·방수 (1) 열기",
        "욕실 하루바스 타일 덧방 (2) 열기",
      ],
    ],
    ["조명", ["조명 빛나라조명 거실 매입등 열기", "조명 업체 미정 거실 간접등 열기"]],
    ["철거", ["철거 업체 미정 열기"]],
  ]);

  expect(textLines(R8_NAME).map((line) => line.textContent)).toStrictEqual([
    "거실 간접등",
    "업체 미정",
  ]);
  expect(amountText(R8_NAME)).toBe("300,000원");
  expect(check(R8_NAME)).toBeChecked();

  const [r9First, ...r9Rest] = textLines(R9_NAME);
  expect(r9First.textContent).toBe("업체 미정");
  expect(r9Rest).toStrictEqual([]);
  // 흐린 글자는 새 클래스(금액 미정 `tbdAmount`를 재사용하지 않는다)
  expect(r9First.className).toMatch(/tbdText/);
  expect(r9First.className).not.toMatch(/tbdAmount/);
  expect(amountText(R9_NAME)).toBe("미정");
  expect(check(R9_NAME)).not.toBeChecked();

  // 업체 이름이 있는 첫 줄은 흐린 글자가 아니다(R7 한솔도배)
  expect(textLines("도배 한솔도배")[0].className).not.toMatch(/tbdText/);

  for (const name of [R8_NAME, R9_NAME]) {
    for (const line of textLines(name)) expect(line.textContent).not.toBe("");
    expect(openButton(name).textContent).not.toContain("undefined");
  }
  expect(openButton(R8_NAME)).toHaveAccessibleName("조명 업체 미정 거실 간접등 열기");
  expect(check(R8_NAME)).toHaveAccessibleName("조명 업체 미정 거실 간접등 확정");
  expect(openButton(R9_NAME)).toHaveAccessibleName("철거 업체 미정 열기");
  expect(check(R9_NAME)).toHaveAccessibleName("철거 업체 미정 확정");
}

describe("목록 (예시 V, AC-1)", () => {
  it("로그아웃: 묶음 4개, R8 '거실 간접등 / 업체 미정 · 300,000원' ✓, R9 흐린 '업체 미정 · 미정'", async () => {
    await renderLoggedOut(storageWith([makePlanV()]));
    expectVList();
  });

  it("로그인: 서버가 업체 없는 견적을 돌려줘도 불러오지 못함이 아니고 같은 목록", async () => {
    const api = createFakePlanApi({ userId: "u1", plans: [makePlanV()] });
    window.location.hash = P_HASH;
    render(<AppRoutes storage={createMemoryStorage()} />, { wrapper: api.wrapper });
    await waitForPlans();
    await screen.findByRole("button", { name: `${R9_NAME} 열기` });
    expect(screen.queryByText("인테리어 계획을 불러오지 못했습니다")).not.toBeInTheDocument();
    expectVList();
    expect(api.writes()).toStrictEqual([]);
  });

  it("요약: 지출 예정 8,300,000원 · 남은 예산 1,700,000원 · '금액 미정 1건 제외'", async () => {
    await renderLoggedOut(storageWith([makePlanV()]));
    expect(headlineValue("지출 예정")).toBe("8,300,000원");
    expect(headlineValue("남은 예산")).toBe("1,700,000원");
    expect(within(summaryRegion()).getAllByText("금액 미정 1건 제외")).toHaveLength(1);
  });

  it("R9를 확정하면 '금액 미정 2건 제외', 지출 예정 그대로, R9 견적에 vendor 키가 생기지 않는다", async () => {
    const user = userEvent.setup();
    const storage = storageWith([makePlanV()]);
    await renderLoggedOut(storage);
    await user.click(check(R9_NAME));
    await waitFor(() => expect(check(R9_NAME)).toBeChecked());
    expect(within(summaryRegion()).getByText("금액 미정 2건 제외")).toBeInTheDocument();
    expect(headlineValue("지출 예정")).toBe("8,300,000원");
    expect(storedItem(storage, "r9")?.quotes).toStrictEqual([{ id: "rq9" }]);
  });

  it("R8 확정을 끄면 confirmedQuoteId만 빠지고 견적에 vendor 키가 계속 없다", async () => {
    const user = userEvent.setup();
    const storage = storageWith([makePlanV()]);
    await renderLoggedOut(storage);
    await user.click(check(R8_NAME));
    await waitFor(() => expect(check(R8_NAME)).not.toBeChecked());
    const stored = storedItem(storage, "r8");
    expect(stored?.confirmedQuoteId).toBeUndefined();
    expect(stored?.quotes).toStrictEqual([{ id: "rq8", memo: "거실 간접등", amountWon: 300_000 }]);
  });
});

describe("표 보기 (AC-1)", () => {
  it("R8·R9 업체 칸은 '미정', 같은 계획의 L Y(견적 없음) 업체 칸은 빈칸", async () => {
    await renderLoggedOut(
      storageWith([makeSimplePlanP({ items: [r8(), r9(), legacyY()] })]),
      TABLE_HASH,
    );
    expect(tableText().slice(1, -1)).toStrictEqual([
      ["조명", "미정", "거실 간접등", "300,000", "300,000", ""],
      ["철거", "미정", "", "미정", "", ""],
      ["도배", "", "", "", "", "예산 2,000,000원"],
    ]);
  });
});

describe("1단계 줄 시트 (AC-1)", () => {
  it("R9를 열면 업체 칸 빈칸, 업체 없이 저장하면 '업체 이름을 입력하세요'·쓰기 0회", async () => {
    const user = userEvent.setup();
    const storage = storageWith([makePlanV()]);
    await renderLoggedOut(storage);
    const before = storage.getItem(INTERIOR_PLANS_STORAGE_KEY);
    const setItem = vi.spyOn(storage, "setItem");
    await user.click(openButton(R9_NAME));
    const dialog = screen.getByRole("dialog", { name: "줄" });
    const vendor = within(dialog).getByLabelText("업체");
    expect(vendor).toHaveValue("");
    // 고친 것이 없으면 [저장]이 비활성이라 비고를 고친 뒤 업체 없이 저장한다
    await user.type(within(dialog).getByLabelText("비고(선택)"), "메모");
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    expect(vendor).toHaveAccessibleDescription(expect.stringContaining("업체 이름을 입력하세요"));
    // 오류 문구는 업체 칸 바로 뒤(같은 칸 묶음 안)에 있다
    const error = document.getElementById(`${vendor.id}-error`) as HTMLElement;
    expect(error).toHaveTextContent("업체 이름을 입력하세요");
    expect(error.parentElement).toContainElement(vendor);
    expect(setItem).not.toHaveBeenCalled();
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe(before);
  });

  it("R9에 업체 '철거왕'을 넣어 저장하면 견적이 { id: 'rq9', vendor: '철거왕' }이고 줄 자리는 그대로", async () => {
    const user = userEvent.setup();
    const storage = storageWith([makePlanV()]);
    await renderLoggedOut(storage);
    await user.click(openButton(R9_NAME));
    const dialog = screen.getByRole("dialog", { name: "줄" });
    await user.type(within(dialog).getByLabelText("업체"), "철거왕");
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(storedItem(storage, "r9")?.quotes).toStrictEqual([{ id: "rq9", vendor: "철거왕" }]);
    expect(sectionsInOrder().at(-1)).toStrictEqual(["철거", ["철거 철거왕 열기"]]);
  });
});

describe("허브 (AC-1)", () => {
  it("'우리 집 · 지출 예정 8,300,000원 · 미정 1건'", async () => {
    const api = createFakePlanApi({ userId: null, plans: [] });
    window.location.hash = "#/";
    render(<AppRoutes storage={storageWith([makePlanV()])} />, { wrapper: api.wrapper });
    const card = () =>
      within(screen.getByRole("main")).getByRole("link", { name: "우리 집 인테리어" });
    await waitFor(() =>
      expect(card()).toHaveAccessibleDescription("우리 집 · 지출 예정 8,300,000원 · 미정 1건"),
    );
  });
});
