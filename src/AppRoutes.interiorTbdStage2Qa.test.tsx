// @vitest-environment jsdom
// qa 태스크 2(스펙 interior-tbd-amount AC-0·AC-2 2단계, ADR-033 조건 5, ADR-034 조건 4·5·9): 2단계 화면(원 입력·빈칸 = 미정·0원)의
// 쓰기 경로를 저장소·요청 본문 단위로 본다.
// - 열고 닫기만 하면 쓰기 0(로그아웃·혼자·가구), 시트는 원 글자로 채운다.
// - 로그인 POST·PUT·PATCH·계획 POST 본문과 로그아웃 쓰기 → 로그인 /import 본문: 비운 견적은 두 금액 키가 없고, 고친 견적은 amountWon만,
//   총 예산은 budgetWon만이며, 한 견적·한 계획에 옛 키와 새 키가 함께 있지 않다. 본문은 공용 검증을 그대로 통과한다(서버와 같은 함수).
// - L의 Y(업체·견적 빈 줄)에 업체만 채우면 금액 없는 견적 1개 항목, 숨은 값(예산 200·상태·공간 s0) 유지.
// 기대값은 스펙 문장의 리터럴로 쓴다(제품 상수를 가져오지 않는다).
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { INTERIOR_PLAN_IMPORTS_STORAGE_KEY } from "@/lib/utils/interiorPlanImportStorage";
import { INTERIOR_PLANS_STORAGE_KEY, parseInteriorPlans } from "@/lib/utils/interiorPlanStorage";
import { PRIVACY_MODE_STORAGE_KEY } from "@/lib/utils/privacyModeStorage";
import { SESSION_HINT_STORAGE_KEY } from "@/lib/utils/sessionHintStorage";
import {
  validateInteriorItemFields,
  validateInteriorPlanFields,
} from "@/lib/utils/validateInteriorPlan";
import { createFakePlanApi, type FakePlanApi } from "@/test/fakePlanApi";
import {
  legacyY,
  makePlanL,
  makePlanM,
  makeSimplePlanPPlus,
  r1,
  r3,
} from "@/test/interiorSimpleFixture";
import { createMemoryStorage } from "@/test/memoryStorage";

import type {
  InteriorItem,
  InteriorItemInput,
  InteriorPlanCreateInput,
  InteriorPlanWithItems,
} from "@/lib/types/interiorPlan";

type User = ReturnType<typeof userEvent.setup>;
type Mode = "loggedOut" | "solo" | "household";

const AMOUNT = "견적(비우면 미정)";
const BUDGET = "총 예산(선택)";
const P_HASH = "#/home/plan-simple";
const PLANS_PATH = "/api/interior-plans";
const IMPORT_PATH = "/api/interior-plans/import";

const indented = (plans: InteriorPlanWithItems[]) => JSON.stringify({ plans }, null, 2);
const rawPlans = (raw: string | null) =>
  (JSON.parse(raw ?? '{"plans":[]}') as { plans: InteriorPlanWithItems[] }).plans;

const summaryRegion = () => screen.getByRole("region", { name: "요약" });
const headlineValue = (label: string) =>
  within(summaryRegion()).getByText(label).nextElementSibling?.textContent;
const openButton = (name: string) => screen.getByRole("button", { name: `${name} 열기` });

function fieldsOf(item: InteriorItem): InteriorItemInput {
  const { id, createdAt, updatedAt, ...fields } = item;
  void [id, createdAt, updatedAt];
  return fields;
}

