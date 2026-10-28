// 우리 집 화면 골든(AC-0(a), `interiorPlanScreenGolden.f5ad2b0.json`)이 고정하는 화면 값을 읽는 도우미.
// 사용자가 보고 듣는 값(묶음 이름·순서, 줄의 접근 가능한 이름·글자, 확정 체크, 요약, 표 칸, CSV 원문)만 읽고
// DOM 구조(클래스·자식 순서)에는 기대지 않는다. 끌기가 붙어도 이 값들은 `lineOrder`가 없으면 변경 전과 같아야 한다.
import { screen, within } from "@testing-library/react";

/** 목록 보기: 줄마다 (묶음, 여는 버튼 이름·글자, 확정 체크 이름·상태). 묶음은 줄을 감싼 `section[aria-label]`이다 */
export function captureListGolden() {
  const openButtons = screen.getAllByRole("button", { name: / 열기$/ });
  const checkboxes = screen.getAllByRole("checkbox", { name: / 확정$/ });
  if (openButtons.length !== checkboxes.length) {
    throw new Error(`여는 버튼 ${openButtons.length}개 ≠ 확정 체크 ${checkboxes.length}개`);
  }
  const rows = openButtons.map((button, index) => {
    const checkbox = checkboxes[index] as HTMLInputElement;
    return {
      group: button.closest("section[aria-label]")?.getAttribute("aria-label") ?? null,
      openName: button.getAttribute("aria-label"),
      openText: button.textContent,
      confirmName: checkbox.getAttribute("aria-label"),
      isChecked: checkbox.checked,
      isDisabled: checkbox.disabled,
    };
  });
  const groupAddButtons = screen
    .getAllByRole("button", { name: /에 줄 추가$/ })
    .map((button) => button.textContent);
  return {
    rows,
    groupAddButtons,
    summary: screen.getByRole("region", { name: "요약" }).textContent,
  };
}

/** 표 보기: 표 머리 기준일 줄, 표의 줄마다 칸 글자(병합된 구분 칸은 첫 줄에만 있다) */
export function captureTableGolden(title: string) {
  const table = screen.getByRole("table", { name: title });
  return {
    headingLine: screen.getByText(/ 기준 · /).textContent,
    cells: within(table)
      .getAllByRole("row")
      .map((row) => Array.from(row.querySelectorAll("th, td"), (cell) => cell.textContent ?? "")),
  };
}
