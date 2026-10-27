// @vitest-environment jsdom
// 스펙 platform-home AC-2(하단 탭)·AC-4([가가]는 전역 머리 줄에 하나). 머리 줄 → main → 탭 줄 DOM 순서.
// 링크 이름은 정확한 문자열로만 질의한다(탭 "계산"과 홈 카드 "대출 계산"이 정규식에서 충돌).
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { LISTINGS_STORAGE_KEY } from "@/lib/utils/listingStorage";
import { TEXT_SIZE_STORAGE_KEY } from "@/lib/utils/textSizeStorage";
import { createFakePlanApi, jsonResponse } from "@/test/fakePlanApi";
import { makePlanP, toStoredPlans } from "@/test/interiorPlanFixture";
import { makeListing } from "@/test/listingFixture";
import { createMemoryStorage } from "@/test/memoryStorage";

const VALID_TOKEN = "AbCdEfGhIjKlMnOpQrStUv";

const SEED = {
  // 계획 이름을 h1 "우리 집"(계획 0개·고르기)과 다르게 두어 계획 화면에 도착했는지 가른다
  [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans([makePlanP({ name: "P 계획" })]),
  [LISTINGS_STORAGE_KEY]: JSON.stringify([makeListing({ name: "래미안 84" })]),
};

function sharedResponse() {
  const { id: _id, createdAt: _c, updatedAt: _u, ...listing } = makeListing({ name: "자이 59" });
  void [_id, _c, _u];
  return jsonResponse(200, {
    kind: "listing",
    listings: [listing],
    createdAt: "2026-10-20T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
  });
}

function renderApp(hash: string) {
  const storage = createMemoryStorage(SEED);
  const setItem = vi.spyOn(storage, "setItem");
  const api = createFakePlanApi({ userId: null });
  api.server.respond = (call) =>
    call.path === `/api/shares/${VALID_TOKEN}` ? sharedResponse() : undefined;
  window.location.hash = hash;
  const historyLength = window.history.length;
  render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });
  return { storage, setItem, historyLength };
}

