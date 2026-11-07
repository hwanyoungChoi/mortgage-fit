// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PATHS } from "@/lib/constants/paths";

import TabNav from "./TabNav";

import type { TabName } from "@/lib/types/route";

function renderTabNav(current: TabName | null) {
  const onNavigate = vi.fn();
  const { rerender } = render(<TabNav current={current} onNavigate={onNavigate} />);
  const nav = screen.getByRole("navigation", { name: "화면" });
  return { nav, onNavigate, rerender };
}

describe("하단 탭 (AC-1)", () => {
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
      ["예산", "#/home"],
    ]);
  });

  it.each<[TabName, string]>([
    ["hub", "홈"],
    ["calculator", "계산"],
    ["listings", "매물"],
    ["home", "예산"],
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

  it("[예산]을 누르면 onNavigate 뒤 #/home으로 replace(이력이 쌓이지 않음)", async () => {
    const user = userEvent.setup();
    window.location.hash = PATHS.calculator;
    const historyLength = window.history.length;
    const { nav, onNavigate } = renderTabNav("calculator");
    await user.click(within(nav).getByRole("link", { name: "예산" }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe("#/home");
    expect(window.history.length).toBe(historyLength);
    window.location.hash = "#/";
  });

  it("선택 표시는 하나만 두고 현재 탭 자리로 옮긴다(같은 요소라 미끄러져 간다), null이면 없다", () => {
    const { nav, rerender } = renderTabNav("listings");
    const tabs = within(nav).getByRole("list");
    const indicator = nav.querySelector('[aria-hidden="true"]');
    expect(tabs.style.getPropertyValue("--tab-index")).toBe("2");
    expect(tabs.style.getPropertyValue("--tab-count")).toBe("4");

    rerender(<TabNav current="home" onNavigate={vi.fn()} />);
    expect(tabs.style.getPropertyValue("--tab-index")).toBe("3");
    expect(nav.querySelector('[aria-hidden="true"]')).toBe(indicator);

    rerender(<TabNav current={null} onNavigate={vi.fn()} />);
    expect(nav.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});
