// @vitest-environment jsdom
// 저장 목록 간단히 보기의 끌기 특성 테스트(스펙 interior-vendor-tbd-line-order AC-4 jsdom 스파이크, ADR-036 조건 6·7).
// 꾹 누르기 값·키보드 키·안내 문장을 우리 집 줄 끌기와 공용 export로 옮기는 리팩터링(태스크 1)이 저장 목록 끌기를
// 바꾸지 않는지 지킨다. 이전에는 저장 목록 끌기에 자동 테스트가 없었다(브라우저 터치 에뮬레이션으로만 확인).
// jsdom은 레이아웃이 없어 `getBoundingClientRect`가 전부 0이므로 `stubRowRects`로 줄마다 세로 자리를 준다.
// 키보드(스페이스·화살표·엔터·Esc, 알림·안내 문장)와 마우스·터치 꾹 누르기(250ms·5px 경계)를 본다.
// 놓은 뒤 click으로 펼쳐지지 않는지, 끄는 중 화면 모양·자동 스크롤·실기기 터치는 여기서 보지 않는다(브라우저 확인).
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LOAN_REGULATIONS } from "@/lib/constants/loanRegulations";
import { stubRowRects } from "@/test/dndKitJsdom";
import { makeListing } from "@/test/listingFixture";

import CompactListingList from "./CompactListingList";

import type { Listing } from "@/lib/types/listing";

const LISTINGS: Listing[] = [
  makeListing({ id: "a", name: "래미안" }),
  makeListing({ id: "b", name: "자이" }),
  makeListing({ id: "c", name: "힐스테이트" }),
];

const ROLE_DESCRIPTION = "순서를 바꿀 수 있는 버튼";
const INSTRUCTIONS =
  "순서를 바꾸려면 스페이스 키로 들고 위아래 화살표로 옮긴 뒤 스페이스나 엔터 키로 놓습니다. Esc 키로 취소합니다. 터치 화면에서는 길게 눌러 끕니다.";

function renderList({
  canReorder = true,
  listings = LISTINGS,
}: { canReorder?: boolean; listings?: Listing[] } = {}) {
  const onReorder = vi.fn<(ids: string[]) => void>();
  const result = render(
    <CompactListingList
      listings={listings}
      label="저장한 매물"
      canReorder={canReorder}
      onReorder={onReorder}
      regulations={LOAN_REGULATIONS}
      budget={null}
      onOpen={() => {}}
      onCopy={() => {}}
      onDelete={() => {}}
      onShare={() => {}}
      onSaveMemo={async () => ({ ok: true })}
      onSaveName={async () => ({ ok: true })}
      onStatusOpen={() => {}}
      statusFailure={null}
      isPrivacyMode={false}
      revealedId={null}
      onRevealChange={() => {}}
    />,
  );
  return { ...result, onReorder };
}

/** 줄 버튼(접힌 줄 = 끌기 손잡이). 이름은 매물 이름으로 시작한다 */
const rowButton = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });

