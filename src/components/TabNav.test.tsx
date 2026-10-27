// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PATHS } from "@/lib/constants/paths";

import TabNav from "./TabNav";

import type { TabName } from "@/lib/types/route";

function renderTabNav(current: TabName | null) {
  const onNavigate = vi.fn();
  render(<TabNav current={current} onNavigate={onNavigate} onTextSizeOpen={vi.fn()} />);
  const nav = screen.getByRole("navigation", { name: "화면" });
  return { nav, onNavigate };
}

describe("상단 탭 (AC-1)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("탭 순서는 홈 | 계산 | 매물 | 우리 집, 주소는 #/ · #/calculator · #/listings · #/home", () => {
    const { nav } = renderTabNav("calculator");
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["홈", "#/"],
      ["계산", "#/calculator"],
      ["매물", "#/listings"],
      ["우리 집", "#/home"],
    ]);
  });

  it.each<[TabName, string]>([
    ["calculator", "계산"],
    ["listings", "매물"],
    ["home", "우리 집"],
  ])("현재 %s면 '%s'만 aria-current=page", (current, label) => {
    const { nav } = renderTabNav(current);
    const currentLinks = within(nav)
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(currentLinks.map((link) => link.textContent)).toEqual([label]);
  });

  it("공유받기·초대 화면(null)은 어느 탭도 선택 표시하지 않는다", () => {
    const { nav } = renderTabNav(null);
    expect(
      within(nav)
        .getAllByRole("link")
        .some((link) => link.hasAttribute("aria-current")),
    ).toBe(false);
  });

  it("[우리 집]을 누르면 onNavigate 뒤 #/home으로 replace(이력이 쌓이지 않음)", async () => {
    const user = userEvent.setup();
    window.location.hash = PATHS.calculator;
    const historyLength = window.history.length;
    const { nav, onNavigate } = renderTabNav("calculator");
    await user.click(within(nav).getByRole("link", { name: "우리 집" }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe("#/home");
    expect(window.history.length).toBe(historyLength);
    window.location.hash = "#/";
  });
});
