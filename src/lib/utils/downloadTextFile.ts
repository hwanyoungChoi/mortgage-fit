/** 바로 해제하면 Safari 계열에서 다운로드가 끊길 수 있어 늦게 해제한다(FileSaver.js와 같은 40초) */
const REVOKE_DELAY_MS = 40_000;

/**
 * 문자열을 CSV 파일(`text/csv;charset=utf-8`)로 내려받는다. 받은 문자열을 그대로 쓴다(BOM은 `toCsv`가 붙인다).
 * 임시 `<a download>`를 body에 붙여 누르고 바로 떼며, 객체 URL은 늦게 해제한다. 서버 요청·저장소 쓰기는 없다.
 */
export function downloadTextFile(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
