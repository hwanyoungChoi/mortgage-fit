/** `YYYY-MM-DD` → "11/5"(할 일·지급 줄의 짧은 날짜). 연도는 보이지 않는다(계약 뒤 몇 달 안의 일정이다). */
export function formatMonthDay(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}
