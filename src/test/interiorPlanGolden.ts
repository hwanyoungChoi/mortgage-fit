// 스펙 interior-vendor-tbd-line-order AC-0(a)(qa 태스크 1-0, ADR-036 조건 7): 변경 전(f5ad2b0) 결과의 리터럴 JSON 골든.
// 골든 파일(`interiorPlanGolden.f5ad2b0.json`·`interiorPlanScreenGolden.f5ad2b0.json`)은 f5ad2b0 코드로 한 번 만들어 커밋했고,
// 이후 코드로 다시 만들지 않는다(변경 후 코드로 기대값을 만들면 순환이 된다). 바뀌면 그 자체가 데이터 회귀다.
// JSON에는 undefined가 없어 "키 없음"과 "값이 undefined인 키"가 같아지므로, 값이 undefined인 자리를 `UNDEFINED_MARK`로
// 바꿔 적는다(단사 변환이라 `toStrictEqual`의 구분이 그대로 남는다). 예: `vendor: undefined`가 생기면 골든과 달라진다.
import { buildInteriorPlanTable } from "@/lib/utils/buildInteriorPlanTable";
import { buildInteriorPlanRows } from "@/lib/utils/interiorPlanRows";

import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";

/** 값이 undefined인 키·배열 원소를 적는 표식 */
export const UNDEFINED_MARK = { $undefined: true } as const;

/** 값 → 골든 JSON 모양(undefined는 `UNDEFINED_MARK`, 그 밖은 JSON 그대로) */
export function toGoldenJson(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, inner: unknown) => (inner === undefined ? UNDEFINED_MARK : inner)),
  );
}

/**
 * 목록 묶음·줄 순서와 줄마다 관찰되는 값. `item`·`quote` 객체 전체는 파싱 골든이 따로 지키므로 id만 남긴다.
 * (줄 타입에 필드가 더해져도 이 값이 같으면 순서·금액·확정은 그대로다)
 */
export function projectRows(plan: InteriorPlanWithItems) {
  const { groups, plannedTotalWon, tbdCount } = buildInteriorPlanRows(plan);
  return {
    groups: groups.map((group) => ({
      trade: group.trade,
      rows: group.rows.map((row) => ({
        key: row.key,
        itemId: row.item.id,
        quoteId: row.quote === null ? null : row.quote.id,
        quoteWon: row.quoteWon,
        isConfirmed: row.isConfirmed,
        budgetNoteWon: row.budgetNoteWon,
      })),
    })),
    plannedTotalWon,
    tbdCount,
  };
}

/**
 * 표 모델에서 업체 칸을 뺀 값. 업체 칸은 ADR-036 조건 8로 판별 유니온(이름 / 미정 / 견적 없음)이 되도록 설계가 바뀌므로
 * 모델 모양으로 고정하지 않고, 글자(CSV 행·화면 표)로 고정한다.
 */
export function projectTableWithoutVendor(plan: InteriorPlanWithItems) {
  const table = buildInteriorPlanTable(buildInteriorPlanRows(plan));
  return {
    groups: table.groups.map((group) => ({
      trade: group.trade,
      rows: group.rows.map((row) => ({
        detail: row.detail,
        quoteWon: row.quoteWon,
        confirmedWon: row.confirmedWon,
        note: row.note,
      })),
    })),
    confirmedTotal: table.confirmedTotal,
    totalNote: table.totalNote,
  };
}
