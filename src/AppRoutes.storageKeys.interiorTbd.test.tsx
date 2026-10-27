// @vitest-environment jsdom
// qa 태스크 1(스펙 interior-tbd-amount AC-0(a)(b)(d), ADR-034 조건 2·7): 금액 미정·0원·원 단위 키가 든 계획을 새 번들이
// 열기만 하면 저장소에 쓰지 않고, 서버 응답(GET·PUT·POST)에 그런 견적이 와도 불러오기 실패로 떨어지지 않으며,
// 다른 탭이 쓴 원문(`storage` 이벤트)도 손상이 아니다. 로그아웃에서 만든 P⁺·M은 로그인 이전 본문이 원문 그대로다.
// 시드는 들여쓴 JSON이라 앱이 다시 직렬화해 쓰면 ===에서 걸린다.
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { downloadTextFile } from "@/lib/utils/downloadTextFile";
import { INTERIOR_PLAN_IMPORTS_STORAGE_KEY } from "@/lib/utils/interiorPlanImportStorage";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { PRIVACY_MODE_STORAGE_KEY } from "@/lib/utils/privacyModeStorage";
import { SESSION_HINT_STORAGE_KEY } from "@/lib/utils/sessionHintStorage";
import { createFakePlanApi, jsonResponse, type FakePlanApi } from "@/test/fakePlanApi";
import {
  makePlanM,
  makeSimplePlanP,
  makeSimplePlanPPlus,
  simpleTime,
} from "@/test/interiorSimpleFixture";
import { createMemoryStorage } from "@/test/memoryStorage";

import type {
  InteriorItem,
  InteriorItemInput,
  InteriorPlanWithItems,
} from "@/lib/types/interiorPlan";

vi.mock("@/lib/utils/downloadTextFile", () => ({ downloadTextFile: vi.fn() }));

const download = vi.mocked(downloadTextFile);

/** 견적 금액 0(옛 키 만원 0·원 키 0)만 있는 계획. 총 예산은 원 키 1원 → 남은 1원 */
const zeroPlan = (): InteriorPlanWithItems => ({
  id: "plan-zero",
  name: "셀프 집",
  budgetWon: 1,
  spaces: [{ id: "sp-whole", name: "전체" }],
  createdAt: simpleTime(0),
  updatedAt: simpleTime(0),
  items: [
    {
      id: "z1",
      spaceId: "sp-whole",
      trade: "도배",
      quotes: [{ id: "zq1", vendor: "셀프도배", amount: 0 }],
      confirmedQuoteId: "zq1",
      status: "planned",
      createdAt: simpleTime(1),
      updatedAt: simpleTime(1),
    },
    {
      id: "z2",
      spaceId: "sp-whole",
      trade: "조명",
      quotes: [{ id: "zq2", vendor: "셀프조명", amountWon: 0 }],
      confirmedQuoteId: "zq2",
      status: "planned",
      createdAt: simpleTime(2),
      updatedAt: simpleTime(2),
    },
  ],
});

/** P⁺(미정) · M(원 키·옛 키 섞임, 미정) · 0원 계획. 저장 순서 그대로 */
const seedPlans = () => [makeSimplePlanPPlus(), makePlanM(), zeroPlan()];

const HUB_LINES = [
  "우리 집 · 지출 예정 8,000,000원 · 미정 1건",
  "섞인 집 · 지출 예정 10,469,500원 · 미정 1건",
  "셀프 집 · 지출 예정 0원",
];

const indented = (plans: InteriorPlanWithItems[]) => JSON.stringify({ plans }, null, 2);

type Mode = "loggedOut" | "solo" | "household";

const USER_ID: Record<Mode, string | null> = {
  loggedOut: null,
  solo: "user-a",
  household: "user-b",
};

function seedOf(mode: Mode): Record<string, string> {
  const raw = indented(seedPlans());
  if (mode === "loggedOut") return { [INTERIOR_PLANS_STORAGE_KEY]: raw };
  return {
    [INTERIOR_PLANS_STORAGE_KEY]: raw,
    [SESSION_HINT_STORAGE_KEY]: "1",
    // 혼자: 이 계정으로 세 계획 모두 이전이 끝난 기록(이전 POST가 없어야 한다). 가구는 이전을 건너뛴다.
    [INTERIOR_PLAN_IMPORTS_STORAGE_KEY]: JSON.stringify({
      [mode === "solo" ? "user-a" : "user-old"]: ["plan-simple", "plan-m", "plan-zero"],
    }),
  };
}

