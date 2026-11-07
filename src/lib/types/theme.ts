/** 화면 모드(이 기기). 머리 줄 토글로 바꾼다 */
export type Theme = "light" | "dark";

export type ThemeStore = {
  getSnapshot: () => Theme;
  subscribe: (listener: () => void) => () => void;
  set: (theme: Theme) => void;
};
