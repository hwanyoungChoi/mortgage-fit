// jsdom에서 dnd-kit 키보드 끌기를 돌리기 위한 도우미(스펙 interior-vendor-tbd-line-order AC-4 스파이크).
// jsdom은 레이아웃이 없어 모든 `getBoundingClientRect`가 0이라 키보드 센서(`sortableKeyboardCoordinates`)가 다음 자리를 못 찾고
// 제자리 놓기도 다른 줄 위로 판정된다. 테스트 동안만 줄마다 세로 자리를 준다.
// jsdom에는 `Element.animate`가 없지만, 이 스텁에서는 `DragOverlay`가 든 줄과 같은 자리라 dnd-kit이 놓기 애니메이션을
// 건너뛰어(첫·끝 keyframe이 같음) 폴리필 없이 돈다. 뜬 줄이 다른 자리에 그려지는 화면이면 `animate` 오류가 날 수 있다.

/** 줄 하나의 높이(px). 줄은 문서 순서대로 위에서 아래로 놓인다 */
export const STUB_ROW_HEIGHT = 60;
const STUB_ROW_WIDTH = 360;
const STUB_LIST_TOP = 100;

const rectAt = (top: number): DOMRect =>
  DOMRect.fromRect({ x: 0, y: top, width: STUB_ROW_WIDTH, height: STUB_ROW_HEIGHT });

/** 문서의 `li`를 순서대로 세로로 쌓은 자리. 묶음(ul)이 여럿이어도 한 줄로 이어진다 */
function rowRectOf(li: Element): DOMRect {
  const index = Array.from(document.querySelectorAll("li")).indexOf(li as HTMLLIElement);
  return rectAt(STUB_LIST_TOP + index * STUB_ROW_HEIGHT);
}

/**
 * `li` 안의 요소는 그 `li`의 자리, `li` 밖의 요소(끄는 동안 뜬 `DragOverlay` 등)는 지금 든 줄(`aria-pressed="true"`)의 자리,
 * 든 줄이 없으면 0을 돌려주게 바꾼다. 되돌리는 함수를 돌려준다.
 */
export function stubRowRects(): () => void {
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const li = this.closest("li");
    if (li !== null) return rowRectOf(li);
    const lifted = document.querySelector('[aria-pressed="true"]')?.closest("li");
    return lifted === null || lifted === undefined ? DOMRect.fromRect() : rowRectOf(lifted);
  };
  return () => {
    HTMLElement.prototype.getBoundingClientRect = originalRect;
  };
}
