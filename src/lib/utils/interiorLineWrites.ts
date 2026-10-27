import type { InteriorLineValues } from "@/lib/types/interiorLineDraft";
import type { InteriorItem, InteriorItemInput, InteriorQuote } from "@/lib/types/interiorPlan";

// 줄 쓰기 → 저장 입력(스펙 interior-simple "쓰기 규칙", ADR-032 조건 2). 저장 형식은 그대로다.
// 모든 입력은 열어 둔 항목에서 id·시각만 뺀 값에 바꾼 칸만 덮는다. PUT은 항목 전체 교체라 숨은 값(공간·예산·지급·상태·
// 날짜·연락처)을 빠뜨리면 지워진다. 비운 선택 칸(세부내용·비고·확정)은 빈 문자열이 아니라 키 삭제다.
// 줄은 항목 전체와 그 견적 id(빈 줄이면 null)로 가리킨다.

/** 열어 둔 항목 그대로(id·시각만 뺀다) */
function inputOf(item: InteriorItem): InteriorItemInput {
  const { id, createdAt, updatedAt, ...input } = item;
  void [id, createdAt, updatedAt];
  return input;
}

function withMemo(input: InteriorItemInput, memo: string | undefined): InteriorItemInput {
  const { memo: previous, ...rest } = input;
  void previous;
  return memo === undefined ? rest : { ...rest, memo };
}

function withConfirmedQuoteId(
  input: InteriorItemInput,
  confirmedQuoteId: string | undefined,
): InteriorItemInput {
  const { confirmedQuoteId: previous, ...rest } = input;
  void previous;
  return confirmedQuoteId === undefined ? rest : { ...rest, confirmedQuoteId };
}

/**
 * 견적의 업체·금액·세부내용만 바꾼다. id·연락처는 그대로 둔다(A11).
 * 금액은 원 `amountWon`으로만 쓰고 옛 만원 키 `amount`는 지운다(한 견적에 두 키가 함께 있을 수 없다, ADR-034 조건 4).
 * 금액을 비우면(미정) 두 키 모두 없다(ADR-033). `{...rest}`가 옛 키를 펼치지 않게 두 금액 키를 구조 분해로 뺀다.
 * 0원은 금액이다(셀프 시공). 같은 항목의 형제 견적은 이 함수를 거치지 않아 원래 금액 키 그대로다.
 */
function editedQuote(
  quote: Omit<InteriorQuote, "vendor">,
  values: InteriorLineValues,
): InteriorQuote {
  const { memo: previousMemo, amount: previousManwon, amountWon: previousWon, ...rest } = quote;
  void [previousMemo, previousManwon, previousWon];
  return {
    ...rest,
    vendor: values.vendor,
    ...(values.amountWon !== undefined && { amountWon: values.amountWon }),
    ...(values.detail !== undefined && { memo: values.detail }),
  };
}

/**
 * 이 견적을 켜거나 끈 뒤의 확정 견적 id. 항목당 확정은 하나라, 켜면 같은 항목의 다른 견적 확정이 이 견적으로 옮겨 간다(D2 a).
 * 끄면 이 견적이 확정이었을 때만 풀리고 다른 견적의 확정은 그대로다.
 */
function confirmedQuoteIdAfter(
  item: InteriorItem,
  quoteId: string,
  isConfirmed: boolean,
): string | undefined {
  if (isConfirmed) return quoteId;
  return item.confirmedQuoteId === quoteId ? undefined : item.confirmedQuoteId;
}

/** 줄 추가: 견적 1개 항목. 공간은 계획의 첫 공간, 상태는 "계획"이다(A4) */
export function addLineInput(
  spaceId: string,
  quoteId: string,
  values: InteriorLineValues,
): InteriorItemInput {
  return {
    spaceId,
    trade: values.trade,
    quotes: [editedQuote({ id: quoteId }, values)],
    ...(values.isConfirmed && { confirmedQuoteId: quoteId }),
    status: "planned",
    ...(values.note !== undefined && { memo: values.note }),
  };
}

/**
 * 줄 수정(시트 저장). 구분·비고는 항목 칸이라 같은 항목의 형제 줄과 공유한다(견적 n≥2 옛 항목, D2 a).
 * 빈 줄(`quoteId` null)은 업체·견적을 채워 견적 1개 항목이 된다. 새 견적 id는 그때만 `createId`로 만든다.
 */
export function editLineInput(
  item: InteriorItem,
  quoteId: string | null,
  values: InteriorLineValues,
  createId: () => string,
): InteriorItemInput {
  const base = withMemo({ ...inputOf(item), trade: values.trade }, values.note);
  if (quoteId === null) {
    const newQuoteId = createId();
    return withConfirmedQuoteId(
      { ...base, quotes: [editedQuote({ id: newQuoteId }, values)] },
      values.isConfirmed ? newQuoteId : undefined,
    );
  }
  const quotes = (item.quotes ?? []).map((quote) =>
    quote.id === quoteId ? editedQuote(quote, values) : quote,
  );
  return withConfirmedQuoteId(
    { ...base, quotes },
    confirmedQuoteIdAfter(item, quoteId, values.isConfirmed),
  );
}

/** 확정 토글(목록 체크). `confirmedQuoteId`만 바꾸고 상태는 그대로다(A4) */
export function toggleLineConfirmInput(
  item: InteriorItem,
  quoteId: string,
  isConfirmed: boolean,
): InteriorItemInput {
  return withConfirmedQuoteId(inputOf(item), confirmedQuoteIdAfter(item, quoteId, isConfirmed));
}

/** 이 견적을 켜면 같은 항목의 다른 견적 확정이 풀린다(목록 위 안내) */
export function releasesOtherConfirm(
  item: InteriorItem,
  quoteId: string,
  isConfirmed: boolean,
): boolean {
  return isConfirmed && item.confirmedQuoteId !== undefined && item.confirmedQuoteId !== quoteId;
}

/**
 * 줄 삭제. 견적 0~1개 항목은 항목째 지운다(숨은 지급·날짜도 같이 지워진다, A6 — `paymentCount`로 확인 문구에 알린다).
 * 견적 n≥2 항목은 그 견적만 빼고, 확정 견적이었으면 확정 키도 뺀다(검증이 `quotes` 밖의 확정 id를 거부한다).
 */
export type InteriorLineRemoval =
  { kind: "removeItem"; paymentCount: number } | { kind: "updateItem"; input: InteriorItemInput };

export function removeLineWrite(item: InteriorItem, quoteId: string | null): InteriorLineRemoval {
  const quotes = item.quotes ?? [];
  if (quoteId === null || quotes.length <= 1) {
    return { kind: "removeItem", paymentCount: (item.payments ?? []).length };
  }
  return {
    kind: "updateItem",
    input: withConfirmedQuoteId(
      { ...inputOf(item), quotes: quotes.filter((quote) => quote.id !== quoteId) },
      confirmedQuoteIdAfter(item, quoteId, false),
    ),
  };
}