/** 한 견적에 `amount`·`amountWon`, 한 계획에 `budget`·`budgetWon`이 함께 있는 곳(없어야 한다) */
function doubleKeysIn(value: unknown, path = "$"): string[] {
  if (Array.isArray(value))
    return value.flatMap((entry, index) => doubleKeysIn(entry, `${path}[${index}]`));
  if (typeof value !== "object" || value === null) return [];
  const record = value as Record<string, unknown>;
  const here = [
    ...(Object.hasOwn(record, "amount") && Object.hasOwn(record, "amountWon")
      ? [`${path} amount+amountWon`]
      : []),
    ...(Object.hasOwn(record, "budget") &&
    Object.hasOwn(record, "budgetWon") &&
    Object.hasOwn(record, "spaces")
      ? [`${path} budget+budgetWon`]
      : []),
  ];
  return [
    ...here,
    ...Object.entries(record).flatMap(([key, entry]) => doubleKeysIn(entry, `${path}.${key}`)),
  ];
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("AC-0(b) 2단계: 원 입력 시트(줄·계획 관리·만들기)를 열고 닫기만 하면 저장소·서버 쓰기 0 (세 모드)", () => {
  const seedPlans = () => [makeSimplePlanPPlus(), makePlanM()];

  function seedOf(mode: Mode): Record<string, string> {
    const raw = indented(seedPlans());
    if (mode === "loggedOut") return { [INTERIOR_PLANS_STORAGE_KEY]: raw };
    return {
      [INTERIOR_PLANS_STORAGE_KEY]: raw,
      [SESSION_HINT_STORAGE_KEY]: "1",
      [INTERIOR_PLAN_IMPORTS_STORAGE_KEY]: JSON.stringify({
        [mode === "solo" ? "user-a" : "user-old"]: ["plan-simple", "plan-m"],
      }),
    };
  }

  async function cancel(user: User, dialog: HTMLElement) {
    await user.click(within(dialog).getByRole("button", { name: "취소" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  }

  it.each<[Mode]>([["loggedOut"], ["solo"], ["household"]])("%s", async (mode) => {
    const seed = seedOf(mode);
    const storage = createMemoryStorage(seed);
    const setItem = vi.spyOn(storage, "setItem");
    const removeItem = vi.spyOn(storage, "removeItem");
    const api = createFakePlanApi({
      userId: mode === "loggedOut" ? null : mode === "solo" ? "user-a" : "user-b",
      isInHousehold: mode === "household",
      plans: mode === "loggedOut" ? [] : seedPlans(),
    });
    const user = userEvent.setup();
    window.location.hash = P_HASH;
    render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });
    const allowed = new Set([SESSION_HINT_STORAGE_KEY, PRIVACY_MODE_STORAGE_KEY]);
    const check = (step: string) => {
      const touched = [...setItem.mock.calls, ...removeItem.mock.calls]
        .map(([key]) => String(key))
        .filter((key) => !allowed.has(key));
      expect(touched, step).toEqual([]);
      expect(
        storage.getItem(INTERIOR_PLANS_STORAGE_KEY) === seed[INTERIOR_PLANS_STORAGE_KEY],
        step,
      ).toBe(true);
      expect(api.writes(), step).toEqual([]);
    };

    await screen.findByRole("button", { name: "도배 육문수 실크 전체 열기" });
    await waitFor(() => expect(api.queryClient.isFetching()).toBe(0));
    check("P⁺ 목록");

    // 옛 만원 키 R1(180) → 원 글자 "1,800,000", 힌트 억·만
    await user.click(openButton("도배 육문수 실크 전체"));
    let dialog = screen.getByRole("dialog", { name: "줄" });
    const r1Amount = within(dialog).getByLabelText(AMOUNT);
    expect(r1Amount).toHaveValue("1,800,000");
    expect(r1Amount).toHaveAccessibleDescription(expect.stringContaining("180만원"));
    expect(within(dialog).getByRole("button", { name: "저장" })).toBeDisabled();
    await cancel(user, dialog);
    check("R1 시트(옛 키)");

    await user.click(openButton("조명 빛나라조명 거실 매입등"));
    dialog = screen.getByRole("dialog", { name: "줄" });
    expect(within(dialog).getByLabelText(AMOUNT)).toHaveValue("");
    await cancel(user, dialog);
    check("R6 시트(미정)");

    // 계획 관리: 옛 budget 1000 → "10,000,000"
    await user.click(screen.getByRole("button", { name: "계획 관리" }));
    dialog = screen.getByRole("dialog", { name: "계획 관리" });
    const budget = within(dialog).getByLabelText(BUDGET);
    expect(budget).toHaveValue("10,000,000");
    expect(budget).toHaveAccessibleDescription(expect.stringContaining("1,000만원"));
    // 다른 계획 만들기 시트로 바꿔 열고 닫는다
    await user.click(within(dialog).getByRole("button", { name: "다른 계획 만들기" }));
    dialog = await screen.findByRole("dialog", { name: "인테리어 계획 만들기" });
    expect(within(dialog).getByLabelText(BUDGET)).toHaveValue("");
    await cancel(user, dialog);
    check("계획 관리 → 만들기 시트");

    window.location.hash = "#/home/plan-m";
    // M4(999원): 열기만 해도 '원 단위입니다' 안내가 뜨지만 쓰지 않는다
    await user.click(await screen.findByRole("button", { name: "조명 빛나라조명 열기" }));
    dialog = screen.getByRole("dialog", { name: "줄" });
    expect(within(dialog).getByLabelText(AMOUNT)).toHaveValue("999");
    expect(within(dialog).getByText("원 단위입니다")).toBeInTheDocument();
    await cancel(user, dialog);
    check("M4 시트(999원)");
  });
});

describe("AC-0 로그인 쓰기 본문 (2단계): 금액 키·예산 키 규칙, 공용 검증 통과", () => {
  async function renderLoggedIn(isInHousehold: boolean) {
    const plans = [makeSimplePlanPPlus()];
    const storage = createMemoryStorage({
      [SESSION_HINT_STORAGE_KEY]: "1",
      [INTERIOR_PLAN_IMPORTS_STORAGE_KEY]: JSON.stringify({ "user-a": [] }),
    });
    const api = createFakePlanApi({ userId: "user-a", isInHousehold, plans });
    window.location.hash = P_HASH;
    render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });
    await screen.findByRole("button", { name: "도배 육문수 실크 전체 열기" });
    return { api, storage };
  }

  const itemBody = (api: FakePlanApi, method: string, path: string) => {
    const calls = api.callsTo(method, path);
    expect(calls).toHaveLength(1);
    return (calls[0].body as { item: InteriorItemInput }).item;
  };

  it.each([
    ["혼자", false],
    ["가구", true],
  ])(
    "%s: [줄 추가] 미정 확정 POST · R1 비우기 PUT · R3 업체만 PUT · 총 예산 PATCH · 계획 POST",
    async (_, isInHousehold) => {
      const user = userEvent.setup();
      const { api, storage } = await renderLoggedIn(isInHousehold);

      // 1) [줄 추가] R6 모양, 견적 칸 비움, 확정 → addItem 입력 = 스펙 리터럴(금액 키 없음)
      await user.click(screen.getByRole("button", { name: "줄 추가" }));
      let dialog = screen.getByRole("dialog", { name: "줄 추가" });
      await user.type(within(dialog).getByLabelText("구분"), "조명");
      await user.type(within(dialog).getByLabelText("세부내용(선택)"), "거실 매입등");
      await user.type(within(dialog).getByLabelText("업체"), "빛나라조명");
      await user.click(within(dialog).getByRole("checkbox", { name: "확정" }));
      await user.click(within(dialog).getByRole("button", { name: "저장" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      const added = itemBody(api, "POST", `${PLANS_PATH}/plan-simple/items`);
      const id = added.quotes?.[0].id;
      expect(added).toStrictEqual({
        spaceId: "sp-whole",
        trade: "조명",
        quotes: [{ id, vendor: "빛나라조명", memo: "거실 매입등" }],
        confirmedQuoteId: id,
        status: "planned",
      });
      expect(Object.hasOwn(added.quotes![0], "amount")).toBe(false);
      expect(Object.hasOwn(added.quotes![0], "amountWon")).toBe(false);
      expect(validateInteriorItemFields(added)).toStrictEqual(added);
      await waitFor(() =>
        expect(within(summaryRegion()).getByText("금액 미정 2건 제외")).toBeInTheDocument(),
      );

      // 2) R1(옛 만원 180) 금액 지우기 → PUT 견적에 두 금액 키 모두 없음, 나머지는 열어 둔 항목 그대로
      await user.click(openButton("도배 육문수 실크 전체"));
      dialog = screen.getByRole("dialog", { name: "줄" });
      await user.clear(within(dialog).getByLabelText(AMOUNT));
      await user.click(within(dialog).getByRole("button", { name: "저장" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      const cleared = itemBody(api, "PUT", `${PLANS_PATH}/plan-simple/items/r1`);
      expect(cleared).toStrictEqual({
        ...fieldsOf(r1()),
        quotes: [{ id: "rq1", vendor: "육문수", memo: "실크 전체" }],
      });
      expect(Object.hasOwn(cleared.quotes![0], "amount")).toBe(false);
      expect(Object.hasOwn(cleared.quotes![0], "amountWon")).toBe(false);
      expect(validateInteriorItemFields(cleared)).toStrictEqual(cleared);
      await waitFor(() => expect(headlineValue("지출 예정")).toBe("6,200,000원"));
      expect(within(summaryRegion()).getByText("금액 미정 3건 제외")).toBeInTheDocument();

      // 3) R3(옛 만원 370) 업체만 고치기 → amountWon 3,700,000만, amount 없음
      await user.click(openButton("욕실 하루바스 철거·방수 (1)"));
      dialog = screen.getByRole("dialog", { name: "줄" });
      expect(within(dialog).getByLabelText(AMOUNT)).toHaveValue("3,700,000");
      await user.type(within(dialog).getByLabelText("업체"), "2");
      await user.click(within(dialog).getByRole("button", { name: "저장" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      const renamed = itemBody(api, "PUT", `${PLANS_PATH}/plan-simple/items/r3`);
      expect(renamed).toStrictEqual({
        ...fieldsOf(r3()),
        quotes: [{ id: "rq3", vendor: "하루바스2", amountWon: 3_700_000, memo: "철거·방수 (1)" }],
      });
      expect(headlineValue("지출 예정")).toBe("6,200,000원");

      // 4) 계획 관리: 옛 budget 1000 → 12,345,000원 = { budget: null, budgetWon }
      await user.click(screen.getByRole("button", { name: "계획 관리" }));
      dialog = screen.getByRole("dialog", { name: "계획 관리" });
      await user.clear(within(dialog).getByLabelText(BUDGET));
      await user.type(within(dialog).getByLabelText(BUDGET), "12345000");
      await user.click(within(dialog).getByRole("button", { name: "저장" }));
      await waitFor(() =>
        expect(api.callsTo("PATCH", `${PLANS_PATH}/plan-simple`)).toHaveLength(1),
      );
      expect(api.callsTo("PATCH", `${PLANS_PATH}/plan-simple`)[0].body).toStrictEqual({
        plan: { budget: null, budgetWon: 12_345_000 },
      });
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      await waitFor(() => expect(headlineValue("남은 예산")).toBe("6,145,000원"));

      // 5) 다른 계획 만들기: 총 예산 15,000,000원 → POST 본문 budgetWon만
      await user.click(screen.getByRole("button", { name: "계획 관리" }));
      await user.click(
        within(screen.getByRole("dialog", { name: "계획 관리" })).getByRole("button", {
          name: "다른 계획 만들기",
        }),
      );
      dialog = await screen.findByRole("dialog", { name: "인테리어 계획 만들기" });
      await user.type(within(dialog).getByRole("textbox", { name: "계획 이름" }), "새 집");
      await user.type(within(dialog).getByLabelText(BUDGET), "15000000");
      await user.click(within(dialog).getByRole("button", { name: "만들기" }));
      await waitFor(() => expect(api.callsTo("POST", PLANS_PATH)).toHaveLength(1));
      const created = (api.callsTo("POST", PLANS_PATH)[0].body as { plan: InteriorPlanCreateInput })
        .plan;
      expect(created).toStrictEqual({
        name: "새 집",
        budgetWon: 15_000_000,
        spaces: [{ id: created.spaces[0].id, name: "전체" }],
      });
      expect(validateInteriorPlanFields(created)).toStrictEqual(created);

      // 모든 쓰기 본문과 서버 원본: 두 키 공존 0, 로컬 원본은 쓰지 않음, 서버 원본은 공용 파서가 받는다
      expect(api.writes().map((call) => `${call.method} ${call.path}`)).toEqual([
        `POST ${PLANS_PATH}/plan-simple/items`,
        `PUT ${PLANS_PATH}/plan-simple/items/r1`,
        `PUT ${PLANS_PATH}/plan-simple/items/r3`,
        `PATCH ${PLANS_PATH}/plan-simple`,
        `POST ${PLANS_PATH}`,
      ]);
      expect(doubleKeysIn(api.writes().map((call) => call.body))).toEqual([]);
      expect(doubleKeysIn(api.server.plans)).toEqual([]);
      expect(Object.hasOwn(api.server.plans[0], "budget")).toBe(false);
      expect(parseInteriorPlans(JSON.stringify({ plans: api.server.plans }))).toStrictEqual({
        status: "ok",
        plans: api.server.plans,
      });
      expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBeNull();
    },
  );
});

describe("AC-0(d) 로그아웃 2단계 쓰기 → 로그인 /import 본문 = 로컬 원문(두 키 공존 없음)", () => {
  it("L의 Y 업체만 · L 총 예산 원 · 새 계획(budgetWon) · 미정 줄 · 0원 줄 → 로그인하면 본문 = 저장 원문, 서버 GET 뒤 같은 숫자", async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorage({
      [INTERIOR_PLANS_STORAGE_KEY]: JSON.stringify({ plans: [makePlanL()] }),
    });
    const loggedOut = createFakePlanApi({ userId: null });
    window.location.hash = "#/home/plan-l";
    const first = render(<AppRoutes storage={storage} />, { wrapper: loggedOut.wrapper });

    // L의 Y: 업체만
    await user.click(await screen.findByRole("button", { name: "도배 열기" }));
    let dialog = screen.getByRole("dialog", { name: "줄" });
    await user.type(within(dialog).getByLabelText("업체"), "육문수");
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // L 총 예산(옛 3000) → 25,000,000원
    await user.click(screen.getByRole("button", { name: "계획 관리" }));
    dialog = screen.getByRole("dialog", { name: "계획 관리" });
    await user.clear(within(dialog).getByLabelText(BUDGET));
    await user.type(within(dialog).getByLabelText(BUDGET), "25000000");
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // 새 계획(총 예산 10,000,000원) + 미정 확정 줄 + 0원 확정 줄
    await user.click(screen.getByRole("button", { name: "계획 관리" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "계획 관리" })).getByRole("button", {
        name: "다른 계획 만들기",
      }),
    );
    dialog = await screen.findByRole("dialog", { name: "인테리어 계획 만들기" });
    await user.type(within(dialog).getByRole("textbox", { name: "계획 이름" }), "새 집");
    await user.type(within(dialog).getByLabelText(BUDGET), "10000000");
    await user.click(within(dialog).getByRole("button", { name: "만들기" }));
    await screen.findByRole("heading", { level: 1, name: "새 집" });
    for (const [trade, vendor, amount] of [
      ["조명", "빛나라조명", ""],
      ["철거", "셀프", "0"],
    ]) {
      await user.click(screen.getByRole("button", { name: "줄 추가" }));
      dialog = screen.getByRole("dialog", { name: "줄 추가" });
      await user.type(within(dialog).getByLabelText("구분"), trade);
      await user.type(within(dialog).getByLabelText("업체"), vendor);
      if (amount !== "") await user.type(within(dialog).getByLabelText(AMOUNT), amount);
      await user.click(within(dialog).getByRole("checkbox", { name: "확정" }));
      await user.click(within(dialog).getByRole("button", { name: "저장" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    }
    expect(headlineValue("지출 예정")).toBe("0원");
    expect(within(summaryRegion()).getByText("금액 미정 1건 제외")).toBeInTheDocument();

    const raw = storage.getItem(INTERIOR_PLANS_STORAGE_KEY);
    const [l, created] = rawPlans(raw);
    expect(doubleKeysIn(rawPlans(raw))).toEqual([]);
    expect(l.budgetWon).toBe(25_000_000);
    expect(Object.hasOwn(l, "budget")).toBe(false);
    expect(created.budgetWon).toBe(10_000_000);
    expect(Object.hasOwn(created, "budget")).toBe(false);
    expect(created.items.map((item) => item.quotes)).toStrictEqual([
      [{ id: created.items[0].quotes![0].id, vendor: "빛나라조명" }],
      [{ id: created.items[1].quotes![0].id, vendor: "셀프", amountWon: 0 }],
    ]);
    first.unmount();

    // 로그인(같은 기기, 이전 기록 없음): /import 본문 = 저장 원문 그대로
    storage.setItem(SESSION_HINT_STORAGE_KEY, "1");
    const api = createFakePlanApi({ userId: "user-a", plans: [] });
    window.location.hash = "#/";
    render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });
    await waitFor(() => expect(api.callsTo("POST", IMPORT_PATH)).toHaveLength(2));
    expect(api.callsTo("POST", IMPORT_PATH).map((call) => call.body)).toStrictEqual(
      rawPlans(raw).map((plan) => ({ plan })),
    );
    expect(api.server.plans).toStrictEqual(rawPlans(raw));
    await waitFor(() =>
      expect(
        within(screen.getByRole("link", { name: "우리 집 인테리어" }))
          .queryAllByText(/지출 예정/)
          .map((line) => line.textContent),
      ).toEqual(["옛 계획 · 지출 예정 3,700,000원", "새 집 · 지출 예정 0원 · 미정 1건"]),
    );
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY) === raw).toBe(true);
  });
});

describe("AC-2 2단계: L의 Y(업체·견적 빈 줄)에 업체만 채워 저장", () => {
  it("로그아웃: Y는 견적 1개(금액 없음) 항목, 예산 200·상태·spaceId s0 유지, 확정 꺼짐이라 미정 0건 → 확정하면 1건, 지출 예정 그대로", async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorage({
      [INTERIOR_PLANS_STORAGE_KEY]: JSON.stringify({ plans: [makePlanL()] }),
    });
    const api = createFakePlanApi({ userId: null });
    window.location.hash = "#/home/plan-l";
    render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });

    await user.click(await screen.findByRole("button", { name: "도배 열기" }));
    const dialog = screen.getByRole("dialog", { name: "줄" });
    expect(within(dialog).getByLabelText(AMOUNT)).toHaveValue("");
    await user.type(within(dialog).getByLabelText("업체"), "육문수");
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const [plan] = rawPlans(storage.getItem(INTERIOR_PLANS_STORAGE_KEY));
    const y = plan.items.find((item) => item.id === "item-y")!;
    const quoteId = y.quotes?.[0].id;
    expect(fieldsOf(y)).toStrictEqual({
      spaceId: "s0",
      trade: "도배",
      budget: 200,
      quotes: [{ id: quoteId, vendor: "육문수" }],
      status: "planned",
    });
    expect(fieldsOf(y)).toStrictEqual({
      ...fieldsOf(legacyY()),
      quotes: [{ id: quoteId, vendor: "육문수" }],
    });
    expect(Object.hasOwn(y.quotes![0], "amount")).toBe(false);
    expect(Object.hasOwn(y.quotes![0], "amountWon")).toBe(false);
    // 다른 항목·계획 필드는 그대로
    expect(plan.items.filter((item) => item.id !== "item-y")).toStrictEqual(
      makePlanL().items.filter((item) => item.id !== "item-y"),
    );
    const { items: _a, updatedAt: _b, ...planFields } = plan;
    const { items: _c, updatedAt: _d, ...seedFields } = makePlanL();
    void [_a, _b, _c, _d];
    expect(planFields).toStrictEqual(seedFields);

    const row = openButton("도배 육문수");
    expect(row).toHaveTextContent("미정");
    expect(headlineValue("지출 예정")).toBe("3,700,000원");
    expect(within(summaryRegion()).queryByText(/금액 미정/)).not.toBeInTheDocument();
    const box = screen.getByRole("checkbox", { name: "도배 육문수 확정" });
    expect(box).toBeEnabled();
    await user.click(box);
    await waitFor(() =>
      expect(within(summaryRegion()).getByText("금액 미정 1건 제외")).toBeInTheDocument(),
    );
    expect(headlineValue("지출 예정")).toBe("3,700,000원");
  });

  it("로그인 혼자: Y PUT 본문 = 열어 둔 Y + 견적 1개(금액 키 없음), 공용 검증 통과", async () => {
    const user = userEvent.setup();
    const api = createFakePlanApi({ userId: "user-a", plans: [makePlanL()] });
    window.location.hash = "#/home/plan-l";
    render(
      <AppRoutes
        storage={createMemoryStorage({
          [SESSION_HINT_STORAGE_KEY]: "1",
          [INTERIOR_PLAN_IMPORTS_STORAGE_KEY]: JSON.stringify({ "user-a": [] }),
        })}
      />,
      { wrapper: api.wrapper },
    );
    await user.click(await screen.findByRole("button", { name: "도배 열기" }));
    const dialog = screen.getByRole("dialog", { name: "줄" });
    await user.type(within(dialog).getByLabelText("업체"), "육문수");
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const puts = api.callsTo("PUT", `${PLANS_PATH}/plan-l/items/item-y`);
    expect(puts).toHaveLength(1);
    const { item } = puts[0].body as { item: InteriorItemInput };
    expect(item).toStrictEqual({
      ...fieldsOf(legacyY()),
      quotes: [{ id: item.quotes?.[0].id, vendor: "육문수" }],
    });
    expect(validateInteriorItemFields(item)).toStrictEqual(item);
    expect(await screen.findByRole("button", { name: "도배 육문수 열기" })).toHaveTextContent(
      "미정",
    );
  });
});

describe("AC-2 2단계 입력 경계 (화면)", () => {
  async function renderP(storage: Storage) {
    const api = createFakePlanApi({ userId: null });
    window.location.hash = P_HASH;
    render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });
    await screen.findByRole("button", { name: "도배 육문수 실크 전체 열기" });
  }

  it("견적 1,000,000,000 → 힌트 '10억원', 저장 amountWon 1,000,000,000, 목록 '1,000,000,000원'", async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorage({
      [INTERIOR_PLANS_STORAGE_KEY]: JSON.stringify({ plans: [makeSimplePlanPPlus()] }),
    });
    await renderP(storage);
    await user.click(screen.getByRole("button", { name: "줄 추가" }));
    const dialog = screen.getByRole("dialog", { name: "줄 추가" });
    await user.type(within(dialog).getByLabelText("구분"), "가구");
    await user.type(within(dialog).getByLabelText("업체"), "한샘");
    const amount = within(dialog).getByLabelText(AMOUNT);
    await user.type(amount, "1000000000");
    expect(amount).toHaveValue("1,000,000,000");
    expect(amount).toHaveAccessibleDescription(expect.stringContaining("10억원"));
    expect(within(dialog).queryByText("원 단위입니다")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const added = rawPlans(storage.getItem(INTERIOR_PLANS_STORAGE_KEY))[0].items.at(-1)!;
    expect(added.quotes).toStrictEqual([
      { id: added.quotes?.[0].id, vendor: "한샘", amountWon: 1_000_000_000 },
    ]);
    expect(openButton("가구 한샘")).toHaveTextContent("1,000,000,000원");
  });

  it.each([
    ["0", "0보다 큰 금액을 입력하세요"],
    ["1.5", "정수(원 단위)로 입력하세요"],
    ["10000000000000", "최대 13자리(9,999,999,999,999원)까지 입력할 수 있습니다"],
    ["12a", "숫자만 입력하세요"],
  ])("만들기 시트 총 예산 %j → 칸 아래 '%s', 쓰기 0회", async (typed, message) => {
    const user = userEvent.setup();
    const storage = createMemoryStorage();
    const setItem = vi.spyOn(storage, "setItem");
    const api = createFakePlanApi({ userId: null });
    window.location.hash = "#/home";
    render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });
    await user.click(await screen.findByRole("button", { name: "계획 만들기" }));
    const dialog = screen.getByRole("dialog", { name: "인테리어 계획 만들기" });
    await user.type(within(dialog).getByRole("textbox", { name: "계획 이름" }), "새 집");
    const budget = within(dialog).getByLabelText(BUDGET);
    await user.type(budget, typed);
    await user.click(within(dialog).getByRole("button", { name: "만들기" }));
    expect(budget).toHaveAccessibleDescription(expect.stringContaining(message));
    expect(setItem.mock.calls.filter(([key]) => key === INTERIOR_PLANS_STORAGE_KEY)).toEqual([]);
    expect(screen.getByRole("dialog", { name: "인테리어 계획 만들기" })).toBe(dialog);
  });

  it.each([
    ["1", 1, true],
    ["999", 999, true],
    ["10000", 10_000, false],
    ["9999999999999", 9_999_999_999_999, false],
  ])(
    "만들기 시트 총 예산 %j → budgetWon %i(budget 키 없음), '원 단위입니다' %s",
    async (typed, won, hasNotice) => {
      const user = userEvent.setup();
      const storage = createMemoryStorage();
      const api = createFakePlanApi({ userId: null });
      window.location.hash = "#/home";
      render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });
      await user.click(await screen.findByRole("button", { name: "계획 만들기" }));
      const dialog = screen.getByRole("dialog", { name: "인테리어 계획 만들기" });
      await user.type(within(dialog).getByRole("textbox", { name: "계획 이름" }), "새 집");
      await user.type(within(dialog).getByLabelText(BUDGET), typed);
      expect(within(dialog).queryByText("원 단위입니다") !== null).toBe(hasNotice);
      await user.click(within(dialog).getByRole("button", { name: "만들기" }));
      await waitFor(() =>
        expect(rawPlans(storage.getItem(INTERIOR_PLANS_STORAGE_KEY))).toHaveLength(1),
      );
      const [plan] = rawPlans(storage.getItem(INTERIOR_PLANS_STORAGE_KEY));
      expect(plan.budgetWon).toBe(won);
      expect(Object.hasOwn(plan, "budget")).toBe(false);
    },
  );

  it("만들기 시트 총 예산 '   '(공백만) → 예산 키 둘 다 없음", async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorage();
    const api = createFakePlanApi({ userId: null });
    window.location.hash = "#/home";
    render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });
    await user.click(await screen.findByRole("button", { name: "계획 만들기" }));
    const dialog = screen.getByRole("dialog", { name: "인테리어 계획 만들기" });
    await user.type(within(dialog).getByRole("textbox", { name: "계획 이름" }), "새 집");
    await user.type(within(dialog).getByLabelText(BUDGET), "   ");
    await user.click(within(dialog).getByRole("button", { name: "만들기" }));
    await waitFor(() =>
      expect(rawPlans(storage.getItem(INTERIOR_PLANS_STORAGE_KEY))).toHaveLength(1),
    );
    const [plan] = rawPlans(storage.getItem(INTERIOR_PLANS_STORAGE_KEY));
    expect(Object.hasOwn(plan, "budget")).toBe(false);
    expect(Object.hasOwn(plan, "budgetWon")).toBe(false);
  });

  it("계획 관리 총 예산 14자리 → 오류, 쓰기 0회 / 9,999,999,999,999 → budgetWon 상한 그대로", async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorage({
      [INTERIOR_PLANS_STORAGE_KEY]: JSON.stringify({ plans: [makeSimplePlanPPlus()] }),
    });
    await renderP(storage);
    const raw = storage.getItem(INTERIOR_PLANS_STORAGE_KEY);
    await user.click(screen.getByRole("button", { name: "계획 관리" }));
    const dialog = screen.getByRole("dialog", { name: "계획 관리" });
    const budget = within(dialog).getByLabelText(BUDGET);
    await user.clear(budget);
    await user.type(budget, "10000000000000");
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    expect(budget).toHaveAccessibleDescription(
      expect.stringContaining("최대 13자리(9,999,999,999,999원)까지 입력할 수 있습니다"),
    );
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe(raw);
    await user.clear(budget);
    await user.type(budget, "9999999999999");
    expect(budget).toHaveAccessibleDescription(expect.stringContaining("99,999억 9,999만 9,999원"));
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const [plan] = rawPlans(storage.getItem(INTERIOR_PLANS_STORAGE_KEY));
    expect(plan.budgetWon).toBe(9_999_999_999_999);
    expect(Object.hasOwn(plan, "budget")).toBe(false);
  });
});
