// @vitest-environment jsdom
// 스펙 interior-simple AC-7(태스크 2-2, qa): 만들기 시트 단순화.
// - 방·욕실 입력이 없고, 만든 계획의 `spaces`는 정확히 `[{ id, name: "전체" }]`(id는 createRandomId 값을 모듈 mock으로 고정).
// - 이름 빈칸·공백·41자 오류(저장 0회·포커스), 40자 통과.
// - 매물 추가 비용 인테리어 2줄(도배 300·조명 120) 가져오기 → 견적 없는 줄 2개, 비고 "예산 3,000,000원"·"예산 1,200,000원",
//   확정 체크 비활성, 지출 예정 0(예산 합 420이 세어지지 않음), 안내 문구 전체.
// - 로그아웃(로컬 원본)·로그인 혼자·가구 모두 같은 입력: 저장소 / POST 본문의 spaces가 하나.
// 화면 단위(시트 직접 렌더)로 입력 전체를 `toStrictEqual`로 묶고, 앱 단위로 화면 → 출처 → 저장 연결을 본다.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { createRandomId } from "@/lib/utils/createRandomId";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { LISTINGS_STORAGE_KEY } from "@/lib/utils/listingStorage";
import { SESSION_HINT_STORAGE_KEY } from "@/lib/utils/sessionHintStorage";
import { validateInteriorPlanFields } from "@/lib/utils/validateInteriorPlan";
import { createFakePlanApi, jsonResponse } from "@/test/fakePlanApi";
import { makeListing } from "@/test/listingFixture";
import { createMemoryStorage } from "@/test/memoryStorage";
import { renderWithQueryClient } from "@/test/renderWithQueryClient";

import CreatePlanSheet from "./components/CreatePlanSheet";

import type { InteriorPlanCreateInput, InteriorPlanWithItems } from "@/lib/types/interiorPlan";
import type { FakePlanApi } from "@/test/fakePlanApi";

vi.mock("@/lib/utils/createRandomId", () => ({ createRandomId: vi.fn() }));

type User = ReturnType<typeof userEvent.setup>;

const LISTING_ID = "listing-ac7";
const LISTING_NAME = "래미안 84";
const IMPORT_LABEL = "추가 비용 인테리어 2줄 가져오기";
/** 리드 승인: 바뀐 첫 문장 + 원래 둘째 문장을 둘 다 둔다(스펙 AC-7 문구가 앞부분) */
const IMPORT_NOTE =
  "줄 이름은 구분, 금액은 비고의 예산으로 넣습니다. 그 뒤로 매물의 추가 비용과는 따로 관리돼요";
const HOME_INTRO = "공정별 업체 견적을 모아 확정한 금액을 예산과 비교합니다";
const NO_QUOTE_DESCRIPTION = "견적이 없어 확정할 수 없습니다. 줄을 열어 업체를 적으세요";

/** AC-7 예시 매물: 인테리어/도배 300, 인테리어/조명 120, 가전/냉장고 400(가져오지 않음) */
const listingAc7 = makeListing({
  id: LISTING_ID,
  name: LISTING_NAME,
  extraCosts: [
    { category: "interior", label: "도배", amount: 300 },
    { category: "appliance", label: "냉장고", amount: 400 },
    { category: "interior", label: "조명", amount: 120 },
  ],
});

/** createRandomId mock: 부를 때마다 "rid0001", "rid0002"…(계획 id 경로에도 쓰이므로 주소에 그대로 들어간다) */
const randomId = vi.mocked(createRandomId);
const issuedIds = () => randomId.mock.results.map((result) => result.value as string);