/** 키보드 센서는 든 다음 틱에 keydown 리스너를 붙인다(`setTimeout`). 키 사이에 한 틱씩 흘린다 */
async function press(element: Element, code: string) {
  await act(async () => {
    fireEvent.keyDown(element, { code, key: code === "Space" ? " " : code });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** 보조기기 알림 영역(dnd-kit live region)의 지금 글자 */
const announcement = () =>
  Array.from(document.querySelectorAll('[aria-live="assertive"]'), (node) => node.textContent).join(
    "",
  );

/**
 * 알림 영역에 나온 글자를 차례로 모은다. 들기 직후 같은 act 안에서 "제자리 위(over = 자신)" 알림이 이어 나와
 * 지금 글자만 보면 들기 알림이 덮여 보이지 않으므로, 바뀌기 전 글자(`oldValue`·지워진 노드)를 변경 기록에서 읽는다
 */
function recordAnnouncements() {
  const history: string[] = [];
  const push = (text: string | null | undefined) => {
    if (text !== null && text !== undefined && text !== "" && history.at(-1) !== text) {
      history.push(text);
    }
  };
  const isInLiveRegion = (node: Node) =>
    (node instanceof Element ? node : node.parentElement)?.closest('[aria-live="assertive"]') !==
    null;
  const collect = (records: MutationRecord[]) => {
    for (const record of records) {
      if (!isInLiveRegion(record.target)) continue;
      if (record.type === "characterData") push(record.oldValue);
      else push(Array.from(record.removedNodes, (node) => node.textContent).join(""));
    }
  };
  const observer = new MutationObserver(collect);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    characterDataOldValue: true,
  });
  return {
    history,
    /** 남은 기록과 지금 글자까지 모으고 관찰을 멈춘다 */
    stop: () => {
      collect(observer.takeRecords());
      observer.disconnect();
      push(announcement());
    },
  };
}

let restoreRects: () => void;

beforeEach(() => {
  restoreRects = stubRowRects();
});

afterEach(() => {
  restoreRects();
});

describe("저장 목록 키보드 끌기(dnd-kit, jsdom 특성)", () => {
  it("스페이스 → 아래 화살표 → 스페이스: onReorder 1회, 첫 줄을 둘째 자리로", async () => {
    const { onReorder } = renderList();
    const announcements = recordAnnouncements();
    const button = rowButton("래미안");
    button.focus();
    await press(button, "Space");
    await press(button, "ArrowDown");
    expect(announcement()).toBe("'래미안' 매물을 2번째 자리로 옮겼습니다.");
    await press(button, "Space");
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(["b", "a", "c"]);
    announcements.stop();
    expect(announcements.history).toStrictEqual([
      "'래미안' 매물을 들었습니다. 전체 3개 중 1번째입니다.",
      "'래미안' 매물을 1번째 자리로 옮겼습니다.",
      "'래미안' 매물을 2번째 자리로 옮겼습니다.",
      "'래미안' 매물을 2번째 자리에 놓았습니다.",
    ]);
  });

  it("아래 화살표 두 번이면 맨 끝, 엔터로도 놓는다", async () => {
    const { onReorder } = renderList();
    const button = rowButton("래미안");
    button.focus();
    await press(button, "Space");
    await press(button, "ArrowDown");
    await press(button, "ArrowDown");
    await press(button, "Enter");
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(["b", "c", "a"]);
  });

  it("위 화살표: 마지막 줄을 한 칸 위로", async () => {
    const { onReorder } = renderList();
    const button = rowButton("힐스테이트");
    button.focus();
    await press(button, "Space");
    await press(button, "ArrowUp");
    await press(button, "Space");
    expect(onReorder).toHaveBeenCalledWith(["a", "c", "b"]);
  });

  it("들었다가 Esc: onReorder 0회, 취소 알림", async () => {
    const { onReorder } = renderList();
    const button = rowButton("자이");
    button.focus();
    await press(button, "Space");
    await press(button, "ArrowDown");
    await press(button, "Escape");
    expect(onReorder).not.toHaveBeenCalled();
    expect(announcement()).toBe("옮기기를 취소했습니다. '자이' 매물은 2번째 자리 그대로입니다.");
  });

  it("들었다가 제자리에 놓기: onReorder 0회", async () => {
    const { onReorder } = renderList();
    const button = rowButton("자이");
    button.focus();
    await press(button, "Space");
    await press(button, "Space");
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("들 수 있는 줄: 역할 이름과 안내 문장(aria-describedby)", () => {
    renderList();
    const button = rowButton("래미안");
    expect(button).toHaveAttribute("aria-roledescription", ROLE_DESCRIPTION);
    const describedBy = button.getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy ?? "")?.textContent).toBe(INSTRUCTIONS);
  });

  it("엔터는 들지 않고 펼친다(펼친 줄은 끌기 속성이 없다)", async () => {
    const { onReorder } = renderList();
    const button = rowButton("래미안");
    button.focus();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(button).not.toHaveAttribute("aria-roledescription");
    await press(button, "Space");
    await press(button, "ArrowDown");
    await press(button, "Space");
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("canReorder false: 끌기 속성이 없고 스페이스로 들지 않는다", async () => {
    const { onReorder } = renderList({ canReorder: false });
    const button = rowButton("래미안");
    expect(button).not.toHaveAttribute("aria-roledescription");
    button.focus();
    await press(button, "Space");
    await press(button, "ArrowDown");
    await press(button, "Space");
    expect(onReorder).not.toHaveBeenCalled();
    expect(announcement()).toBe("");
  });

  it("든 동안 목록이 바뀌어도(재조회) 든 순간의 목록으로 놓는다", async () => {
    const { onReorder, rerender } = renderList();
    const button = rowButton("래미안");
    button.focus();
    await press(button, "Space");
    const props = (listings: Listing[]) => (
      <CompactListingList
        listings={listings}
        label="저장한 매물"
        canReorder
        onReorder={onReorder}
        regulations={LOAN_REGULATIONS}
        budget={null}
        onOpen={() => {}}
        onCopy={() => {}}
        onDelete={() => {}}
        onShare={() => {}}
        onSaveMemo={async () => ({ ok: true })}
        onSaveName={async () => ({ ok: true })}
        onStatusOpen={() => {}}
        statusFailure={null}
        isPrivacyMode={false}
        revealedId={null}
        onRevealChange={() => {}}
      />
    );
    rerender(props([LISTINGS[2], LISTINGS[1], LISTINGS[0]]));
    expect(
      screen
        .getAllByRole("button", { name: /^(래미안|자이|힐스테이트)/ })
        .map((b) => b.textContent),
    ).toStrictEqual(["래미안", "자이", "힐스테이트"].map((name) => expect.stringContaining(name)));
    await press(button, "ArrowDown");
    await press(button, "Space");
    expect(onReorder).toHaveBeenCalledWith(["b", "a", "c"]);
  });
});

// 꾹 누르기(LONG_PRESS = 250ms, 5px). 포인터 좌표는 `stubRowRects`의 줄 자리(첫 줄 100~160, 둘째 줄 160~220)다.
// jsdom의 fireEvent는 mouseup 뒤 click을 만들지 않으므로 "놓은 뒤 펼쳐지지 않음"은 여기서 판정하지 않는다(브라우저 확인).
describe("저장 목록 꾹 누르기(마우스·터치, jsdom 특성)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const advance = async (ms: number) => {
    await act(async () => {
      vi.advanceTimersByTime(ms);
    });
  };
  const isLifted = (button: HTMLElement) => button.getAttribute("aria-pressed") === "true";
  const mouseAt = (clientY: number) => ({ clientX: 10, clientY, button: 0 });
  const touchAt = (clientY: number) => {
    const touch = { clientX: 10, clientY };
    return { touches: [touch], changedTouches: [touch] };
  };

  it("마우스: 249ms에는 들지 않고 250ms에 든다", async () => {
    renderList();
    const button = rowButton("래미안");
    fireEvent.mouseDown(button, mouseAt(130));
    await advance(249);
    expect(isLifted(button)).toBe(false);
    await advance(1);
    expect(isLifted(button)).toBe(true);
  });

  it("마우스: 250ms 전에 5px 넘게(6px) 움직이면 들지 않고, 5px 안(4px)이면 든다", async () => {
    renderList();
    const first = rowButton("래미안");
    fireEvent.mouseDown(first, mouseAt(130));
    fireEvent.mouseMove(document, mouseAt(136));
    await advance(300);
    expect(isLifted(first)).toBe(false);
    fireEvent.mouseUp(document, mouseAt(136));
    await advance(100);

    const second = rowButton("자이");
    fireEvent.mouseDown(second, mouseAt(190));
    fireEvent.mouseMove(document, mouseAt(194));
    await advance(300);
    expect(isLifted(second)).toBe(true);
  });

  it("마우스: 꾹 눌러 든 뒤 둘째 줄 위에서 떼면 onReorder 1회", async () => {
    const { onReorder } = renderList();
    const button = rowButton("래미안");
    fireEvent.mouseDown(button, mouseAt(130));
    await advance(300);
    fireEvent.mouseMove(document, mouseAt(190));
    fireEvent.mouseMove(document, mouseAt(195));
    await advance(50);
    fireEvent.mouseUp(document, mouseAt(195));
    await advance(100);
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(["b", "a", "c"]);
  });

  it("마우스: 250ms 전에 떼면 들지 않고 onReorder 0회", async () => {
    const { onReorder } = renderList();
    const button = rowButton("래미안");
    fireEvent.mouseDown(button, mouseAt(130));
    await advance(200);
    fireEvent.mouseUp(document, mouseAt(130));
    await advance(300);
    expect(isLifted(button)).toBe(false);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("터치: 꾹 눌러 든 뒤 둘째 줄 위에서 떼면 onReorder 1회", async () => {
    const { onReorder } = renderList();
    const button = rowButton("래미안");
    fireEvent.touchStart(button, touchAt(130));
    await advance(249);
    expect(isLifted(button)).toBe(false);
    await advance(51);
    expect(isLifted(button)).toBe(true);
    fireEvent.touchMove(button, touchAt(190));
    fireEvent.touchMove(button, touchAt(195));
    await advance(50);
    fireEvent.touchEnd(button, touchAt(195));
    await advance(100);
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(["b", "a", "c"]);
  });
});
