// 꾹 눌러 끌어 옮기기(ADR-026, ADR-036 조건 6)의 공용 값. 저장 목록 간단히 보기와 우리 집 줄 목록이 같이 쓴다.
// 알림 문장은 목록마다 구조가 달라("전체 n개 중" / "묶음 안 n개 중") 각 목록에 둔다.
import type { KeyboardCodes } from "@dnd-kit/core";

/** 꾹 누르기: 약 250ms를 5px 안에서 누르고 있어야 든다. 그 전에 움직이면 스크롤이고, 짧게 떼면 줄의 원래 동작(펼치기·열기)이다. */
export const LONG_PRESS = { delay: 250, tolerance: 5 };

/** 엔터는 줄의 원래 동작으로 남겨 두고 스페이스로 든다. 든 뒤에는 스페이스·엔터로 놓고 Esc로 취소한다. */
export const KEYBOARD_CODES: KeyboardCodes = {
  start: ["Space"],
  cancel: ["Escape"],
  end: ["Space", "Enter"],
};

export const SCREEN_READER_INSTRUCTIONS = {
  draggable:
    "순서를 바꾸려면 스페이스 키로 들고 위아래 화살표로 옮긴 뒤 스페이스나 엔터 키로 놓습니다. Esc 키로 취소합니다. 터치 화면에서는 길게 눌러 끕니다.",
};
