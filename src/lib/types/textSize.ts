/**
 * 글자 크기 설정(이 기기). 값은 저장값이라 이름이 화면 라벨과 다르다: default = 원래 크기("크게"),
 * smaller = 기본 크기("기본"), smallest = 가장 작은 크기("더 작게"). 값과 라벨은 `constants/textSize.ts`
 */
export type TextSize = "default" | "smaller" | "smallest";

export type TextSizeStore = {
  getSnapshot: () => TextSize;
  subscribe: (listener: () => void) => () => void;
  set: (size: TextSize) => void;
};
