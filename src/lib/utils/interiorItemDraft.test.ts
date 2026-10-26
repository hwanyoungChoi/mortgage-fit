import { describe, expect, it } from "vitest";

import { INTERIOR_ITEM_STATUSES } from "@/lib/constants/interiorPlan";
import { pSash, pWallpaper } from "@/test/interiorPlanFixture";

import {
  cancelQuoteConfirm,
  confirmQuote,
  createInteriorItemDraft,
  createPaymentDraft,
  createQuoteDraft,
  interiorItemDraftErrors,
  paymentField,
  quoteField,
  removeQuote,
  statusAfterConfirm,
  summarizePaymentDraft,
  toInteriorItemDraft,
  validateInteriorItemDraft,
} from "./interiorItemDraft";
import { validateInteriorItemFields } from "./validateInteriorPlan";

import type {
  InteriorItemDraft,
  InteriorPaymentDraft,
  InteriorQuoteDraft,
} from "@/lib/types/interiorItemDraft";
import type { InteriorItemStatus } from "@/lib/types/interiorPlan";

const SPACE_IDS = ["sp-all", "sp-bath1"];

const INTEGER_MESSAGE = "정수(만원 단위)로 입력하세요";
const NOT_POSITIVE_MESSAGE = "0보다 큰 금액을 입력하세요";
const TOO_LARGE_MESSAGE = "최대 9자리(999,999,999만원)까지 입력할 수 있습니다";
const END_BEFORE_START = "끝 날짜가 시작 날짜보다 앞입니다";
const DATE_FORMAT = "날짜를 YYYY-MM-DD 형식으로 입력하세요";

/** 저장 가능한 최소 입력: 공간 + 공종 */
const draftOf = (patch: Partial<InteriorItemDraft> = {}): InteriorItemDraft => ({
  ...createInteriorItemDraft("sp-bath1"),
  trade: "타일",
  ...patch,
});

const quoteOf = (patch: Partial<InteriorQuoteDraft> = {}): InteriorQuoteDraft => ({
  ...createQuoteDraft("q1"),
  vendor: "가나타일",
  amount: "650",
  ...patch,
});

const paymentOf = (patch: Partial<InteriorPaymentDraft> = {}): InteriorPaymentDraft => ({
  ...createPaymentDraft("p1", "계약금"),
  amount: "100",
  ...patch,
});

const errorsOf = (draft: InteriorItemDraft) => interiorItemDraftErrors(draft, SPACE_IDS);
const messageOf = (draft: InteriorItemDraft, field: string) =>
  errorsOf(draft).find((error) => error.field === field)?.message ?? null;

describe("상태 전이: 확정하면 계획·견적 중만 '확정' (A3, U4)", () => {
  const expected: Record<InteriorItemStatus, InteriorItemStatus> = {
    planned: "confirmed",
    quoting: "confirmed",
    confirmed: "confirmed",
    inProgress: "inProgress",
    done: "done",
  };

  it.each(INTERIOR_ITEM_STATUSES)("%s → statusAfterConfirm", (status) => {
    expect(statusAfterConfirm(status)).toBe(expected[status]);
  });

  it.each(INTERIOR_ITEM_STATUSES)(
    "%s에서 confirmQuote: 그 견적을 확정하고 상태는 표대로",
    (status) => {
      const draft = draftOf({ status, quotes: [quoteOf({ id: "q1" }), quoteOf({ id: "q2" })] });
      const next = confirmQuote(draft, "q2");
      expect(next.confirmedQuoteId).toBe("q2");
      expect(next.status).toBe(expected[status]);
      // 원래 값은 바꾸지 않는다
      expect(draft.confirmedQuoteId).toBeNull();
    },
  );

  it("다른 견적으로 확정을 옮겨도 하나만 확정이다", () => {
    const draft = confirmQuote(
      draftOf({ quotes: [quoteOf({ id: "q1" }), quoteOf({ id: "q2" })] }),
      "q1",
    );
    expect(confirmQuote(draft, "q2").confirmedQuoteId).toBe("q2");
  });

  it("확정 취소는 confirmedQuoteId만 null로, 상태는 되돌리지 않는다", () => {
    const confirmed = confirmQuote(draftOf({ status: "quoting", quotes: [quoteOf()] }), "q1");
    const cancelled = cancelQuoteConfirm(confirmed);
    expect(cancelled.confirmedQuoteId).toBeNull();
    expect(cancelled.status).toBe("confirmed");
    expect(cancelled.quotes).toEqual(confirmed.quotes);
  });
});

