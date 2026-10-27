// @vitest-environment jsdom
// 스펙 platform-home AC-1: 시작 해시마다 도착 화면·최종 해시·이력 불변·선택된 탭(기존 링크 통합 표),
// 화면 안 링크의 주소, 홈 카드(push) ↔ 탭(replace)의 이력 차이.
// 옛 MortgageCalculator.test #1(AC-8c)의 "알 수 없는 해시 → 정규 경로로 replace, 이력 불변"은 이 표의 홈 행들이 맡는다.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { LISTINGS_STORAGE_KEY } from "@/lib/utils/listingStorage";
import { createFakePlanApi, jsonResponse, type PlanApiCall } from "@/test/fakePlanApi";
import { makePlanP, toStoredPlans } from "@/test/interiorPlanFixture";
import { makeListing } from "@/test/listingFixture";
import { createMemoryStorage } from "@/test/memoryStorage";

/** 모양이 맞는 토큰(22자). 공유받기·초대 본 화면까지 가려면 이 모양이어야 한다 */
const VALID_TOKEN = "AbCdEfGhIjKlMnOpQrStUv";

type Screen = "hub" | "calculator" | "listings" | "share" | "invite" | "home";

/** 도착 화면을 h1로 가른다. 계산 h1은 부제(span)를 품으므로 글자로 본다 */
async function expectScreen(name: Screen) {
  const expected: Record<Screen, RegExp> = {
    hub: /^홈$/,
    calculator: /^대출 계산/,
    listings: /^저장 목록$/,
    share: /^만료되었거나 끊긴 링크입니다$/,
    invite: /^만료되었거나 이미 쓴 초대입니다$/,
    home: /^우리 집$/,
  };
  await waitFor(() =>
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(expected[name]),
  );
}

const tabNav = () => screen.getByRole("navigation", { name: "화면" });

/** 탭 줄에서 aria-current="page"인 링크 이름들 */
const currentTabs = () =>
  within(tabNav())
    .getAllByRole("link")
    .filter((link) => link.getAttribute("aria-current") === "page")
    .map((link) => link.textContent);

function renderApp(
  hash: string,
  seed: Record<string, string> = {},
  respond?: (call: PlanApiCall) => Response | undefined,
) {
  const storage = createMemoryStorage(seed);
  const api = createFakePlanApi({ userId: null });
  api.server.respond = respond;
  window.location.hash = hash;
  const historyLength = window.history.length;
  render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });
  return { storage, api, historyLength };
}