beforeEach(() => {
  let next = 0;
  randomId.mockReset();
  randomId.mockImplementation(() => `rid${String((next += 1)).padStart(4, "0")}`);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

/** 요약의 큰 값(남은 예산·지출 예정) */
const headlineValue = (label: string) =>
  within(screen.getByRole("region", { name: "요약" })).getByText(label).nextElementSibling
    ?.textContent;

/** 요약의 작은 값(총 예산) */
const detailValue = (label: string) =>
  within(screen.getByRole("region", { name: "요약" })).getByText(label, { selector: "dt" })
    .nextElementSibling?.textContent;

/** 목록 묶음: [구분, [줄 여는 버튼 글자, 확정 여부, 체크 비활성]...] */
function listShape() {
  return screen
    .getAllByRole("region")
    .filter((region) => region.getAttribute("aria-label") !== "요약")
    .map((region) => [
      within(region).getByRole("heading", { level: 3 }).textContent,
      within(region)
        .getAllByRole("listitem")
        .map((row) => {
          const box = within(row).getByRole("checkbox") as HTMLInputElement;
          return [within(row).getByRole("button").textContent, box.checked, box.disabled];
        }),
    ]);
}

const storedPlans = (storage: Storage) =>
  (
    JSON.parse(storage.getItem(INTERIOR_PLANS_STORAGE_KEY) ?? '{"plans":[]}') as {
      plans: InteriorPlanWithItems[];
    }
  ).plans;

/** id·시각을 뺀 항목 필드 */
const itemFieldsOf = (plan: InteriorPlanWithItems) =>
  plan.items.map((item) => {
    const { id, createdAt, updatedAt, ...fields } = item;
    void [id, createdAt, updatedAt];
    return fields;
  });

describe("AC-7 만들기 시트 (시트 단위: onCreate 입력 전체)", () => {
  function renderSheet(listing: Parameters<typeof CreatePlanSheet>[0]["listing"] = null) {
    const onCreate = vi.fn(async (input: InteriorPlanCreateInput) => {
      void input;
      return { ok: true as const };
    });
    render(<CreatePlanSheet onCreate={onCreate} listing={listing} onClose={() => {}} />);
    return { onCreate, dialog: screen.getByRole("dialog", { name: "인테리어 계획 만들기" }) };
  }

  it("방·욕실 입력이 없다: 칸은 계획 이름·총 예산(선택)뿐, 라디오·그룹·공간 안내 없음", () => {
    const { dialog } = renderSheet();
    expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("group")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      within(dialog)
        .getAllByRole("textbox")
        .map((box) => box.id),
    ).toEqual(["interior-plan-name", "interior-plan-budget"]);
    expect(within(dialog).getByRole("textbox", { name: "계획 이름" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("총 예산(선택)")).toBeInTheDocument();
    for (const gone of ["방 수", "욕실 수", "공간", "현관", "거실", "베란다"]) {
      expect(dialog.textContent).not.toContain(gone);
    }
  });

  it("이름만 넣고 만들기 → onCreate 입력은 정확히 { name, spaces: [{ id: createRandomId 값, name: '전체' }] }(budget·listingId·items 키 없음), 공용 검증 통과", async () => {
    const user = userEvent.setup();
    const { onCreate, dialog } = renderSheet();
    await user.type(within(dialog).getByRole("textbox", { name: "계획 이름" }), "  우리 집  ");
    await user.click(within(dialog).getByRole("button", { name: "만들기" }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(randomId).toHaveBeenCalledTimes(1);
    const [input] = onCreate.mock.calls[0];
    expect(input).toStrictEqual({ name: "우리 집", spaces: [{ id: "rid0001", name: "전체" }] });
    // 저장 형식(공간 1개 이상·이름 1~20자) 그대로 통과한다: 서버·로컬 검증이 같은 함수다
    expect(validateInteriorPlanFields(input)).toStrictEqual(input);
  });

  it("총 예산 10,000,000원 → budgetWon 10000000(budget 키 없음), 공간은 그래도 '전체' 하나", async () => {
    const user = userEvent.setup();
    const { onCreate, dialog } = renderSheet();
    await user.type(within(dialog).getByRole("textbox", { name: "계획 이름" }), "우리 집");
    await user.type(within(dialog).getByLabelText("총 예산(선택)"), "10000000");
    await user.click(within(dialog).getByRole("button", { name: "만들기" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0][0]).toStrictEqual({
      name: "우리 집",
      budgetWon: 10_000_000,
      spaces: [{ id: "rid0001", name: "전체" }],
    });
  });

  it.each([
    ["빈칸", "", "계획 이름을 입력하세요"],
    ["공백만", "   ", "계획 이름을 입력하세요"],
    ["41자", "가".repeat(41), "40자 이하로 입력하세요(현재 41자)"],
    ["앞뒤 공백 + 41자", ` ${"나".repeat(41)} `, "40자 이하로 입력하세요(현재 41자)"],
  ])(
    "이름 %s → 칸 아래 오류 '%s'·이름 칸 포커스·aria-invalid, onCreate 0회·id도 만들지 않음",
    async (_case, raw, message) => {
      const user = userEvent.setup();
      const { onCreate, dialog } = renderSheet();
      const nameInput = within(dialog).getByRole("textbox", { name: "계획 이름" });
      if (raw !== "") await user.type(nameInput, raw);
      // 포커스를 다른 칸으로 옮겨 둔 뒤 [만들기]
      await user.click(within(dialog).getByLabelText("총 예산(선택)"));
      await user.click(within(dialog).getByRole("button", { name: "만들기" }));

      expect(within(dialog).getByText(message)).toBeInTheDocument();
      expect(nameInput).toHaveAttribute("aria-invalid", "true");
      expect(nameInput).toHaveAccessibleDescription(expect.stringContaining(message));
      expect(nameInput).toHaveFocus();
      expect(onCreate).not.toHaveBeenCalled();
      expect(randomId).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog", { name: "인테리어 계획 만들기" })).toBe(dialog);
    },
  );

  it.each([
    ["40자", "가".repeat(40)],
    ["1자", "가"],
    ["이모지 40개(코드포인트 40)", "🏠".repeat(40)],
  ])("이름 %s는 통과", async (_case, raw) => {
    const user = userEvent.setup();
    const { onCreate, dialog } = renderSheet();
    fireEvent.change(within(dialog).getByRole("textbox", { name: "계획 이름" }), {
      target: { value: raw },
    });
    await user.click(within(dialog).getByRole("button", { name: "만들기" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0][0]).toStrictEqual({
      name: raw,
      spaces: [{ id: "rid0001", name: "전체" }],
    });
  });

  it("매물에서 왔으면: 이름·총 예산 4,200,000원(줄 합계 420만원) 채움, '2줄 가져오기' 체크·안내 문구 전체 → 입력은 전체 공간 하나 + 견적 없는 항목 2개(예산 300·120, 계획), 냉장고 없음", async () => {
    const user = userEvent.setup();
    const { onCreate, dialog } = renderSheet(listingAc7);
    expect(within(dialog).getByRole("textbox", { name: "계획 이름" })).toHaveValue(LISTING_NAME);
    expect(within(dialog).getByLabelText("총 예산(선택)")).toHaveValue("4,200,000");
    const importBox = within(dialog).getByRole("checkbox", { name: IMPORT_LABEL });
    expect(importBox).toBeChecked();
    expect(importBox).toHaveAccessibleDescription(IMPORT_NOTE);
    expect(within(dialog).getByText(IMPORT_NOTE)).toBeInTheDocument();
    expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "만들기" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(randomId).toHaveBeenCalledTimes(1);
    const [input] = onCreate.mock.calls[0];
    expect(input).toStrictEqual({
      name: LISTING_NAME,
      budgetWon: 4_200_000,
      listingId: LISTING_ID,
      spaces: [{ id: "rid0001", name: "전체" }],
      items: [
        { spaceId: "rid0001", trade: "도배", budget: 300, status: "planned" },
        { spaceId: "rid0001", trade: "조명", budget: 120, status: "planned" },
      ],
    });
    expect(JSON.stringify(input)).not.toContain("냉장고");
  });

  it("가져오기 체크를 풀면 items 키가 없고 공간은 '전체' 하나", async () => {
    const user = userEvent.setup();
    const { onCreate, dialog } = renderSheet(listingAc7);
    await user.click(within(dialog).getByRole("checkbox", { name: IMPORT_LABEL }));
    await user.click(within(dialog).getByRole("button", { name: "만들기" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0][0]).toStrictEqual({
      name: LISTING_NAME,
      budgetWon: 4_200_000,
      listingId: LISTING_ID,
      spaces: [{ id: "rid0001", name: "전체" }],
    });
  });
});

describe("AC-7 로그아웃(로컬 원본): 화면 → 저장소", () => {
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

  function renderApp(storage: Storage, hash: string) {
    stubLoggedOutApi();
    window.location.hash = hash;
    return renderWithQueryClient(<AppRoutes storage={storage} />);
  }

  async function openListingCard(user: User) {
    const list = await screen.findByRole("list", { name: /^저장한 매물/ });
    await user.click(
      within(list).getByRole("button", {
        name: new RegExp(`^${LISTING_NAME}`),
        expanded: false,
      }),
    );
    await user.click(await screen.findByRole("link", { name: `${LISTING_NAME} 인테리어 계획` }));
  }

  it("빈 상태(소개 문구) → [계획 만들기] → '우리 집' → #/home/{id}, 저장된 spaces는 정확히 [{ id: 시트가 만든 id, name: '전체' }], 빈 목록·지출 예정 0", async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorage();
    renderApp(storage, "#/home");
    expect(await screen.findByText(HOME_INTRO)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "계획 만들기" }));
    const dialog = screen.getByRole("dialog", { name: "인테리어 계획 만들기" });
    expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
    await user.type(within(dialog).getByRole("textbox", { name: "계획 이름" }), "우리 집");
    const issuedBefore = issuedIds().length;
    await user.click(within(dialog).getByRole("button", { name: "만들기" }));

    const [plan] = await waitFor(() => {
      const plans = storedPlans(storage);
      expect(plans).toHaveLength(1);
      return plans;
    });
    await waitFor(() => expect(window.location.hash).toBe(`#/home/${plan.id}`));
    // 시트가 [만들기]에서 처음 받은 id가 공간 id다(그 뒤 id는 로컬 스토어의 계획 id)
    const spaceId = issuedIds()[issuedBefore];
    expect(spaceId).toMatch(/^rid\d{4}$/);
    expect(plan.spaces).toStrictEqual([{ id: spaceId, name: "전체" }]);
    expect(plan.id).not.toBe(spaceId);
    expect(plan.items).toStrictEqual([]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "우리 집" })).toBeInTheDocument();
    expect(headlineValue("지출 예정")).toBe("0원");
  });

  it("이름 41자 → 오류·포커스, 저장소 쓰기 0회, 고쳐서 만들면 저장", async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorage();
    renderApp(storage, "#/home");
    await user.click(await screen.findByRole("button", { name: "계획 만들기" }));
    const dialog = screen.getByRole("dialog", { name: "인테리어 계획 만들기" });
    const nameInput = within(dialog).getByRole("textbox", { name: "계획 이름" });
    fireEvent.change(nameInput, { target: { value: "가".repeat(41) } });
    const setItem = vi.spyOn(storage, "setItem");
    await user.click(within(dialog).getByRole("button", { name: "만들기" }));
    expect(within(dialog).getByText("40자 이하로 입력하세요(현재 41자)")).toBeInTheDocument();
    expect(nameInput).toHaveFocus();
    expect(setItem.mock.calls.filter(([key]) => key === INTERIOR_PLANS_STORAGE_KEY)).toEqual([]);
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBeNull();

    fireEvent.change(nameInput, { target: { value: "가".repeat(40) } });
    await user.click(within(dialog).getByRole("button", { name: "만들기" }));
    await waitFor(() => expect(storedPlans(storage)).toHaveLength(1));
    expect(storedPlans(storage)[0].name).toBe("가".repeat(40));
    expect(storedPlans(storage)[0].spaces).toHaveLength(1);
  });

  it("매물 카드 → 시트(이름·총 예산 420·2줄 가져오기) → 만들기 → 견적 없는 줄 2개(목록에 비고 없음, 체크 비활성), 지출 예정 0 · 남은 예산 420, 다시 카드 → 그 계획", async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorage({
      [LISTINGS_STORAGE_KEY]: JSON.stringify([listingAc7]),
    });
    renderApp(storage, "#/listings");
    await openListingCard(user);

    const dialog = await screen.findByRole("dialog", { name: "인테리어 계획 만들기" });
    expect(within(dialog).getByRole("textbox", { name: "계획 이름" })).toHaveValue(LISTING_NAME);
    expect(within(dialog).getByLabelText("총 예산(선택)")).toHaveValue("4,200,000");
    expect(
      within(dialog).getByRole("checkbox", { name: IMPORT_LABEL }),
    ).toHaveAccessibleDescription(IMPORT_NOTE);
    const issuedBefore = issuedIds().length;
    await user.click(within(dialog).getByRole("button", { name: "만들기" }));
    await waitFor(() => expect(storedPlans(storage)).toHaveLength(1));
    const [plan] = storedPlans(storage);
    await waitFor(() => expect(window.location.hash).toBe(`#/home/${plan.id}`));

    const spaceId = issuedIds()[issuedBefore];
    expect(plan.spaces).toStrictEqual([{ id: spaceId, name: "전체" }]);
    expect(plan).toMatchObject({ name: LISTING_NAME, budgetWon: 4_200_000, listingId: LISTING_ID });
    expect(Object.hasOwn(plan, "budget")).toBe(false);
    expect(itemFieldsOf(plan)).toStrictEqual([
      { spaceId, trade: "도배", budget: 300, status: "planned" },
      { spaceId, trade: "조명", budget: 120, status: "planned" },
    ]);

    // 화면: 업체·견적 없는 줄 2개(합성 비고 "예산 n만원"은 목록에 그리지 않는다), 확정 체크는 비활성 + 이유
    expect(listShape()).toEqual([
      ["도배", [["견적 없음", false, true]]],
      ["조명", [["견적 없음", false, true]]],
    ]);
    for (const name of ["도배 확정", "조명 확정"]) {
      expect(screen.getByRole("checkbox", { name })).toHaveAccessibleDescription(
        NO_QUOTE_DESCRIPTION,
      );
    }
    // 예산 합 420은 지출 예정에 세어지지 않는다
    expect(headlineValue("지출 예정")).toBe("0원");
    expect(headlineValue("남은 예산")).toBe("4,200,000원");
    expect(detailValue("총 예산")).toBe("4,200,000원");

    // 확정 체크를 강제로 눌러도 쓰기 0회
    const rawAfterCreate = storage.getItem(INTERIOR_PLANS_STORAGE_KEY);
    const setItem = vi.spyOn(storage, "setItem");
    fireEvent.click(screen.getByRole("checkbox", { name: "도배 확정" }));
    expect(setItem).not.toHaveBeenCalled();
    expect(headlineValue("지출 예정")).toBe("0원");

    // 다시 매물 카드 → 만들기 시트가 아니라 그 계획
    window.location.hash = "#/listings";
    await openListingCard(user);
    await waitFor(() => expect(window.location.hash).toBe(`#/home/${plan.id}`));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: LISTING_NAME })).toBeInTheDocument();
    expect(storedPlans(storage)).toHaveLength(1);
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe(rawAfterCreate);
  });
});