describe("확정한 견적 삭제 시 확정 해제 (AC-4, ADR-029 조건 11)", () => {
  const quotes = [quoteOf({ id: "q1" }), quoteOf({ id: "q2", vendor: "다른업체" })];

  it("확정한 견적을 지우면 confirmedQuoteId가 null이 된다", () => {
    const next = removeQuote(
      draftOf({ quotes, confirmedQuoteId: "q1", status: "confirmed" }),
      "q1",
    );
    expect(next.quotes.map((quote) => quote.id)).toEqual(["q2"]);
    expect(next.confirmedQuoteId).toBeNull();
  });

  it("확정 안 한 견적을 지우면 확정은 그대로", () => {
    const next = removeQuote(draftOf({ quotes, confirmedQuoteId: "q1" }), "q2");
    expect(next.quotes.map((quote) => quote.id)).toEqual(["q1"]);
    expect(next.confirmedQuoteId).toBe("q1");
  });

  it("확정을 푼 뒤 저장하면 저장 값에 confirmedQuoteId 키가 없다", () => {
    const next = removeQuote(draftOf({ quotes, confirmedQuoteId: "q1" }), "q1");
    const result = validateInteriorItemDraft(next, SPACE_IDS);
    expect(result.ok).toBe(true);
    if (result.ok) expect("confirmedQuoteId" in result.input).toBe(false);
  });

  it("P ③ 샷시: 확정 견적 E를 지우면 확정 금액이 없어진다(D만 남음)", () => {
    const draft = toInteriorItemDraft(pSash());
    const next = removeQuote(draft, "q-e");
    expect(next.confirmedQuoteId).toBeNull();
    expect(summarizePaymentDraft(next).confirmedAmount).toBeNull();
  });
});

describe("금액 칸 (AC-5, D5: 만원 정수 1~999,999,999, 반올림 안 함)", () => {
  it.each([
    ["123.5", INTEGER_MESSAGE],
    ["0.5", INTEGER_MESSAGE],
    ["600.0", INTEGER_MESSAGE],
    ["0", NOT_POSITIVE_MESSAGE],
    ["000", NOT_POSITIVE_MESSAGE],
    ["1000000000", TOO_LARGE_MESSAGE],
    ["1,000,000,000", TOO_LARGE_MESSAGE],
    ["-1", "숫자만 입력하세요"],
    ["1e3", "숫자만 입력하세요"],
    ["육백", "숫자만 입력하세요"],
  ])("예산 %j → %j", (budget, message) => {
    expect(messageOf(draftOf({ budget }), "budget")).toBe(message);
  });

  it.each(["1", "600", "999999999", "999,999,999", " 600 "])("예산 %j는 통과", (budget) => {
    expect(messageOf(draftOf({ budget }), "budget")).toBeNull();
  });

  it("예산은 선택: 빈칸·공백만 있으면 오류 없고 저장 값에 budget 키가 없다", () => {
    for (const budget of ["", "   "]) {
      expect(messageOf(draftOf({ budget }), "budget")).toBeNull();
      const result = validateInteriorItemDraft(draftOf({ budget }), SPACE_IDS);
      expect(result.ok && "budget" in result.input).toBe(false);
    }
  });

  it("소수 예산은 반올림해 저장하지 않고 막는다", () => {
    const result = validateInteriorItemDraft(draftOf({ budget: "123.5" }), SPACE_IDS);
    expect(result).toEqual({ ok: false, errors: [{ field: "budget", message: INTEGER_MESSAGE }] });
  });

  it("견적 금액은 필수: 빈칸이면 '금액을 입력하세요', 0·소수·10억은 같은 금액 규칙", () => {
    const field = quoteField("q1", "amount");
    expect(messageOf(draftOf({ quotes: [quoteOf({ amount: "" })] }), field)).toBe(
      "금액을 입력하세요",
    );
    expect(messageOf(draftOf({ quotes: [quoteOf({ amount: "0" })] }), field)).toBe(
      NOT_POSITIVE_MESSAGE,
    );
    expect(messageOf(draftOf({ quotes: [quoteOf({ amount: "123.5" })] }), field)).toBe(
      INTEGER_MESSAGE,
    );
    expect(messageOf(draftOf({ quotes: [quoteOf({ amount: "1000000000" })] }), field)).toBe(
      TOO_LARGE_MESSAGE,
    );
    expect(messageOf(draftOf({ quotes: [quoteOf({ amount: "999999999" })] }), field)).toBeNull();
    expect(messageOf(draftOf({ quotes: [quoteOf({ amount: "1" })] }), field)).toBeNull();
  });

  it("지급 금액도 필수·같은 규칙", () => {
    const field = paymentField("p1", "amount");
    expect(messageOf(draftOf({ payments: [paymentOf({ amount: "" })] }), field)).toBe(
      "금액을 입력하세요",
    );
    expect(messageOf(draftOf({ payments: [paymentOf({ amount: "0" })] }), field)).toBe(
      NOT_POSITIVE_MESSAGE,
    );
    expect(messageOf(draftOf({ payments: [paymentOf({ amount: "250.5" })] }), field)).toBe(
      INTEGER_MESSAGE,
    );
    expect(messageOf(draftOf({ payments: [paymentOf({ amount: "1000000000" })] }), field)).toBe(
      TOO_LARGE_MESSAGE,
    );
  });
});

