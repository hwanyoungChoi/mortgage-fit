/** 엑셀이 UTF-8로 읽게 파일 맨 앞에 붙이는 BOM(U+FEFF) */
const BOM = "﻿";
const LINE_END = "\r\n";

/** 이 문자로 시작하는 셀은 스프레드시트가 수식으로 읽을 수 있다(OWASP CSV Injection, 전각 포함) */
const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r", "\n", "＝", "＋", "－", "＠"];

/** RFC 4180에서 큰따옴표로 감싸야 하는 문자 */
const QUOTE_NEEDED = /[",\r\n]/;

/** 수식 주입 접두 `'`를 먼저 붙이고 이스케이프를 나중에 한다(순서가 바뀌면 `=1,2`가 `'"=1,2"`가 된다) */
function toCsvField(cell: string): string {
  const guarded = FORMULA_PREFIXES.some((prefix) => cell.startsWith(prefix)) ? `'${cell}` : cell;
  return QUOTE_NEEDED.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded;
}

/**
 * 문자열 행 → CSV(RFC 4180). 맨 앞 BOM 하나, 모든 줄 끝(마지막 줄 포함) CRLF. 빈 배열이면 BOM만.
 * 숫자 열도 `String(n)`으로 받으며, 양의 정수 문자열은 주입 접두 조건에 걸리지 않는다.
 */
export function toCsv(rows: string[][]): string {
  return BOM + rows.map((row) => row.map(toCsvField).join(",") + LINE_END).join("");
}