/** 허용된 쓰기: 로그인 힌트와 가리기 토글(privacy-mode) 뿐. 그 밖의 키·`interior-plans`는 0회 */
const ALLOWED_KEYS = new Set([SESSION_HINT_STORAGE_KEY, PRIVACY_MODE_STORAGE_KEY]);

type Spies = {
  setItem: { mock: { calls: unknown[][] } };
  removeItem: { mock: { calls: unknown[][] } };
  clear: { mock: { calls: unknown[][] } };
};

function expectNoPlanWrites(
  storage: Storage,
  spies: Spies,
  seed: Record<string, string>,
  step: string,
) {
  const touched = [
    ...spies.setItem.mock.calls.map(([key]) => `setItem ${String(key)}`),
    ...spies.removeItem.mock.calls.map(([key]) => `removeItem ${String(key)}`),
    ...spies.clear.mock.calls.map(() => "clear"),
  ].filter((write) => !ALLOWED_KEYS.has(write.split(" ")[1]));
  expect(touched, step).toEqual([]);
  expect(
    storage.getItem(INTERIOR_PLANS_STORAGE_KEY) === seed[INTERIOR_PLANS_STORAGE_KEY],
    step,
  ).toBe(true);
  for (const [key, value] of Object.entries(seed)) {
    if (key === SESSION_HINT_STORAGE_KEY) continue;
    expect(storage.getItem(key) === value, `${step}: ${key}`).toBe(true);
  }
}

const tab = (name: string) =>
  within(screen.getByRole("navigation", { name: "화면" })).getByRole("link", { name });

const summaryRegion = () => screen.getByRole("region", { name: "요약" });
const headlineValue = (label: string) =>
  within(summaryRegion()).getByText(label).nextElementSibling?.textContent;

const hubPlanLines = () =>
  within(screen.getByRole("link", { name: "우리 집 인테리어" }))
    .queryAllByText(/지출 예정/)
    .map((line) => line.textContent);

async function expectHub() {
  expect(await screen.findByRole("heading", { level: 1, name: "홈" })).toBeInTheDocument();
  await waitFor(() => expect(hubPlanLines()).toEqual(HUB_LINES));
}

async function pickPlan(user: ReturnType<typeof userEvent.setup>, name: RegExp, hash: string) {
  await user.click(tab("우리 집"));
  expect(await screen.findByRole("heading", { name: "계획 고르기" })).toBeInTheDocument();
  await user.click(
    within(screen.getByRole("region", { name: "계획 고르기" })).getByRole("link", { name }),
  );
  await waitFor(() => expect(window.location.hash).toBe(hash));
}

