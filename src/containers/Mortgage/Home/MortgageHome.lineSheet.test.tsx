// @vitest-environment jsdom
// 스펙 interior-simple 화면 "줄 시트": AC-2(a)~(d)(줄 쓰기·입력 경계)·AC-3(견적 비운 시트)·AC-4(a)~(e)(옛 계획 고치기, D2 a).
// 로그아웃(로컬 스토어)에서 저장된 원문을 읽어 쓰기 입력을 본다. 같은 항목 동시 편집은 MortgageHome.loggedIn.test.tsx.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { toStoredPlans } from "@/test/interiorPlanFixture";
import {
  legacyX,
  legacyY,
  makePlanL,
  makeSimplePlanP,
  r1,
  r2,
  r4,
} from "@/test/interiorSimpleFixture";
import { createMemoryStorage } from "@/test/memoryStorage";
import { renderWithQueryClient } from "@/test/renderWithQueryClient";

import type { InteriorItem, InteriorPlanWithItems } from "@/lib/types/interiorPlan";

type User = ReturnType<typeof userEvent.setup>;

const P_HASH = "#/home/plan-simple";
const L_HASH = "#/home/plan-l";

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

async function renderApp(storage: Storage, hash = P_HASH) {
  stubLoggedOutApi();
  window.location.hash = hash;
  const result = renderWithQueryClient(<AppRoutes storage={storage} />);
  await waitFor(() =>
    expect(screen.queryByText("인테리어 계획을 불러오는 중")).not.toBeInTheDocument(),
  );
  return result;
}

const storedPlans = (storage: Storage) =>
  (
    JSON.parse(storage.getItem(INTERIOR_PLANS_STORAGE_KEY) ?? '{"plans":[]}') as {
      plans: InteriorPlanWithItems[];
    }
  ).plans;

const storedItems = (storage: Storage) => storedPlans(storage)[0].items;
const storedItem = (storage: Storage, itemId: string) =>
  storedItems(storage).find((item) => item.id === itemId);

/** id·시각을 뺀 항목 필드 */
function fieldsOf(item: InteriorItem | undefined) {
  if (item === undefined) throw new Error("항목 없음");
  const { id, createdAt, updatedAt, ...fields } = item;
  void [id, createdAt, updatedAt];
  return fields;
}

const headlineValue = (label: string) =>
  within(screen.getByRole("region", { name: "요약" })).getByText(label).nextElementSibling
    ?.textContent;

const field = (dialog: HTMLElement, label: string) => within(dialog).getByLabelText(label);

async function openNewLine(user: User) {
  await user.click(screen.getByRole("button", { name: "줄 추가" }));
  return screen.getByRole("dialog", { name: "줄 추가" });
}

async function openLine(user: User, name: string) {
  await user.click(screen.getByRole("button", { name: `${name} 열기` }));
  return screen.getByRole("dialog", { name: "줄" });
}

async function save(user: User, dialog: HTMLElement) {
  await user.click(within(dialog).getByRole("button", { name: "저장" }));
}