describe("글자 칸 (AC-5)", () => {
  const thirty = "가".repeat(30);
  const thirtyOne = "가".repeat(31);

  it("공종 30자 통과, 31자 오류", () => {
    expect(messageOf(draftOf({ trade: thirty }), "trade")).toBeNull();
    expect(messageOf(draftOf({ trade: thirtyOne }), "trade")).toBe(
      "30자 이하로 입력하세요(현재 31자)",
    );
  });

  it("공종 길이는 앞뒤 공백을 뗀 코드포인트로 센다(이모지 30개 통과)", () => {
    expect(messageOf(draftOf({ trade: `  ${thirty}  ` }), "trade")).toBeNull();
    expect(messageOf(draftOf({ trade: "🛁".repeat(30) }), "trade")).toBeNull();
    expect(messageOf(draftOf({ trade: "🛁".repeat(31) }), "trade")).not.toBeNull();
  });

  it("공종 빈칸·공백만 → '공종을 입력하세요'", () => {
    expect(messageOf(draftOf({ trade: "" }), "trade")).toBe("공종을 입력하세요");
    expect(messageOf(draftOf({ trade: "   " }), "trade")).toBe("공종을 입력하세요");
  });

  it("공종 30자를 저장하면 자르지 않고 trim한 그대로 들어가고 공용 검증도 통과한다", () => {
    const result = validateInteriorItemDraft(draftOf({ trade: ` ${thirty} ` }), SPACE_IDS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.trade).toBe(thirty);
    expect(validateInteriorItemFields(result.input)).not.toBeNull();
  });

  it("업체 이름 빈칸·공백만 → '업체 이름을 입력하세요', 30자 통과·31자 오류", () => {
    const field = quoteField("q1", "vendor");
    expect(messageOf(draftOf({ quotes: [quoteOf({ vendor: "" })] }), field)).toBe(
      "업체 이름을 입력하세요",
    );
    expect(messageOf(draftOf({ quotes: [quoteOf({ vendor: "  " })] }), field)).toBe(
      "업체 이름을 입력하세요",
    );
    expect(messageOf(draftOf({ quotes: [quoteOf({ vendor: thirty })] }), field)).toBeNull();
    expect(messageOf(draftOf({ quotes: [quoteOf({ vendor: thirtyOne })] }), field)).toBe(
      "30자 이하로 입력하세요(현재 31자)",
    );
  });

  it("연락처 30자·견적 메모 200자·항목 메모 500자까지 통과, 하나 넘으면 오류", () => {
    const contact = quoteField("q1", "contact");
    const quoteMemo = quoteField("q1", "memo");
    expect(
      messageOf(draftOf({ quotes: [quoteOf({ contact: "1".repeat(30) })] }), contact),
    ).toBeNull();
    expect(messageOf(draftOf({ quotes: [quoteOf({ contact: "1".repeat(31) })] }), contact)).toBe(
      "30자 이하로 입력하세요(현재 31자)",
    );
    expect(
      messageOf(draftOf({ quotes: [quoteOf({ memo: "메".repeat(200) })] }), quoteMemo),
    ).toBeNull();
    expect(messageOf(draftOf({ quotes: [quoteOf({ memo: "메".repeat(201) })] }), quoteMemo)).toBe(
      "200자 이하로 입력하세요(현재 201자)",
    );
    expect(messageOf(draftOf({ memo: "메".repeat(500) }), "memo")).toBeNull();
    expect(messageOf(draftOf({ memo: "메".repeat(501) }), "memo")).toBe(
      "500자 이하로 입력하세요(현재 501자)",
    );
  });

  it("지급 이름 필수, 10자 통과·11자 오류", () => {
    const field = paymentField("p1", "label");
    expect(messageOf(draftOf({ payments: [paymentOf({ label: "" })] }), field)).toBe(
      "이름을 입력하세요",
    );
    expect(
      messageOf(draftOf({ payments: [paymentOf({ label: "가".repeat(10) })] }), field),
    ).toBeNull();
    expect(messageOf(draftOf({ payments: [paymentOf({ label: "가".repeat(11) })] }), field)).toBe(
      "10자 이하로 입력하세요(현재 11자)",
    );
  });
});

