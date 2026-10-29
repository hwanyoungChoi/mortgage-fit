import type { InteriorItem } from "@/lib/types/interiorPlan";

// 항목 일정(`startDate`·`endDate`, YYYY-MM-DD)의 목록 글자. 연도는 빼고 "월/일"만 쓴다(일정 전체는 줄 시트에서 본다).

/** "2026-11-03" → "11/3" */
function monthDayOf(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

/** "11/3"(하루·같은 날) · "11/3~11/7" · "~11/7"(끝나는 날만). 일정이 없으면 null */
export function interiorScheduleTextOf({
  startDate,
  endDate,
}: Pick<InteriorItem, "startDate" | "endDate">): string | null {
  if (startDate === undefined) return endDate === undefined ? null : `~${monthDayOf(endDate)}`;
  if (endDate === undefined || endDate === startDate) return monthDayOf(startDate);
  return `${monthDayOf(startDate)}~${monthDayOf(endDate)}`;
}