async function saveAndClose(user: User, dialog: HTMLElement) {
  await save(user, dialog);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("AC-2 줄 추가", () => {
  it("(a) [줄 추가]로 R1을 확정 켜고 저장 → 견적 1개 항목(첫 공간·계획·비고 없음 → memo 키 없음), 도배 묶음 끝에 보인다", async () => {
    const user = userEvent.setup();
    const plan = makeSimplePlanP({
      items: makeSimplePlanP().items.filter((item) => item.id !== "r1"),
    });
    const storage = storageWith([plan]);
    await renderApp(storage);
    const dialog = await openNewLine(user);
    expect(within(dialog).getByRole("checkbox", { name: "확정" })).not.toBeChecked();
    await user.type(field(dialog, "구분"), "도배");
    await user.type(field(dialog, "업체"), "육문수");
    await user.type(field(dialog, "세부내용(선택)"), "실크 전체");
    await user.type(field(dialog, "견적"), "180");
    await user.click(within(dialog).getByRole("checkbox", { name: "확정" }));
    await saveAndClose(user, dialog);

    const added = storedItems(storage).at(-1);
    const quoteId = added?.quotes?.[0].id;
    expect(fieldsOf(added)).toStrictEqual({
      spaceId: "sp-whole",
      trade: "도배",
      quotes: [{ id: quoteId, vendor: "육문수", amount: 180, memo: "실크 전체" }],
      confirmedQuoteId: quoteId,
      status: "planned",
    });
    const wallpaper = screen.getByRole("region", { name: "도배" });
    expect(
      within(wallpaper)
        .getAllByRole("checkbox")
        .map((box) => box.getAttribute("aria-label")),
    ).toEqual(["도배 동네도배 합지 확정", "도배 육문수 실크 전체 확정"]);
    expect(headlineValue("지출 예정")).toBe("800만원");
  });

  it("(b) 욕실 묶음의 [+ 욕실에 줄 추가] → 구분 '욕실'이 채워지고 포커스는 업체 칸, 구분 칸은 이 계획의 기존 구분을 제안한다", async () => {
    const user = userEvent.setup();
    await renderApp(storageWith([makeSimplePlanP()]));
    await user.click(screen.getByRole("button", { name: "욕실에 줄 추가" }));
    const dialog = screen.getByRole("dialog", { name: "줄 추가" });
    expect(field(dialog, "구분")).toHaveValue("욕실");
    expect(field(dialog, "업체")).toHaveFocus();
    const listId = field(dialog, "구분").getAttribute("list");
    const datalist = document.getElementById(listId ?? "");
    expect(datalist?.tagName).toBe("DATALIST");
    expect(
      Array.from(datalist?.querySelectorAll("option") ?? []).map((option) => option.value),
    ).toEqual(["도배", "욕실"]);
  });

  it("고친 것이 없으면 [저장] 비활성, 고친 채 닫으면 확인(취소하면 그대로)", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await renderApp(storageWith([makeSimplePlanP()]));
    const dialog = await openNewLine(user);
    expect(within(dialog).getByRole("button", { name: "저장" })).toBeDisabled();
    await user.type(field(dialog, "업체"), "가");
    expect(within(dialog).getByRole("button", { name: "저장" })).toBeEnabled();
    await user.click(within(dialog).getByRole("button", { name: "취소" }));
    expect(confirm).toHaveBeenCalledWith("고친 내용을 버리고 닫을까요?");
    expect(screen.getByRole("dialog", { name: "줄 추가" })).toBe(dialog);
  });
});

