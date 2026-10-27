/** 기기 로컬 날짜 `YYYY-MM-DD`. 표 머리·내려받는 파일 이름의 기준일이다 */
export function toLocalDateString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