describe("AC-7 로그인(혼자·가구): POST 본문의 spaces가 하나", () => {
  const PLAN_LIST_PATH = "/api/interior-plans";

  function renderLoggedIn(isInHousehold: boolean, hash: string) {
    const storage = createMemoryStorage({ [SESSION_HINT_STORAGE_KEY]: "1" });
    const api = createFakePlanApi({ userId: "user-a", isInHousehold, plans: [] });
    api.server.respond = (call) =>
      call.method === "GET" && call.path === "/api/listings"
        ? jsonResponse(200, { listings: [structuredClone(listingAc7)] })
        : undefined;
    window.location.hash = hash;
    render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });
    return { api, storage };
  }

  const postedPlan = (api: FakePlanApi) =>
    (api.callsTo("POST", PLAN_LIST_PATH)[0].body as { plan: InteriorPlanCreateInput }).plan;

  it.each([
    ["혼자", false],
    ["가구", true],
  ])(
    "%s: 빈 상태 → [계획 만들기] '우리 집' → POST 1건, 본문 plan은 정확히 { name, spaces: [{ id, name: '전체' }] }, #/home/{서버 id}",
    async (_mode, isInHousehold) => {
      const user = userEvent.setup();
      const { api, storage } = renderLoggedIn(isInHousehold, "#/home");
      await user.click(await screen.findByRole("button", { name: "계획 만들기" }));
      const dialog = screen.getByRole("dialog", { name: "인테리어 계획 만들기" });
      await user.type(within(dialog).getByRole("textbox", { name: "계획 이름" }), "우리 집");
      await user.click(within(dialog).getByRole("button", { name: "만들기" }));

      await waitFor(() => expect(api.callsTo("POST", PLAN_LIST_PATH)).toHaveLength(1));
      await waitFor(() => expect(window.location.hash).toMatch(/^#\/home\/srvplan\d+$/));
      // 로그인에서는 계획 id를 서버가 정하므로 createRandomId는 공간 id 한 번만
      expect(issuedIds()).toEqual(["rid0001"]);
      expect(postedPlan(api)).toStrictEqual({
        name: "우리 집",
        spaces: [{ id: "rid0001", name: "전체" }],
      });
      expect(api.server.plans.map((plan) => plan.spaces)).toStrictEqual([
        [{ id: "rid0001", name: "전체" }],
      ]);
      // 로컬 원본은 쓰지 않는다
      expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBeNull();
    },
  );

  it.each([
    ["혼자", false],
    ["가구", true],
  ])(
    "%s: 매물 카드 → 가져오기 → POST 본문 전체(전체 공간 하나 + 견적 없는 항목 2개), 화면 지출 예정 0 · 남은 예산 420",
    async (_mode, isInHousehold) => {
      const user = userEvent.setup();
      const { api } = renderLoggedIn(isInHousehold, "#/listings");
      const list = await screen.findByRole("list", { name: /^저장한 매물/ });
      await user.click(
        await within(list).findByRole("button", {
          name: new RegExp(`^${LISTING_NAME}`),
          expanded: false,
        }),
      );
      await user.click(await screen.findByRole("link", { name: `${LISTING_NAME} 인테리어 계획` }));
      const dialog = await screen.findByRole("dialog", { name: "인테리어 계획 만들기" });
      await user.click(within(dialog).getByRole("button", { name: "만들기" }));
      await waitFor(() => expect(api.callsTo("POST", PLAN_LIST_PATH)).toHaveLength(1));
      await waitFor(() => expect(window.location.hash).toMatch(/^#\/home\/srvplan\d+$/));

      expect(postedPlan(api)).toStrictEqual({
        name: LISTING_NAME,
        budgetWon: 4_200_000,
        listingId: LISTING_ID,
        spaces: [{ id: "rid0001", name: "전체" }],
        items: [
          { spaceId: "rid0001", trade: "도배", budget: 300, status: "planned" },
          { spaceId: "rid0001", trade: "조명", budget: 120, status: "planned" },
        ],
      });
      expect(await screen.findByRole("heading", { level: 1, name: LISTING_NAME })).toBeVisible();
      expect(listShape()).toEqual([
        ["도배", [["견적 없음", false, true]]],
        ["조명", [["견적 없음", false, true]]],
      ]);
      expect(headlineValue("지출 예정")).toBe("0원");
      expect(headlineValue("남은 예산")).toBe("4,200,000원");
      // 매물 쪽 쓰기 0회
      expect(
        api.server.calls.filter(
          (call) => call.path.startsWith("/api/listings") && call.method !== "GET",
        ),
      ).toEqual([]);
    },
  );
});