/** 우리 집 행이 계획 화면까지 가도록 계획 P(id plan-p)와 매물 listing-r을 둔다 */
const HOME_SEED = {
  [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans([makePlanP()]),
  [LISTINGS_STORAGE_KEY]: JSON.stringify([makeListing({ id: "listing-r", name: "래미안 84" })]),
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("기존 링크 통합 표 (AC-1)", () => {
  type Row = [start: string, screen: Screen, finalHash: string, current: string | null];
  const rows: Row[] = [
    ["", "hub", "#/", "홈"],
    ["#", "hub", "#/", "홈"],
    ["#/", "hub", "#/", "홈"],
    // 알 수 없는 해시 → 홈, 정규 경로 #/로 replace(옛 AC-8c의 이력 불변 포함)
    ["#/x", "hub", "#/", "홈"],
    ["#/listing/abc", "hub", "#/", "홈"],
    ["#listings", "hub", "#/", "홈"],
    ["#/calc", "hub", "#/", "홈"],
    ["#/calculatorx", "hub", "#/", "홈"],
    ["#/calculator/x", "hub", "#/", "홈"],
    ["#/Calculator", "hub", "#/", "홈"],
    ["#/?login=failed", "hub", "#/", "홈"],
    ["#/?a=1", "hub", "#/", "홈"],
    ["#/calculator", "calculator", "#/calculator", "계산"],
    ["#/calculator?a=1", "calculator", "#/calculator", "계산"],
    ["#/listings", "listings", "#/listings", "매물"],
    ["#/listings?sort=recent", "listings", "#/listings", "매물"],
    ["#/share/AbC_12", "share", "#/share/AbC_12", null],
    ["#/invite/XyZ", "invite", "#/invite/XyZ", null],
    ["#/home", "home", "#/home", "우리 집"],
    ["#/home/plan-p?view=table", "home", "#/home/plan-p?view=table", "우리 집"],
    [
      "#/home/plan-p?listing=listing-r&view=table",
      "home",
      "#/home/plan-p?listing=listing-r&view=table",
      "우리 집",
    ],
    // 형식 틀린 플랜 id(스펙 표의 "ZZ"는 올바른 id라 "a.b"로 본다)
    ["#/home/a.b", "home", "#/home", "우리 집"],
  ];

  it.each(rows)(
    "%j → %s 화면, 최종 %s, 이력 불변, 선택 탭 %s",
    async (start, name, finalHash, current) => {
      const { historyLength } = renderApp(start, HOME_SEED);

      await expectScreen(name);
      await waitFor(() => expect(window.location.hash).toBe(finalHash));
      expect(window.history.length).toBe(historyLength);
      expect(currentTabs()).toEqual(current === null ? [] : [current]);
      // 공유받기·초대도 탭 줄 4개 링크는 보인다
      expect(within(tabNav()).getAllByRole("link")).toHaveLength(4);
    },
  );

  it.each([
    ["failed", "로그인하지 못했습니다. 다시 시도해 주세요"],
    ["cancelled", "로그인을 취소했습니다"],
    ["notConfigured", "로그인을 준비 중입니다"],
  ])(
    "#/?login=%s → 홈 + 안내 한 번, 안내 뒤 #/(replace), 선택 탭 홈 (로그인 복귀는 홈, hub-account AC-2)",
    async (login, message) => {
      const { historyLength } = renderApp(`#/?login=${login}`);

      await expectScreen("hub");
      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.getAllByText(message)).toHaveLength(1);
      await waitFor(() => expect(window.location.hash).toBe("#/"));
      expect(window.history.length).toBe(historyLength);
      expect(currentTabs()).toEqual(["홈"]);
    },
  );
});

describe("화면 안 링크의 주소 (AC-1)", () => {
  it('매물 카드 [수정]·[복사]는 "#/calculator"', async () => {
    const user = userEvent.setup();
    renderApp("#/listings", {
      [LISTINGS_STORAGE_KEY]: JSON.stringify([makeListing({ name: "래미안 84" })]),
    });
    const list = await screen.findByRole("list", { name: "저장한 매물 1개" });
    await user.click(within(list).getByRole("button", { name: /^래미안 84/, expanded: false }));
    expect(within(list).getByRole("link", { name: "래미안 84 수정" })).toHaveAttribute(
      "href",
      "#/calculator",
    );
    expect(within(list).getByRole("link", { name: "래미안 84 복사" })).toHaveAttribute(
      "href",
      "#/calculator",
    );
  });

  it('저장 목록 빈 상태 "계산하러 가기"는 "#/calculator"', async () => {
    renderApp("#/listings");
    expect(await screen.findByRole("link", { name: "계산하러 가기" })).toHaveAttribute(
      "href",
      "#/calculator",
    );
  });

  it.each([
    ["#/share/AbC_12", "만료되었거나 끊긴 링크입니다"],
    ["#/invite/XyZ", "만료되었거나 이미 쓴 초대입니다"],
  ])('%s의 "계산기로 가기"는 "#/calculator"', async (hash, title) => {
    renderApp(hash);
    expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "계산기로 가기" })).toHaveAttribute(
      "href",
      "#/calculator",
    );
  });

  it('공유받기 본 화면의 "취소"는 홈 "#/" (U8)', async () => {
    const { id: _id, createdAt: _c, updatedAt: _u, ...listing } = makeListing({ name: "자이 59" });
    void [_id, _c, _u];
    renderApp(`#/share/${VALID_TOKEN}`, {}, (call) =>
      call.path === `/api/shares/${VALID_TOKEN}`
        ? jsonResponse(200, {
            kind: "listing",
            listings: [listing],
            createdAt: "2026-10-20T00:00:00.000Z",
            expiresAt: "2099-01-01T00:00:00.000Z",
          })
        : undefined,
    );
    expect(await screen.findByRole("button", { name: "내 목록에 추가 (1개)" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "취소" })).toHaveAttribute("href", "#/");
  });

  it('초대 본 화면의 "취소"는 홈 "#/" (U8)', async () => {
    renderApp(`#/invite/${VALID_TOKEN}`);
    expect(await screen.findByRole("heading", { name: "함께 쓰는 목록 초대" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "취소" })).toHaveAttribute("href", "#/");
  });
});

describe("홈 카드는 push, 탭은 replace (AC-1)", () => {
  it("홈 카드 [대출 계산] → 계산(이력 +1) → 뒤로 가기 → 홈 #/, 탭으로 오가면 이력 불변", async () => {
    const user = userEvent.setup();
    const { historyLength } = renderApp("#/");
    await expectScreen("hub");

    await user.click(screen.getByRole("link", { name: "대출 계산" }));
    expect(await screen.findByLabelText("매매가")).toBeInTheDocument();
    expect(window.location.hash).toBe("#/calculator");
    expect(window.history.length).toBe(historyLength + 1);

    window.history.back();
    await waitFor(() => expect(window.location.hash).toBe("#/"));
    await expectScreen("hub");
    expect(currentTabs()).toEqual(["홈"]);

    const historyBeforeTabs = window.history.length;
    for (const [label, hash] of [
      ["계산", "#/calculator"],
      ["매물", "#/listings"],
      ["우리 집", "#/home"],
      ["홈", "#/"],
    ]) {
      await user.click(within(tabNav()).getByRole("link", { name: label }));
      await waitFor(() => expect(window.location.hash).toBe(hash));
      expect(currentTabs()).toEqual([label]);
    }
    expect(window.history.length).toBe(historyBeforeTabs);
  });
});