describe("날짜 칸 (AC-5)", () => {
  it("끝 < 시작이면 끝 칸 오류", () => {
    expect(messageOf(draftOf({ startDate: "2026-11-10", endDate: "2026-11-09" }), "endDate")).toBe(
      END_BEFORE_START,
    );
  });

  it("끝 = 시작은 통과(같은 날 포함), 끝 > 시작 통과", () => {
    expect(
      messageOf(draftOf({ startDate: "2026-11-10", endDate: "2026-11-10" }), "endDate"),
    ).toBeNull();
    expect(
      messageOf(draftOf({ startDate: "2026-11-10", endDate: "2026-11-11" }), "endDate"),
    ).toBeNull();
  });

  it("한쪽만 있으면 순서 오류가 없다", () => {
    expect(errorsOf(draftOf({ startDate: "2026-11-10" }))).toEqual([]);
    expect(errorsOf(draftOf({ endDate: "2026-11-01" }))).toEqual([]);
  });

  it("달력에 없는 날짜는 형식 오류(순서 오류보다 먼저)", () => {
    expect(messageOf(draftOf({ startDate: "2026-02-30" }), "startDate")).toBe(DATE_FORMAT);
    expect(messageOf(draftOf({ startDate: "2026-11-10", endDate: "2026-13-01" }), "endDate")).toBe(
      DATE_FORMAT,
    );
    expect(
      messageOf(
        draftOf({ payments: [paymentOf({ dueDate: "2026-11-31" })] }),
        paymentField("p1", "dueDate"),
      ),
    ).toBe(DATE_FORMAT);
  });
});

describe("공간 칸", () => {
  it("플랜에 없는 공간 id면 '공간을 고르세요'", () => {
    expect(messageOf(draftOf({ spaceId: "gone" }), "spaceId")).toBe("공간을 고르세요");
    expect(messageOf(draftOf({ spaceId: "sp-all" }), "spaceId")).toBeNull();
  });
});