describe("AC-2(c) 입력 경계: 오류는 그 칸 아래, 저장 막힘(쓰기 0회), 입력 유지", () => {
  it("구분·업체·견적이 비면 각 칸 아래 필수 오류, 첫 오류(구분)로 포커스, 쓰기 0회 → 채우면 저장", async () => {
    const user = userEvent.setup();
    const storage = storageWith([makeSimplePlanP()]);
    await renderApp(storage);
    const setItem = vi.spyOn(storage, "setItem");
    const dialog = await openNewLine(user);
    await user.type(field(dialog, "세부내용(선택)"), "실크");
    await save(user, dialog);

    const trade = field(dialog, "구분");
    const vendor = field(dialog, "업체");
    const amount = field(dialog, "견적");
    expect(trade).toHaveAccessibleDescription(expect.stringContaining("구분을 입력하세요"));
    expect(vendor).toHaveAccessibleDescription(expect.stringContaining("업체 이름을 입력하세요"));
    expect(amount).toHaveAccessibleDescription(expect.stringContaining("견적 금액을 입력하세요"));
    for (const input of [trade, vendor, amount]) {
      const error = document.getElementById(`${input.id}-error`) as HTMLElement;
      // 오류 문구는 그 칸 바로 뒤(같은 칸 묶음 안)에 있다
      expect(error.parentElement).toContainElement(input);
      expect(input.compareDocumentPosition(error) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(trade).toHaveFocus();
    expect(setItem).not.toHaveBeenCalled();
    expect(field(dialog, "세부내용(선택)")).toHaveValue("실크");

    await user.type(trade, "도배");
    await user.type(vendor, "가나");
    await user.type(amount, "150");
    await saveAndClose(user, dialog);
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it("업체만 채우고 견적을 비운 시트는 저장이 막힌다(AC-3)", async () => {
    const user = userEvent.setup();
    const storage = storageWith([makeSimplePlanP()]);
    await renderApp(storage);
    const before = storage.getItem(INTERIOR_PLANS_STORAGE_KEY);
    const dialog = await openNewLine(user);
    await user.type(field(dialog, "구분"), "도배");
    await user.type(field(dialog, "업체"), "가나");
    await save(user, dialog);
    expect(field(dialog, "견적")).toHaveAccessibleDescription(
      expect.stringContaining("견적 금액을 입력하세요"),
    );
    expect(field(dialog, "견적")).toHaveFocus();
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe(before);
  });

  it.each([
    ["1", 1, "10,000"],
    ["999999999", 999_999_999, "9,999,999,990,000"],
  ])("견적 %j → 저장 %i, 표 %s원", async (typed, amount, won) => {
    const user = userEvent.setup();
    const storage = storageWith([makeSimplePlanP({ items: [] })]);
    await renderApp(storage);
    const dialog = await openNewLine(user);
    await user.type(field(dialog, "구분"), "도배");
    await user.type(field(dialog, "업체"), "가나");
    await user.type(field(dialog, "견적"), typed);
    await saveAndClose(user, dialog);
    expect(storedItems(storage)[0].quotes?.[0].amount).toBe(amount);
    await user.click(screen.getByRole("radio", { name: "표" }));
    expect(within(screen.getByRole("table")).getAllByRole("row")[1]).toHaveTextContent(won);
  });

  it.each([
    ["0", "0보다 큰 금액을 입력하세요"],
    ["1.5", "정수(만원 단위)로 입력하세요"],
    ["1000000000", "최대 9자리(999,999,999만원)까지 입력할 수 있습니다"],
    ["12a", "숫자만 입력하세요"],
  ])("견적 %j → 칸 아래 '%s', 쓰기 0회", async (typed, message) => {
    const user = userEvent.setup();
    const storage = storageWith([makeSimplePlanP()]);
    await renderApp(storage);
    const setItem = vi.spyOn(storage, "setItem");
    const dialog = await openNewLine(user);
    await user.type(field(dialog, "구분"), "도배");
    await user.type(field(dialog, "업체"), "가나");
    await user.type(field(dialog, "견적"), typed);
    await save(user, dialog);
    expect(field(dialog, "견적")).toHaveAccessibleDescription(expect.stringContaining(message));
    expect(setItem).not.toHaveBeenCalled();
  });

  it("붙여넣기 '1,000' → 1000으로 저장", async () => {
    const user = userEvent.setup();
    const storage = storageWith([makeSimplePlanP({ items: [] })]);
    await renderApp(storage);
    const dialog = await openNewLine(user);
    await user.type(field(dialog, "구분"), "도배");
    await user.type(field(dialog, "업체"), "가나");
    await user.click(field(dialog, "견적"));
    await user.paste("1,000");
    await saveAndClose(user, dialog);
    expect(storedItems(storage)[0].quotes?.[0].amount).toBe(1000);
  });

  it("구분 31자는 '30자 이하로 입력하세요(현재 31자)', 30자는 저장(직접 입력 구분은 새 묶음)", async () => {
    const user = userEvent.setup();
    const storage = storageWith([makeSimplePlanP()]);
    await renderApp(storage);
    const dialog = await openNewLine(user);
    const trade = field(dialog, "구분");
    await user.type(trade, "가".repeat(31));
    await user.type(field(dialog, "업체"), "가나");
    await user.type(field(dialog, "견적"), "10");
    await save(user, dialog);
    expect(trade).toHaveAccessibleDescription(
      expect.stringContaining("30자 이하로 입력하세요(현재 31자)"),
    );
    expect(storedItems(storage)).toHaveLength(5);
    await user.type(trade, "{Backspace}");
    await saveAndClose(user, dialog);
    expect(storedItems(storage).at(-1)?.trade).toBe("가".repeat(30));
    expect(screen.getByRole("region", { name: "가".repeat(30) })).toBeInTheDocument();
  });

  it('공백: 구분 "  도배  " → trade "도배"(기존 묶음), 세부내용·비고 "   " → 키 없음', async () => {
    const user = userEvent.setup();
    const storage = storageWith([makeSimplePlanP()]);
    await renderApp(storage);
    const dialog = await openNewLine(user);
    await user.type(field(dialog, "구분"), "  도배  ");
    await user.type(field(dialog, "업체"), "가나");
    await user.type(field(dialog, "세부내용(선택)"), "   ");
    await user.type(field(dialog, "견적"), "10");
    await user.type(field(dialog, "비고(선택)"), "   ");
    await saveAndClose(user, dialog);
    const added = storedItems(storage).at(-1);
    expect(fieldsOf(added)).toStrictEqual({
      spaceId: "sp-whole",
      trade: "도배",
      quotes: [{ id: added?.quotes?.[0].id, vendor: "가나", amount: 10 }],
      status: "planned",
    });
    expect(
      within(screen.getByRole("region", { name: "도배" })).getAllByRole("listitem"),
    ).toHaveLength(3);
  });

  it("저장 실패(로컬 unavailable)면 시트에 이유, 입력 그대로", async () => {
    const user = userEvent.setup();
    const storage = storageWith([makeSimplePlanP()]);
    await renderApp(storage);
    const dialog = await openNewLine(user);
    await user.type(field(dialog, "구분"), "도배");
    await user.type(field(dialog, "업체"), "가나");
    await user.type(field(dialog, "견적"), "10");
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    await save(user, dialog);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/^저장하지 못했습니다/);
    expect(field(dialog, "업체")).toHaveValue("가나");
  });
});

describe("AC-2(d) 줄 삭제·고치기 (P)", () => {
  it("R2 [삭제] → '이 줄을 지울까요?' 확인 뒤 removeItem(R2), 지출 예정 그대로 800", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const storage = storageWith([makeSimplePlanP()]);
    await renderApp(storage);
    const dialog = await openLine(user, "도배 동네도배 합지");
    expect(within(dialog).queryByText(/같이 씁니다/)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "삭제" }));
    expect(confirm).toHaveBeenCalledWith("이 줄을 지울까요?");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(storedItems(storage).map((item) => item.id)).toEqual(["r1", "r3", "r4", "r5"]);
    expect(headlineValue("지출 예정")).toBe("800만원");
  });

  it("삭제 확인을 취소하면 쓰지 않는다", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const storage = storageWith([makeSimplePlanP()]);
    await renderApp(storage);
    const before = storage.getItem(INTERIOR_PLANS_STORAGE_KEY);
    const dialog = await openLine(user, "도배 동네도배 합지");
    await user.click(within(dialog).getByRole("button", { name: "삭제" }));
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe(before);
    expect(screen.getByRole("dialog", { name: "줄" })).toBe(dialog);
  });

  it("R2를 열면 값이 채워져 있고, 세부내용을 비우고 확정을 켜면 quote.memo 키 없음·확정 R2, 상태 그대로", async () => {
    const user = userEvent.setup();
    const storage = storageWith([makeSimplePlanP()]);
    await renderApp(storage);
    const dialog = await openLine(user, "도배 동네도배 합지");
    expect(field(dialog, "구분")).toHaveValue("도배");
    expect(field(dialog, "업체")).toHaveValue("동네도배");
    expect(field(dialog, "세부내용(선택)")).toHaveValue("합지");
    expect(field(dialog, "견적")).toHaveValue("150");
    expect(within(dialog).getByRole("checkbox", { name: "확정" })).not.toBeChecked();
    await user.clear(field(dialog, "세부내용(선택)"));
    await user.click(within(dialog).getByRole("checkbox", { name: "확정" }));
    await saveAndClose(user, dialog);
    expect(fieldsOf(storedItem(storage, "r2"))).toStrictEqual({
      ...fieldsOf(r2()),
      quotes: [{ id: "rq2", vendor: "동네도배", amount: 150 }],
      confirmedQuoteId: "rq2",
    });
    expect(headlineValue("지출 예정")).toBe("950만원");
  });

  // 옛 "견적 중 항목을 [확정]하면 상태가 '확정'으로 바뀐다"의 반전(A4)
  it("견적 중 항목의 줄을 시트에서 확정해도 status는 견적 중 그대로", async () => {
    const user = userEvent.setup();
    const plan = makeSimplePlanP({
      items: makeSimplePlanP().items.map((item) =>
        item.id === "r4" ? { ...item, status: "quoting" as const } : item,
      ),
    });
    const storage = storageWith([plan]);
    await renderApp(storage);
    const dialog = await openLine(user, "욕실 욕실나라 철거·방수 (1)");
    await user.click(within(dialog).getByRole("checkbox", { name: "확정" }));
    await saveAndClose(user, dialog);
    expect(fieldsOf(storedItem(storage, "r4"))).toStrictEqual({
      ...fieldsOf(r4()),
      status: "quoting",
      confirmedQuoteId: "rq4",
    });
  });

  it("확정 줄 R1의 확정을 시트에서 끄면 confirmedQuoteId 키가 없다", async () => {
    const user = userEvent.setup();
    const storage = storageWith([makeSimplePlanP()]);
    await renderApp(storage);
    const dialog = await openLine(user, "도배 육문수 실크 전체");
    await user.click(within(dialog).getByRole("checkbox", { name: "확정" }));
    await saveAndClose(user, dialog);
    const stored = storedItem(storage, "r1");
    expect(stored !== undefined && Object.hasOwn(stored, "confirmedQuoteId")).toBe(false);
    const { confirmedQuoteId, ...rest } = fieldsOf(r1());
    void confirmedQuoteId;
    expect(fieldsOf(stored)).toStrictEqual(rest);
  });
});

