import type { TextSize } from "@/lib/types/textSize";

/** 고르기 시트에 보이는 순서(큰 것부터) */
export const TEXT_SIZES: TextSize[] = ["default", "smaller", "smallest"];

/** 키 없음·모르는 값일 때의 크기. 원래 크기(`default`)가 아니라 한 단계 작은 크기가 기본이다 */
export const DEFAULT_TEXT_SIZE: TextSize = "smaller";

export const TEXT_SIZE_LABELS: Record<TextSize, string> = {
  default: "크게",
  smaller: "기본",
  smallest: "더 작게",
};