const tabNav = () => screen.getByRole("navigation", { name: "화면" });
const appHeader = () => screen.getByRole("banner", { name: "모기지핏" });
const main = () => screen.getByRole("main");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("하단 탭 (AC-2)", () => {
  it("탭 줄 링크는 순서대로 홈·계산·매물·우리 집이고 버튼은 없다", async () => {
    renderApp("#/");
    expect(await screen.findByRole("heading", { level: 1, name: "홈" })).toBeInTheDocument();
    const links = within(tabNav()).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["홈", "#/"],
      ["계산", "#/calculator"],
      ["매물", "#/listings"],
      ["우리 집", "#/home"],
    ]);
    // 링크 이름(접근 이름)도 라벨 글자 그대로
    for (const name of ["홈", "계산", "매물", "우리 집"]) {
      expect(within(tabNav()).getByRole("link", { name })).toBeInTheDocument();
    }
    expect(within(tabNav()).queryAllByRole("button")).toEqual([]);
  });

  it.each([
    ["#/", "홈"],
    ["#/calculator", "계산"],
    ["#/listings", "매물"],
    ["#/listings?login=failed", "매물"],
    ["#/home", "우리 집"],
    ["#/home/plan-p?view=table", "우리 집"],
    [`#/share/${VALID_TOKEN}`, null],
    [`#/invite/${VALID_TOKEN}`, null],
  ])("%s에서 aria-current=page는 %s 하나뿐", async (hash, label) => {
    renderApp(hash);
    await screen.findByRole("heading", { level: 1 });
    const current = within(tabNav())
      .getAllByRole("link")
      .filter((link) => link.hasAttribute("aria-current"));
    expect(current.map((link) => [link.textContent, link.getAttribute("aria-current")])).toEqual(
      label === null ? [] : [[label, "page"]],
    );
  });

  it("계산 화면에서 [우리 집]을 누르면 #/home으로 replace(이력 불변)", async () => {
    const user = userEvent.setup();
    const { historyLength } = renderApp("#/calculator");
    expect(await screen.findByLabelText("매매가")).toBeInTheDocument();
    await user.click(within(tabNav()).getByRole("link", { name: "우리 집" }));
    await waitFor(() => expect(window.location.hash).toBe("#/home"));
    expect(window.history.length).toBe(historyLength);
    expect(within(tabNav()).getByRole("link", { name: "우리 집" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("탭 줄 아이콘(svg)은 정확히 4개이고 모두 aria-hidden=true", async () => {
    renderApp("#/");
    await screen.findByRole("heading", { level: 1, name: "홈" });
    const icons = Array.from(tabNav().querySelectorAll("svg"));
    expect(icons).toHaveLength(4);
    expect(icons.map((icon) => icon.getAttribute("aria-hidden"))).toEqual([
      "true",
      "true",
      "true",
      "true",
    ]);
  });

  it("DOM 순서는 머리 줄 → main → 탭 줄", async () => {
    renderApp("#/");
    await screen.findByRole("heading", { level: 1, name: "홈" });
    expect(appHeader().compareDocumentPosition(main()) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(main().compareDocumentPosition(tabNav()) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    // 탭 줄은 main 바깥이다
    expect(main().contains(tabNav())).toBe(false);
  });
});

describe("[가가]는 모든 화면에서 전역 머리 줄에 하나 (AC-4)", () => {
  // hasInnerHeader: main 안에 화면 자체 <header>가 있어 도구가 banner를 2개 이상 세는 화면
  it.each([
    ["홈", "#/", { level: 1, name: "홈" }, false],
    ["계산", "#/calculator", { level: 1 }, false],
    ["저장 목록", "#/listings", { level: 1, name: "저장 목록" }, true],
    ["우리 집(계획)", "#/home/plan-p", { level: 1, name: "P 계획" }, true],
    ["공유받기", `#/share/${VALID_TOKEN}`, { level: 1, name: "공유받은 매물 1개" }, true],
    ["초대", `#/invite/${VALID_TOKEN}`, { level: 1, name: "함께 쓰는 목록 초대" }, true],
  ])("%s 화면", async (_label, hash, heading, hasInnerHeader) => {
    const user = userEvent.setup();
    const { setItem } = renderApp(hash);
    expect(await screen.findByRole("heading", heading)).toBeInTheDocument();
    if (hash.startsWith("#/share/")) {
      expect(await screen.findByRole("button", { name: "내 목록에 추가 (1개)" })).toBeVisible();
    }

    // 이름 있는 전역 머리 줄은 하나이고 main 바깥
    expect(screen.getAllByRole("banner", { name: "모기지핏" })).toHaveLength(1);
    expect(appHeader().closest("main")).toBeNull();
    expect(main().contains(appHeader())).toBe(false);
    if (hasInnerHeader) {
      // 화면 안 <header>는 그대로 남아 있다(div로 바꾸지 않음). 그래서 이름 없는 banner 질의는 여러 개다
      expect(main().querySelector("header")).not.toBeNull();
      expect(screen.getAllByRole("banner").length).toBeGreaterThan(1);
    }

    // [가가]는 화면 전체에 하나, 머리 줄 안, 탭 줄 밖
    const buttons = screen.getAllByRole("button", { name: "글자 크기" });
    expect(buttons).toHaveLength(1);
    const [button] = buttons;
    expect(appHeader()).toContainElement(button);
    expect(tabNav()).not.toContainElement(button);
    expect(button).toHaveAttribute("aria-haspopup", "dialog");

    await user.click(button);
    const dialog = screen.getByRole("dialog", { name: "글자 크기" });
    expect(appHeader().closest("[inert]")).not.toBeNull();
    expect(main().closest("[inert]")).not.toBeNull();
    expect(tabNav().closest("[inert]")).not.toBeNull();
    expect(dialog.closest("[inert]")).toBeNull();

    // 고르면 text-size 키에만 쓴다
    setItem.mockClear();
    await user.click(within(dialog).getByRole("button", { name: "작게" }));
    expect(setItem.mock.calls).toEqual([[TEXT_SIZE_STORAGE_KEY, "small"]]);

    await user.click(within(dialog).getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog", { name: "글자 크기" })).not.toBeInTheDocument();
    expect(button).toHaveFocus();
    expect(appHeader().closest("[inert]")).toBeNull();
  });
});
