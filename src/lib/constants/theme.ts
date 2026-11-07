import type { Theme } from "@/lib/types/theme";

/** 고르기 시트에 보이는 순서 */
export const THEMES: Theme[] = ["system", "light", "dark"];

/** 키 없음·모르는 값일 때: 기기 설정을 따른다 */
export const DEFAULT_THEME: Theme = "system";

export const THEME_LABELS: Record<Theme, string> = {
  system: "기기 설정",
  light: "라이트",
  dark: "다크",
};