/** 홈 → P⁺(R6 시트·표·CSV·인쇄·가리기) → M(M2 시트) → 0원 계획 → 홈. 단계마다 check */
async function walk(
  user: ReturnType<typeof userEvent.setup>,
  api: FakePlanApi,
  check: (step: string) => void,
) {
  await expectHub();
  await waitFor(() => expect(api.queryClient.isFetching()).toBe(0));
  check("홈");

  await pickPlan(user, /^우리 집/, "#/home/plan-simple");
  const r6Open = await screen.findByRole("button", { name: "조명 빛나라조명 거실 매입등 열기" });
  expect(r6Open).toHaveTextContent("미정");
  expect(within(summaryRegion()).getByText("금액 미정 1건 제외")).toBeInTheDocument();
  check("P⁺ 목록");

  await user.click(r6Open);
  const r6Sheet = screen.getByRole("dialog", { name: "줄" });
  expect(within(r6Sheet).getByLabelText("견적")).toHaveValue("");
  check("R6 시트 열기");
  await user.click(within(r6Sheet).getByRole("button", { name: "취소" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  check("R6 시트 닫기");

  await user.click(screen.getByRole("radio", { name: "표" }));
  expect(await screen.findByRole("table", { name: "우리 집 인테리어 계획" })).toBeInTheDocument();
  check("표");
  await user.click(screen.getByRole("button", { name: "CSV 내려받기" }));
  await user.click(screen.getByRole("button", { name: "인쇄·PDF" }));
  expect(download).toHaveBeenCalledTimes(1);
  expect(window.print).toHaveBeenCalledTimes(1);
  check("CSV·인쇄");

  await user.click(screen.getByRole("button", { name: "가리기" }));
  expect(screen.getByRole("button", { name: "가리기" })).toHaveAttribute("aria-pressed", "true");
  check("가리기 켜기");
  await user.click(screen.getByRole("button", { name: "가리기" }));
  expect(screen.getByRole("button", { name: "가리기" })).toHaveAttribute("aria-pressed", "false");
  check("가리기 끄기");
  await user.click(screen.getByRole("radio", { name: "목록" }));
  await waitFor(() => expect(window.location.hash).toBe("#/home/plan-simple"));
  check("목록");

  await pickPlan(user, /^섞인 집/, "#/home/plan-m");
  const m2Open = await screen.findByRole("button", { name: "욕실 하루바스 열기" });
  expect(m2Open).toHaveTextContent("1,234,500원");
  expect(headlineValue("지출 예정")).toBe("10,469,500원");
  check("M 목록");
  await user.click(m2Open);
  const m2Sheet = screen.getByRole("dialog", { name: "줄" });
  expect(within(m2Sheet).getByLabelText("견적")).toHaveValue("");
  expect(
    within(m2Sheet).getByText("원 단위로 저장된 금액이라 이 화면에서는 만원으로 다시 입력하세요"),
  ).toBeInTheDocument();
  check("M2 시트 열기");
  await user.click(within(m2Sheet).getByRole("button", { name: "취소" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  check("M2 시트 닫기");

  await pickPlan(user, /^셀프 집/, "#/home/plan-zero");
  expect(await screen.findByRole("button", { name: "도배 셀프도배 열기" })).toHaveTextContent(
    "0원",
  );
  expect(screen.getByRole("button", { name: "조명 셀프조명 열기" })).toHaveTextContent("0원");
  expect(headlineValue("지출 예정")).toBe("0원");
  expect(headlineValue("남은 예산")).toBe("1원");
  expect(within(summaryRegion()).queryByText(/미정/)).not.toBeInTheDocument();
  check("0원 계획");

  await user.click(tab("홈"));
  await expectHub();
  check("다시 홈");
}

beforeEach(() => {
  download.mockReset();
  vi.spyOn(window, "print").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("AC-0(b) 미정·0원·원 키 계획을 열기만 하면 저장소 쓰기 0회 (세 모드)", () => {
  it.each<[Mode, string]>([
    ["loggedOut", "로그아웃(로컬 원본)"],
    ["solo", "로그인 혼자(서버 GET이 같은 세 계획 — 응답 파서가 미정·0·원 키를 받는다)"],
    ["household", "가구(서버 GET이 같은 세 계획)"],
  ])("%s — %s: 순회 내내 interior-plans 원문 ===, 서버 쓰기 0건", async (mode) => {
    const seed = seedOf(mode);
    const storage = createMemoryStorage(seed);
    const spies = {
      setItem: vi.spyOn(storage, "setItem"),
      removeItem: vi.spyOn(storage, "removeItem"),
      clear: vi.spyOn(storage, "clear"),
    };
    const api = createFakePlanApi({
      userId: USER_ID[mode],
      isInHousehold: mode === "household",
      plans: mode === "loggedOut" ? [] : seedPlans(),
    });
    const user = userEvent.setup();
    window.location.hash = "#/";
    render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });

    await walk(user, api, (step) => expectNoPlanWrites(storage, spies, seed, step));

    expect(api.writes()).toEqual([]);
    expect(screen.queryByText("인테리어 계획을 불러오지 못했습니다")).not.toBeInTheDocument();
    if (mode !== "loggedOut") {
      expect(api.callsTo("GET", "/api/interior-plans").length).toBeGreaterThan(0);
      // 서버 원본은 받은 그대로(정규화로 다시 쓰지 않았다)
      expect(api.server.plans).toStrictEqual(seedPlans());
    }

    // 대조군(스파이가 살아 있다): 0원 계획의 z1 확정을 끄면 로컬 setItem 정확히 1회(로그아웃) 또는 PUT 정확히 1건
    const planSets = () =>
      spies.setItem.mock.calls.filter(([key]) => key === INTERIOR_PLANS_STORAGE_KEY).length;
    await pickPlan(user, /^셀프 집/, "#/home/plan-zero");
    await user.click(await screen.findByRole("checkbox", { name: "도배 셀프도배 확정" }));
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "도배 셀프도배 확정" })).not.toBeChecked(),
    );
    if (mode === "loggedOut") {
      expect(planSets()).toBe(1);
      expect(api.writes()).toEqual([]);
    } else {
      expect(planSets()).toBe(0);
      expect(api.writes().map((call) => `${call.method} ${call.path}`)).toEqual([
        "PUT /api/interior-plans/plan-zero/items/z1",
      ]);
    }
  });
});

describe("AC-0(a) 로그인: 서버가 금액 없는 견적을 PUT·POST 응답으로 돌려줘도 불러오기 실패가 아니다", () => {
  const renderSolo = async () => {
    const storage = createMemoryStorage(seedOf("solo"));
    const api = createFakePlanApi({ userId: "user-a", plans: seedPlans() });
    window.location.hash = "#/home/plan-simple";
    render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });
    await screen.findByRole("button", { name: "조명 빛나라조명 거실 매입등 열기" });
    return { storage, api };
  };

  it("R7(미정) 확정 → PUT 본문·응답에 amount 키 없음, 화면은 '금액 미정 2건 제외', 지출 예정 그대로", async () => {
    const user = userEvent.setup();
    const { storage, api } = await renderSolo();
    const raw = storage.getItem(INTERIOR_PLANS_STORAGE_KEY);

    await user.click(screen.getByRole("checkbox", { name: "도배 한솔도배 확정" }));
    await waitFor(() =>
      expect(within(summaryRegion()).getByText("금액 미정 2건 제외")).toBeInTheDocument(),
    );
    const puts = api.callsTo("PUT", "/api/interior-plans/plan-simple/items/r7");
    expect(puts).toHaveLength(1);
    const { item } = puts[0].body as { item: InteriorItemInput };
    expect(item.quotes).toStrictEqual([{ id: "rq7", vendor: "한솔도배" }]);
    expect(item.confirmedQuoteId).toBe("rq7");
    expect(headlineValue("지출 예정")).toBe("8,000,000원");
    expect(screen.getByRole("checkbox", { name: "도배 한솔도배 확정" })).toBeChecked();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // 다음 조회(서버 원본에 금액 없는 견적 2개)도 정상
    await act(() => api.queryClient.refetchQueries());
    expect(within(summaryRegion()).getByText("금액 미정 2건 제외")).toBeInTheDocument();
    expect(screen.queryByText("인테리어 계획을 불러오지 못했습니다")).not.toBeInTheDocument();
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe(raw);
  });

  it("줄 추가 POST 응답이 금액 없는 견적이어도(2단계 서버 응답) 목록에 '미정'으로 들어가고 실패 안내가 없다", async () => {
    const user = userEvent.setup();
    const { api } = await renderSolo();
    api.server.respond = (call) => {
      if (call.method !== "POST" || call.path !== "/api/interior-plans/plan-simple/items") {
        return undefined;
      }
      const { item: input } = call.body as { item: InteriorItemInput };
      const quotes = (input.quotes ?? []).map(({ id, vendor }) => ({ id, vendor }));
      const item: InteriorItem = {
        ...input,
        quotes,
        id: "srv-tbd",
        createdAt: "2026-10-27T01:00:00.000Z",
        updatedAt: "2026-10-27T01:00:00.000Z",
      };
      const plan = api.server.plans.find((candidate) => candidate.id === "plan-simple")!;
      plan.items.push(item);
      return jsonResponse(201, { item });
    };

    await user.click(screen.getByRole("button", { name: "줄 추가" }));
    const dialog = screen.getByRole("dialog", { name: "줄 추가" });
    await user.type(within(dialog).getByLabelText("구분"), "가구");
    await user.type(within(dialog).getByLabelText("업체"), "한샘");
    await user.type(within(dialog).getByLabelText("견적"), "300");
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    expect(api.callsTo("POST", "/api/interior-plans/plan-simple/items")).toHaveLength(1);
    expect(await screen.findByRole("button", { name: "가구 한샘 열기" })).toHaveTextContent("미정");
    expect(screen.queryByText("인테리어 계획을 불러오지 못했습니다")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("AC-0(b) 탭 간: 다른 탭이 쓴 원문을 storage 이벤트로 받으면 손상이 아니라 정상 갱신", () => {
  it.each([
    ["P⁺(미정)", [makeSimplePlanPPlus()], "조명 빛나라조명 거실 매입등 열기", "미정"],
    [
      "P⁺ + 원 키(M2 견적만 옮겨 넣은 줄)",
      [
        makeSimplePlanPPlus({
          items: [
            ...makeSimplePlanPPlus().items,
            { ...makePlanM().items[1], id: "m2", spaceId: "sp-whole" },
          ],
        }),
      ],
      "욕실 하루바스 열기",
      "1,234,500원",
    ],
  ])("P를 보던 로그아웃 탭 ← %s", async (_name, plans, rowName, amountText) => {
    const storage = createMemoryStorage({
      [INTERIOR_PLANS_STORAGE_KEY]: JSON.stringify({ plans: [makeSimplePlanP()] }),
    });
    const api = createFakePlanApi({ userId: null });
    window.location.hash = "#/home/plan-simple";
    render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });
    expect(
      await screen.findByRole("button", { name: "도배 육문수 실크 전체 열기" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/금액 미정/)).not.toBeInTheDocument();

    const raw = indented(plans);
    // 다른 탭이 쓴 것처럼: 저장소 원문을 바꾸고(이 탭의 쓰기가 아니다) storage 이벤트만 흘린다
    storage.setItem(INTERIOR_PLANS_STORAGE_KEY, raw);
    const setItem = vi.spyOn(storage, "setItem");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: INTERIOR_PLANS_STORAGE_KEY }));
    });

    const row = await screen.findByRole("button", { name: rowName });
    expect(row).toHaveTextContent(amountText);
    expect(within(summaryRegion()).getByText("금액 미정 1건 제외")).toBeInTheDocument();
    expect(
      screen.queryByText("저장된 인테리어 계획이 손상되어 불러올 수 없습니다"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "계획 초기화" })).not.toBeInTheDocument();
    // 읽기만 했다
    expect(setItem).not.toHaveBeenCalled();
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe(raw);
  });
});