describe("오류 목록 순서 = 화면 순서 (첫 오류로 포커스)", () => {
  it("공간 → 공종 → 예산 → 견적(업체·연락처·금액·메모) → 지급(이름·금액·날짜) → 시작 → 끝 → 메모", () => {
    const draft: InteriorItemDraft = {
      spaceId: "gone",
      trade: "",
      budget: "1.5",
      quotes: [quoteOf({ vendor: "", contact: "1".repeat(31), amount: "", memo: "m".repeat(201) })],
      confirmedQuoteId: null,
      payments: [paymentOf({ label: "", amount: "0", dueDate: "2026-02-30" })],
      status: "planned",
      startDate: "2026-11-10",
      endDate: "2026-11-01",
      memo: "m".repeat(501),
    };
    expect(errorsOf(draft).map((error) => error.field)).toEqual([
      "spaceId",
      "trade",
      "budget",
      "quote:q1:vendor",
      "quote:q1:contact",
      "quote:q1:amount",
      "quote:q1:memo",
      "payment:p1:label",
      "payment:p1:amount",
      "payment:p1:dueDate",
      "endDate",
      "memo",
    ]);
  });
});

describe("validateInteriorItemDraft → 저장 값", () => {
  it("빈 선택 칸은 키를 쓰지 않는다(ADR-012), 공종은 trim", () => {
    const result = validateInteriorItemDraft(draftOf({ trade: "  타일 " }), SPACE_IDS);
    expect(result).toEqual({
      ok: true,
      input: { spaceId: "sp-bath1", trade: "타일", status: "planned" },
    });
  });

  it("견적·지급·확정·날짜·메모를 숫자·trim 값으로 바꾼다", () => {
    const draft = confirmQuote(
      draftOf({
        budget: "1,200",
        quotes: [
          quoteOf({ id: "q1", vendor: " 가나 ", contact: " 010-1 ", amount: "1,150", memo: "" }),
        ],
        payments: [paymentOf({ id: "p1", label: "잔금", amount: "1000", dueDate: "2026-11-05" })],
        startDate: "2026-11-01",
        endDate: "2026-11-03",
        memo: "  메모  ",
      }),
      "q1",
    );
    expect(validateInteriorItemDraft(draft, SPACE_IDS)).toEqual({
      ok: true,
      input: {
        spaceId: "sp-bath1",
        trade: "타일",
        budget: 1200,
        quotes: [{ id: "q1", vendor: "가나", contact: "010-1", amount: 1150 }],
        confirmedQuoteId: "q1",
        payments: [{ id: "p1", label: "잔금", amount: 1000, dueDate: "2026-11-05", isPaid: false }],
        status: "confirmed",
        startDate: "2026-11-01",
        endDate: "2026-11-03",
        memo: "메모",
      },
    });
  });

  it("저장된 항목 → 시트 입력 → 저장 값이 원래 항목 필드와 같다(왕복)", () => {
    const item = pWallpaper();
    const result = validateInteriorItemDraft(toInteriorItemDraft(item), ["sp-living"]);
    const { id: _id, createdAt: _c, updatedAt: _u, ...fields } = item;
    void [_id, _c, _u];
    expect(result).toEqual({ ok: true, input: fields });
  });
});

describe("지급 합계 문구 값 (summarizePaymentDraft)", () => {
  it("P ③ 샷시: 지급 합계 1,250 / 확정 1,250", () => {
    expect(summarizePaymentDraft(toInteriorItemDraft(pSash()))).toEqual({
      paymentTotal: 1250,
      confirmedAmount: 1250,
    });
  });

  it("금액이 비거나 틀린 줄이 있으면 합계 null, 확정 견적 금액이 틀리면 확정 null", () => {
    const draft = draftOf({
      quotes: [quoteOf({ id: "q1", amount: "12.5" })],
      confirmedQuoteId: "q1",
      payments: [paymentOf({ amount: "100" }), paymentOf({ id: "p2", amount: "" })],
    });
    expect(summarizePaymentDraft(draft)).toEqual({ paymentTotal: null, confirmedAmount: null });
  });

  it("지급 줄이 없으면 합계 0", () => {
    expect(summarizePaymentDraft(draftOf()).paymentTotal).toBe(0);
  });
});
