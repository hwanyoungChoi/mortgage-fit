// @vitest-environment jsdom
// 스펙 platform-home "하단 탭"·ADR-031 조건 7: 탭 아이콘은 aria-hidden="true"를 명시 prop으로 준다(라이브러리 기본값에 기대지 않음).
// lucide는 자식·접근성 prop이 없으면 aria-hidden을 스스로 붙여 DOM만 보면 구분되지 않으므로,
// 아이콘을 받은 prop만 그대로 그리는 svg로 바꿔 TabNav가 넘긴 값을 본다.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import TabNav from "./TabNav";

import type { SVGProps } from "react";

vi.mock("lucide-react/icons/house", () => ({
  default: (props: SVGProps<SVGSVGElement>) => <svg data-icon="house" {...props} />,
}));
vi.mock("lucide-react/icons/calculator", () => ({
  default: (props: SVGProps<SVGSVGElement>) => <svg data-icon="calculator" {...props} />,
}));
vi.mock("lucide-react/icons/bookmark", () => ({
  default: (props: SVGProps<SVGSVGElement>) => <svg data-icon="bookmark" {...props} />,
}));
vi.mock("lucide-react/icons/paint-roller", () => ({
  default: (props: SVGProps<SVGSVGElement>) => <svg data-icon="paint-roller" {...props} />,
}));

describe("탭 아이콘 (AC-2, D4)", () => {
  it("아이콘 4개(House·Calculator·Bookmark·PaintRoller)가 탭 순서대로, 각각 aria-hidden=true 명시 prop", () => {
    render(<TabNav current="hub" onNavigate={vi.fn()} />);
    const nav = screen.getByRole("navigation", { name: "화면" });
    const icons = within(nav)
      .getAllByRole("link")
      .map((link) => link.querySelector("svg"));
    expect(icons.map((icon) => icon?.getAttribute("data-icon"))).toEqual([
      "house",
      "calculator",
      "bookmark",
      "paint-roller",
    ]);
    expect(icons.map((icon) => icon?.getAttribute("aria-hidden"))).toEqual([
      "true",
      "true",
      "true",
      "true",
    ]);
  });
});
