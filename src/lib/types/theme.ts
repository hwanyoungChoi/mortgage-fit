/** 화면 모드(이 기기). system = 기기 설정을 따름. 값과 라벨은 `constants/theme.ts` */
export type Theme = "system" | "light" | "dark";

export type ThemeStore = {
  getSnapshot: () => Theme;
  subscribe: (listener: () => void) => () => void;
  set: (theme: Theme) => void;
};