describe("AC-4 옛 계획 L 고치기 (D2 a 제자리 수정)", () => {
  it("(a)(d) 욕실나라 견적 400 → 380: X와 quotes[1].amount만 다르다, 시트 아래 '같은 항목의 견적 2개가 구분·비고·확정을 같이 씁니다'", async () => {
    const user = userEvent.setup();
    const storage = storageWith([makePlanL()]);
    await renderApp(storage, L_HASH);
    const dialog = await openLine(user, "욕실 욕실나라");
    expect(
      within(dialog).getByText("같은 항목의 견적 2개가 구분·비고·확정을 같이 씁니다"),
    ).toBeInTheDocument();
    expect(field(dialog, "비고(선택)")).toHaveValue("폐기물 포함");
    await user.clear(field(dialog, "견적"));
    await user.type(field(dialog, "견적"), "380");
    await saveAndClose(user, dialog);
    const x = legacyX();
    expect(fieldsOf(storedItem(storage, "item-x"))).toStrictEqual({
      ...fieldsOf(x),
      quotes: [x.quotes![0], { id: "q2", vendor: "욕실나라", amount: 380 }],
    });
  });

  it("(d) 견적 1개 항목(Z)의 시트에는 공유 안내가 없다", async () => {
    const user = userEvent.setup();
    await renderApp(storageWith([makePlanL()]), L_HASH);
    const dialog = await openLine(user, "욕실 하루바스 타일 덧방");
    expect(within(dialog).queryByText(/같이 씁니다/)).not.toBeInTheDocument();
  });

  it("(b) Y를 열면 비고 칸이 비어 있고(합성 '예산 200만원' 아님), 육문수·180 저장 → memo 키 없음·예산 200·상태·공간 s0 유지 + 견적 1개, 확정 꺼짐이라 지출 예정 370", async () => {
    const user = userEvent.setup();
    const storage = storageWith([makePlanL()]);
    await renderApp(storage, L_HASH);
    const dialog = await openLine(user, "도배");
    expect(field(dialog, "비고(선택)")).toHaveValue("");
    expect(field(dialog, "업체")).toHaveValue("");
    expect(field(dialog, "견적")).toHaveValue("");
    await user.type(field(dialog, "업체"), "육문수");
    await user.type(field(dialog, "견적"), "180");
    await saveAndClose(user, dialog);
    const stored = storedItem(storage, "item-y");
    expect(fieldsOf(stored)).toStrictEqual({
      ...fieldsOf(legacyY()),
      quotes: [{ id: stored?.quotes?.[0].id, vendor: "육문수", amount: 180 }],
    });
    expect(headlineValue("지출 예정")).toBe("370만원");
    expect(screen.getByRole("checkbox", { name: "도배 육문수 확정" })).toBeEnabled();
  });

  it("(c) 욕실나라 삭제 → X에서 q2만 빠짐(확정 q1·지급·연락처 유지), 지급이 있어도 항목이 남으므로 지급 문구 없음", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const storage = storageWith([makePlanL()]);
    await renderApp(storage, L_HASH);
    const dialog = await openLine(user, "욕실 욕실나라");
    await user.click(within(dialog).getByRole("button", { name: "삭제" }));
    expect(confirm).toHaveBeenCalledWith("이 줄을 지울까요?");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const x = legacyX();
    expect(fieldsOf(storedItem(storage, "item-x"))).toStrictEqual({
      ...fieldsOf(x),
      quotes: [x.quotes![0]],
    });
    expect(headlineValue("지출 예정")).toBe("370만원");
  });

  it("(c) 타일 덧방 삭제 → removeItem(Z)", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const storage = storageWith([makePlanL()]);
    await renderApp(storage, L_HASH);
    const dialog = await openLine(user, "욕실 하루바스 타일 덧방");
    await user.click(within(dialog).getByRole("button", { name: "삭제" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(storedItems(storage).map((item) => item.id)).toEqual(["item-x", "item-y"]);
  });

  it("(c) 확정 견적 하루바스 철거·방수(q1) 삭제 → X는 quotes [q2], confirmedQuoteId 키 없음, 지출 예정 0 · 남은 예산 3,000", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const storage = storageWith([makePlanL()]);
    await renderApp(storage, L_HASH);
    const dialog = await openLine(user, "욕실 하루바스 철거·방수");
    await user.click(within(dialog).getByRole("button", { name: "삭제" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const stored = storedItem(storage, "item-x");
    expect(stored !== undefined && Object.hasOwn(stored, "confirmedQuoteId")).toBe(false);
    const { confirmedQuoteId, ...rest } = fieldsOf(legacyX());
    void confirmedQuoteId;
    expect(fieldsOf(stored)).toStrictEqual({ ...rest, quotes: [legacyX().quotes![1]] });
    expect(headlineValue("지출 예정")).toBe("0만원");
    expect(headlineValue("남은 예산")).toBe("3,000만원");
  });

  it("(e) 견적 1개 + 지급 2건 항목의 줄 삭제 → '이 줄을 지울까요? 지급 2건도 함께 지워집니다' 뒤 removeItem, 지급이 없으면 문구 없음", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const paid: InteriorItem = {
      ...legacyX(),
      id: "item-paid",
      quotes: [legacyX().quotes![0]],
      payments: [
        { id: "p1", label: "계약금", amount: 100, isPaid: true },
        { id: "p2", label: "잔금", amount: 270, isPaid: false },
      ],
    };
    const storage = storageWith([makePlanL({ items: [paid, legacyY()] })]);
    await renderApp(storage, L_HASH);
    const dialog = await openLine(user, "욕실 하루바스 철거·방수");
    await user.click(within(dialog).getByRole("button", { name: "삭제" }));
    expect(confirm).toHaveBeenLastCalledWith("이 줄을 지울까요? 지급 2건도 함께 지워집니다");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(storedItems(storage).map((item) => item.id)).toEqual(["item-y"]);

    const blank = await openLine(user, "도배");
    await user.click(within(blank).getByRole("button", { name: "삭제" }));
    expect(confirm).toHaveBeenLastCalledWith("이 줄을 지울까요?");
  });
});