describe("AC-0(d) 로그아웃에서 만든 P⁺·M → 로그인 이전 본문 = 원문(정규화 없음), 서버 GET 뒤 화면", () => {
  const IMPORT_PATH = "/api/interior-plans/import";

  async function loginWith(plans: InteriorPlanWithItems[], hash: string) {
    const raw = indented(plans);
    const storage = createMemoryStorage({
      [INTERIOR_PLANS_STORAGE_KEY]: raw,
      [SESSION_HINT_STORAGE_KEY]: "1",
    });
    const api = createFakePlanApi({ userId: "user-a", plans: [] });
    window.location.hash = hash;
    render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });
    await waitFor(() => expect(api.callsTo("POST", IMPORT_PATH)).toHaveLength(plans.length));
    return { api, storage, raw };
  }

  it("P⁺ → /import 200, 본문 = 저장된 P⁺, 서버 GET 뒤 7줄 · 지출 예정 8,000,000원 · 미정 1건", async () => {
    const { api, storage, raw } = await loginWith([makeSimplePlanPPlus()], "#/home");
    expect(api.callsTo("POST", IMPORT_PATH).map((call) => call.body)).toStrictEqual([
      { plan: makeSimplePlanPPlus() },
    ]);
    expect(api.server.plans).toStrictEqual([makeSimplePlanPPlus()]);
    expect(
      await screen.findByRole("checkbox", { name: "조명 빛나라조명 거실 매입등 확정" }),
    ).toBeChecked();
    const calls = api.server.calls.map((call) => `${call.method} ${call.path}`);
    expect(calls.slice(calls.indexOf(`POST ${IMPORT_PATH}`) + 1)).toContain(
      "GET /api/interior-plans",
    );
    expect(screen.getAllByRole("checkbox")).toHaveLength(7);
    expect(headlineValue("지출 예정")).toBe("8,000,000원");
    expect(headlineValue("남은 예산")).toBe("2,000,000원");
    expect(within(summaryRegion()).getByText("금액 미정 1건 제외")).toBeInTheDocument();
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY) === raw).toBe(true);
  });

  it("M(원 키·옛 키 섞임)·0원 계획 → 본문 = 원문(amount를 amountWon으로 바꾸지 않음), 홈 허브 같은 숫자", async () => {
    const plans = [makePlanM(), zeroPlan()];
    const { api, storage, raw } = await loginWith(plans, "#/");
    expect(api.callsTo("POST", IMPORT_PATH).map((call) => call.body)).toStrictEqual(
      plans.map((plan) => ({ plan })),
    );
    await waitFor(() =>
      expect(hubPlanLines()).toEqual([
        "섞인 집 · 지출 예정 10,469,500원 · 미정 1건",
        "셀프 집 · 지출 예정 0원",
      ]),
    );
    expect(api.server.plans).toStrictEqual(plans);
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY) === raw).toBe(true);
  });
});
