// @vitest-environment jsdom
// 시트 바깥 누르기·손잡이 끌어 내리기는 [닫기]와 같은 onClose로 간다(고친 내용이 있으면 같은 확인).
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Sheet from "./Sheet";

const SHEET_HEIGHT = 400;

/** 고친 내용이 있는 시트처럼 닫기 전에 확인을 묻는다 */
function DirtySheet() {
  const [isOpen, setIsOpen] = useState(true);
  if (!isOpen) return null;
  return (
    <Sheet title="항목 수정" onClose={() => window.confirm("버릴까요?") && setIsOpen(false)}>
      <input aria-label="이름" />
    </Sheet>
  );
}

const dialog = () => screen.getByRole("dialog", { name: "항목 수정" });
const backdrop = () => dialog().parentElement as HTMLElement;
const grabArea = () =>
  screen.getByRole("heading", { name: "항목 수정" }).closest("div")!.parentElement as HTMLElement;

function drag(target: HTMLElement, distance: number) {
  fireEvent.pointerDown(target, { pointerId: 1, isPrimary: true, button: 0, clientY: 100 });
  fireEvent.pointerMove(target, { pointerId: 1, clientY: 100 + distance });
  fireEvent.pointerUp(target, { pointerId: 1, clientY: 100 + distance });
}

beforeEach(() => {
  Element.prototype.setPointerCapture = vi.fn();
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(SHEET_HEIGHT);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Sheet 바깥 누르기", () => {
  it("바깥에서 눌렀다 떼면 확인을 거쳐 닫히고, 취소하면 남는다", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<DirtySheet />);
    fireEvent.pointerDown(backdrop());
    fireEvent.click(backdrop());
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeInTheDocument();

    confirm.mockReturnValue(true);
    fireEvent.pointerDown(backdrop());
    fireEvent.click(backdrop());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("시트 안을 누르거나, 안에서 눌러 바깥에서 뗀 것은 닫지 않는다", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DirtySheet />);
    fireEvent.pointerDown(screen.getByLabelText("이름"));
    fireEvent.click(screen.getByLabelText("이름"));
    fireEvent.pointerDown(screen.getByLabelText("이름"));
    fireEvent.click(backdrop());
    expect(confirm).not.toHaveBeenCalled();
    expect(dialog()).toBeInTheDocument();
  });
});

describe("Sheet 손잡이 끌어 내리기", () => {
  it("높이의 25%를 넘게 내리면 확인을 거쳐 닫힌다", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DirtySheet />);
    drag(grabArea(), SHEET_HEIGHT * 0.5);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("확인을 취소하면 시트가 남고 제자리로 돌아간다", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 0;
    });
    render(<DirtySheet />);
    drag(grabArea(), SHEET_HEIGHT * 0.5);
    expect(dialog()).toBeInTheDocument();
    expect(dialog().style.transform).toBe("");
  });

  it("[닫기]에서 시작한 끌기는 시트를 움직이지 않는다", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DirtySheet />);
    drag(screen.getByRole("button", { name: "닫기" }), SHEET_HEIGHT * 0.5);
    expect(confirm).not.toHaveBeenCalled();
    expect(dialog().style.transform).toBe("");
  });
});
