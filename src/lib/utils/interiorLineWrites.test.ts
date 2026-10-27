// 스펙 interior-simple AC-0(c) 쓰기 입력(ADR-032 조건 2)·AC-2(a)·AC-3·AC-4(a)~(d).
// c1 형식: `validateInteriorItemFields(input)`이 입력과 toStrictEqual(키 값 undefined가 남으면 걸린다).
// c2 보존: 바꾼 키(함수별 고정)를 뺀 나머지가 원래 항목(id·시각 뺀 것)과 toStrictEqual.
// c3 키 빠짐 방지: 모든 선택 키가 채워진 항목(상태 5종 각각)과 키 목록 `satisfies Record<keyof …, true>`.
import { describe, expect, it } from "vitest";

import { INTERIOR_ITEM_STATUSES } from "@/lib/constants/interiorPlan";
import {
  legacyX,
  legacyY,
  legacyZ,
  makeFullItem,
  makePlanL,
  makeSimplePlanP,
  r1,
  r4,
  r6,
} from "@/test/interiorSimpleFixture";
import { createMemoryStorage } from "@/test/memoryStorage";

import {
  addLineInput,
  editLineInput,
  releasesOtherConfirm,
  removeLineWrite,
  toggleLineConfirmInput,
} from "./interiorLineWrites";
import { createInteriorPlanStore, INTERIOR_PLANS_STORAGE_KEY } from "./interiorPlanStorage";
import { validateInteriorItemFields } from "./validateInteriorPlan";

import type { InteriorLineValues } from "@/lib/types/interiorLineDraft";
import type {
  InteriorItem,
  InteriorItemInput,
  InteriorItemStatus,
  InteriorPayment,
  InteriorPlanWithItems,
  InteriorQuote,
} from "@/lib/types/interiorPlan";

/** 항목·견적·지급의 키 전부. 타입에 키가 늘면 여기서 컴파일 오류가 나 fixture·테스트를 같이 고치게 된다(c3) */
const ITEM_INPUT_KEYS = {
  spaceId: true,
  trade: true,
  budget: true,
  quotes: true,
  confirmedQuoteId: true,
  payments: true,
  status: true,
  startDate: true,
  endDate: true,
  memo: true,
} satisfies Record<keyof InteriorItemInput, true>;

const QUOTE_KEYS = {
  id: true,
  vendor: true,
  contact: true,
  amount: true,
  amountWon: true,
  memo: true,
} satisfies Record<keyof InteriorQuote, true>;

const PAYMENT_KEYS = {
  id: true,
  label: true,
  amount: true,
  dueDate: true,
  isPaid: true,
} satisfies Record<keyof InteriorPayment, true>;

const sortedKeys = (value: object) => Object.keys(value).toSorted();

/** 원래 항목에서 id·시각을 뺀 것(저장 입력과 비교할 기준) */
function fieldsOf(item: InteriorItem): InteriorItemInput {
  const { id, createdAt, updatedAt, ...fields } = item;
  void [id, createdAt, updatedAt];
  return fields;
}

function omit<T extends object>(value: T, keys: readonly string[]): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key)),
  ) as Partial<T>;
}

const values = (patch: Partial<InteriorLineValues> = {}): InteriorLineValues => ({
  trade: "욕실",
  vendor: "새업체",
  amountWon: 9_990_000,
  isConfirmed: false,
  ...patch,
});

const fixedId = () => "new-quote";

/** 견적 1개(연락처·메모·확정 있음)만 남긴 모든-키 항목 */
const singleQuoteItem = (status: InteriorItemStatus): InteriorItem => {
  const full = makeFullItem(status);
  return { ...full, quotes: [full.quotes![0]] };
};

/** 견적 0개(확정 없음)인 모든-키 항목 */
const blankItem = (status: InteriorItemStatus): InteriorItem => {
  const { quotes, confirmedQuoteId, ...rest } = makeFullItem(status);
  void [quotes, confirmedQuoteId];
  return rest;
};

type WriteCase = {
  name: string;
  item: (status: InteriorItemStatus) => InteriorItem;
  write: (item: InteriorItem) => InteriorItemInput;
  /** 이 쓰기가 바꿀 수 있는 최상위 키(함수별 고정, 스펙 "쓰기 규칙" 표) */
  changedKeys: readonly (keyof InteriorItemInput)[];
  /** 바꾼 키 안쪽의 기대값 */
  expectChanged: (input: InteriorItemInput, item: InteriorItem) => void;
};

const EDIT_KEYS = ["trade", "memo", "quotes", "confirmedQuoteId"] as const;

const WRITE_CASES: WriteCase[] = [
  {
    name: "줄 수정(견적 1개, 옛 만원 키 fq1): 업체·금액 바꾸고 세부내용·비고·확정 비우기",
    item: singleQuoteItem,
    write: (item) => editLineInput(item, "fq1", values({ trade: "도배" }), fixedId),
    changedKeys: EDIT_KEYS,
    expectChanged: (input, item) => {
      expect(input.trade).toBe("도배");
      // 견적 id·연락처는 그대로, 비운 세부내용은 키가 없다. 금액은 원 키로만 쓰고 옛 `amount`는 지운다(ADR-034 조건 4)
      expect(input.quotes).toStrictEqual([
        { id: "fq1", vendor: "새업체", contact: item.quotes![0].contact, amountWon: 9_990_000 },
      ]);
      expect("memo" in input).toBe(false);
      expect("confirmedQuoteId" in input).toBe(false);
    },
  },
  {
    name: "줄 수정(견적 n≥2, 연락처가 있는 fq1): 제자리, 형제 견적 그대로",
    item: makeFullItem,
    write: (item) =>
      editLineInput(
        item,
        "fq1",
        values({ detail: "철거만", note: "새 비고", isConfirmed: true }),
        fixedId,
      ),
    changedKeys: EDIT_KEYS,
    expectChanged: (input, item) => {
      expect(input.quotes).toStrictEqual([
        {
          id: "fq1",
          vendor: "새업체",
          contact: "010-1234-5678",
          amountWon: 9_990_000,
          memo: "철거만",
        },
        item.quotes![1],
      ]);
      expect(input.memo).toBe("새 비고");
      expect(input.confirmedQuoteId).toBe("fq1");
    },
  },
  {
    name: "견적 0개 항목 채우기: 숨은 값 유지 + 견적 1개(확정 꺼짐)",
    item: blankItem,
    write: (item) => editLineInput(item, null, values({ trade: item.trade }), fixedId),
    changedKeys: ["trade", "memo", "quotes"],
    expectChanged: (input) => {
      expect(input.quotes).toStrictEqual([
        { id: "new-quote", vendor: "새업체", amountWon: 9_990_000 },
      ]);
      expect("memo" in input).toBe(false);
      expect("confirmedQuoteId" in input).toBe(false);
    },
  },
  {
    name: "확정 켜기(fq2): 확정만 fq2로",
    item: makeFullItem,
    write: (item) => toggleLineConfirmInput(item, "fq2", true),
    changedKeys: ["confirmedQuoteId"],
    expectChanged: (input) => expect(input.confirmedQuoteId).toBe("fq2"),
  },
  {
    name: "확정 끄기(fq1): 확정 키 삭제",
    item: makeFullItem,
    write: (item) => toggleLineConfirmInput(item, "fq1", false),
    changedKeys: ["confirmedQuoteId"],
    expectChanged: (input) => expect("confirmedQuoteId" in input).toBe(false),
  },
  {
    name: "견적 n≥2에서 확정 안 된 fq2 삭제: fq2만 빠지고 확정 fq1 그대로",
    item: makeFullItem,
    write: (item) => updateInputOf(removeLineWrite(item, "fq2")),
    changedKeys: ["quotes", "confirmedQuoteId"],
    expectChanged: (input, item) => {
      expect(input.quotes).toStrictEqual([item.quotes![0]]);
      expect(input.confirmedQuoteId).toBe("fq1");
    },
  },
  {
    name: "견적 n≥2에서 확정 견적 fq1 삭제: fq1이 빠지고 확정 키도 없다",
    item: makeFullItem,
    write: (item) => updateInputOf(removeLineWrite(item, "fq1")),
    changedKeys: ["quotes", "confirmedQuoteId"],
    expectChanged: (input, item) => {
      expect(input.quotes).toStrictEqual([item.quotes![1]]);
      expect("confirmedQuoteId" in input).toBe(false);
    },
  },
];

function updateInputOf(removal: ReturnType<typeof removeLineWrite>): InteriorItemInput {
  if (removal.kind !== "updateItem") throw new Error("updateItem이 아님");
  return removal.input;
}

describe("c3 모든 선택 키가 채워진 fixture", () => {
  it("항목·견적(두 견적에 나눠)·지급의 모든 키가 있고, 지급함/미지급과 예정일이 모두 있다", () => {
    const item = makeFullItem("planned");
    expect(sortedKeys(fieldsOf(item))).toEqual(sortedKeys(ITEM_INPUT_KEYS));
    // 같은 뜻의 두 키(`amount` 만원·`amountWon` 원)는 한 견적에 함께 있을 수 없어(ADR-034) 견적 둘이 하나씩 나눠 갖는다
    expect([...new Set(item.quotes!.flatMap(sortedKeys))].toSorted()).toEqual(
      sortedKeys(QUOTE_KEYS),
    );
    expect(item.quotes!.map((quote) => Object.hasOwn(quote, "amountWon"))).toEqual([false, true]);
    for (const payment of item.payments!) {
      expect(sortedKeys(payment)).toEqual(sortedKeys(PAYMENT_KEYS));
    }
    expect(item.payments!.map((payment) => payment.isPaid)).toEqual([true, false]);
    expect(validateInteriorItemFields(fieldsOf(item))).toStrictEqual(fieldsOf(item));
  });

  it("상태는 5종 전부로 돌린다", () => {
    expect(INTERIOR_ITEM_STATUSES).toHaveLength(5);
  });
});

describe.each(INTERIOR_ITEM_STATUSES)("쓰기 입력 표 — 상태 %s", (status) => {
  it.each(WRITE_CASES)("$name", ({ item: makeItem, write, changedKeys, expectChanged }) => {
    const item = makeItem(status);
    const input = write(item);
    // c1 형식
    expect(validateInteriorItemFields(input)).toStrictEqual(input);
    // c2 보존: 바꾼 키 밖(공간·예산·지급·상태·날짜 등)은 원래 그대로
    expect(omit(input, changedKeys)).toStrictEqual(omit(fieldsOf(item), changedKeys));
    expect(input.status).toBe(status);
    expectChanged(input, item);
  });

  it("견적 1개 항목의 줄 삭제 → removeItem(지급 2건도 같이 지워진다고 알린다)", () => {
    expect(removeLineWrite(singleQuoteItem(status), "fq1")).toEqual({
      kind: "removeItem",
      paymentCount: 2,
    });
    expect(removeLineWrite(blankItem(status), null)).toEqual({
      kind: "removeItem",
      paymentCount: 2,
    });
  });
});

describe("줄 추가 (AC-2(a))", () => {
  const plan = makeSimplePlanP({ items: [] });

  it("R1 확정 켜고 저장 → 견적 1개 항목, 공간은 첫 공간, 상태 계획, 비고 없음 → memo 키 없음", () => {
    const input = addLineInput(
      plan.spaces[0].id,
      "nq",
      values({
        trade: "도배",
        vendor: "육문수",
        amountWon: 1_800_000,
        detail: "실크 전체",
        isConfirmed: true,
      }),
    );
    expect(input).toStrictEqual({
      spaceId: "sp-whole",
      trade: "도배",
      quotes: [{ id: "nq", vendor: "육문수", amountWon: 1_800_000, memo: "실크 전체" }],
      confirmedQuoteId: "nq",
      status: "planned",
    });
    expect(validateInteriorItemFields(input)).toStrictEqual(input);
  });

  it("확정 꺼짐·비고 있음 → confirmedQuoteId 키 없음, memo 있음", () => {
    const input = addLineInput("sp-whole", "nq", values({ note: "포함 조건" }));
    expect(input).toStrictEqual({
      spaceId: "sp-whole",
      trade: "욕실",
      quotes: [{ id: "nq", vendor: "새업체", amountWon: 9_990_000 }],
      status: "planned",
      memo: "포함 조건",
    });
    expect(validateInteriorItemFields(input)).toStrictEqual(input);
  });
});

describe("확정 토글 (AC-3)", () => {
  it("P의 R4 체크 → confirmedQuoteId만 바뀐 R4 전체", () => {
    expect(toggleLineConfirmInput(r4(), "rq4", true)).toStrictEqual({
      ...fieldsOf(r4()),
      confirmedQuoteId: "rq4",
    });
  });

  it("R1 해제 → confirmedQuoteId 키가 없다(undefined 값도 아님)", () => {
    const input = toggleLineConfirmInput(r1(), "rq1", false);
    expect(Object.hasOwn(input, "confirmedQuoteId")).toBe(false);
    expect(input).toStrictEqual(omit(fieldsOf(r1()), ["confirmedQuoteId"]));
  });

  // 옛 화면의 "견적 중 항목을 확정하면 상태가 확정"을 뒤집는다(A4): 새 화면은 상태를 읽지도 바꾸지도 않는다
  it.each<InteriorItemStatus>(["planned", "quoting", "inProgress"])(
    "상태 %s: 확정을 켜고 꺼도 status 그대로",
    (status) => {
      const item = { ...r4(), status };
      const on = toggleLineConfirmInput(item, "rq4", true);
      expect(on.status).toBe(status);
      expect(toggleLineConfirmInput({ ...item, ...on }, "rq4", false).status).toBe(status);
    },
  );

  it("이미 꺼진 줄을 끄면 그대로(다른 견적의 확정을 건드리지 않는다)", () => {
    expect(toggleLineConfirmInput(legacyX(), "q2", false)).toStrictEqual(fieldsOf(legacyX()));
  });

  it("releasesOtherConfirm: 같은 항목의 다른 견적이 확정돼 있을 때 켜는 경우만 참", () => {
    expect(releasesOtherConfirm(legacyX(), "q2", true)).toBe(true);
    expect(releasesOtherConfirm(legacyX(), "q1", true)).toBe(false);
    expect(releasesOtherConfirm(legacyX(), "q1", false)).toBe(false);
    expect(releasesOtherConfirm(r4(), "rq4", true)).toBe(false);
  });
});

describe("옛 계획 L 고치기 (AC-4, D2 a)", () => {
  it("(a) 욕실나라 400만 → 3,800,000원: X와 quotes[1]의 금액 키만 다르다(예산·지급·상태·날짜·연락처·공간·확정·메모 그대로)", () => {
    const x = legacyX();
    const input = editLineInput(
      x,
      "q2",
      values({ trade: "욕실", vendor: "욕실나라", amountWon: 3_800_000, note: "폐기물 포함" }),
      fixedId,
    );
    expect(input).toStrictEqual({
      ...fieldsOf(x),
      quotes: [x.quotes![0], { id: "q2", vendor: "욕실나라", amountWon: 3_800_000 }],
    });
  });

  it("(b) Y에 육문수·1,800,000원 채우기: memo 키 없음, 예산 200·상태·공간 s0 유지, 견적 1개, 확정 없음", () => {
    const input = editLineInput(
      legacyY(),
      null,
      values({ trade: "도배", vendor: "육문수", amountWon: 1_800_000 }),
      fixedId,
    );
    expect(input).toStrictEqual({
      spaceId: "s0",
      trade: "도배",
      budget: 200,
      quotes: [{ id: "new-quote", vendor: "육문수", amountWon: 1_800_000 }],
      status: "planned",
    });
  });

  it("(c) 욕실나라 삭제 → X에서 q2만 빠짐(확정 q1·지급·연락처 유지), 타일 덧방 삭제 → removeItem(Z)", () => {
    const x = legacyX();
    expect(removeLineWrite(x, "q2")).toStrictEqual({
      kind: "updateItem",
      input: { ...fieldsOf(x), quotes: [x.quotes![0]] },
    });
    expect(removeLineWrite(legacyZ(), "q3")).toEqual({ kind: "removeItem", paymentCount: 0 });
  });

  it("(c) 확정 견적 q1(하루바스 철거·방수) 삭제 → quotes [q2], confirmedQuoteId 키 없음", () => {
    const x = legacyX();
    const input = updateInputOf(removeLineWrite(x, "q1"));
    expect(input).toStrictEqual(
      omit({ ...fieldsOf(x), quotes: [x.quotes![1]] }, ["confirmedQuoteId"]),
    );
    expect(validateInteriorItemFields(input)).toStrictEqual(input);
  });

  it("(d) 욕실나라 체크 → X의 확정이 q2로 옮겨 간다(상태 진행 중 그대로)", () => {
    const input = toggleLineConfirmInput(legacyX(), "q2", true);
    expect(input).toStrictEqual({ ...fieldsOf(legacyX()), confirmedQuoteId: "q2" });
    expect(input.status).toBe("inProgress");
  });
});

describe("로컬 스토어 왕복: 쓴 입력이 그대로 저장된다", () => {
  const storeWith = (plans: InteriorPlanWithItems[]) => {
    const storage = createMemoryStorage({
      [INTERIOR_PLANS_STORAGE_KEY]: JSON.stringify({ plans }),
    });
    const store = createInteriorPlanStore({
      storage,
      createId: () => "created-item",
      now: () => "2026-10-27T09:00:00.000Z",
    });
    const storedItem = (itemId: string) => {
      const raw = JSON.parse(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)!) as {
        plans: InteriorPlanWithItems[];
      };
      return raw.plans[0].items.find((item) => item.id === itemId)!;
    };
    return { store, storedItem };
  };

  it("L의 X를 줄 수정 PUT → 저장된 항목(id·시각 뺀 것) === 입력", () => {
    const { store, storedItem } = storeWith([makePlanL()]);
    const input = editLineInput(
      legacyX(),
      "q1",
      values({
        vendor: "하루바스2",
        amountWon: 3_600_000,
        detail: "철거·방수",
        note: "폐기물 포함",
      }),
      fixedId,
    );
    expect(store.updateItem("plan-l", "item-x", input)).toEqual({ ok: true });
    expect(fieldsOf(storedItem("item-x"))).toStrictEqual(input);
  });

  it("P에 줄 추가 POST → 저장된 항목 === 입력", () => {
    const { store, storedItem } = storeWith([makeSimplePlanP()]);
    const input = addLineInput("sp-whole", "nq", values({ detail: "합지", note: "비고" }));
    expect(store.addItem("plan-simple", input).ok).toBe(true);
    expect(fieldsOf(storedItem("created-item"))).toStrictEqual(input);
  });
});

// ADR-034 조건 4(qa Q8)·ADR-033 조건 5: 2단계 줄 쓰기는 고친 견적만 원 `amountWon`으로 쓰고 옛 만원 `amount`는 지운다.
// 금액을 비우면(미정) 두 키 모두 없다. 0원은 금액이다. 형제 견적은 원래 금액 키 그대로다(옛 줄을 다시 쓰지 않는다, AC-0).
describe("2단계 금액 쓰기 — editedQuote(ADR-034 조건 4, ADR-033 조건 5)", () => {
  /** 견적 [w 원 1,230,000(확정), m 만원 800, z 원 0] 항목 */
  const mixedItem = (): InteriorItem => ({
    id: "item-w",
    spaceId: "sp-whole",
    trade: "도배",
    quotes: [
      { id: "w", vendor: "원업체", amountWon: 1_230_000, memo: "실크" },
      { id: "m", vendor: "만원업체", amount: 800 },
      { id: "z", vendor: "셀프", amountWon: 0 },
    ],
    confirmedQuoteId: "w",
    status: "planned",
    createdAt: makeSimplePlanP().createdAt,
    updatedAt: makeSimplePlanP().updatedAt,
  });

  /** 견적 하나를 고친 결과에서 그 견적 */
  const editedQuoteOf = (
    item: InteriorItem,
    quoteId: string,
    patch: Partial<InteriorLineValues>,
  ) => {
    const input = editLineInput(item, quoteId, values({ trade: item.trade, ...patch }), fixedId);
    expect(validateInteriorItemFields(input)).toStrictEqual(input);
    return { input, quote: input.quotes!.find((quote) => quote.id === quoteId)! };
  };

  it("원 키 견적 w를 1,234,500원으로 저장 → w는 amountWon만, m·z는 그대로", () => {
    const item = mixedItem();
    const { input } = editedQuoteOf(item, "w", {
      vendor: "원업체",
      amountWon: 1_234_500,
      detail: "실크",
      isConfirmed: true,
    });
    expect(input.quotes).toStrictEqual([
      { id: "w", vendor: "원업체", amountWon: 1_234_500, memo: "실크" },
      item.quotes![1],
      item.quotes![2],
    ]);
  });

  it("옛 만원 키 견적 m(800)을 9,000,000원으로 저장 → m은 amountWon만 있고 amount 키가 없다, 형제 w·z 그대로", () => {
    const item = mixedItem();
    const { input, quote } = editedQuoteOf(item, "m", { vendor: "만원업체", amountWon: 9_000_000 });
    expect(quote).toStrictEqual({ id: "m", vendor: "만원업체", amountWon: 9_000_000 });
    expect(Object.hasOwn(quote, "amount")).toBe(false);
    expect(input.quotes).toStrictEqual([
      item.quotes![0],
      { id: "m", vendor: "만원업체", amountWon: 9_000_000 },
      item.quotes![2],
    ]);
  });

  it.each([
    ["원 키 w", "w", "원업체"],
    ["옛 만원 키 m", "m", "만원업체"],
    ["원 0 z", "z", "셀프"],
  ])(
    "%s의 금액을 비우면(미정) amount·amountWon 키가 모두 없다(undefined 값도 아님)",
    (_, id, vendor) => {
      const { quote } = editedQuoteOf(mixedItem(), id, { vendor, amountWon: undefined });
      expect(quote).toStrictEqual({ id, vendor });
      expect(Object.hasOwn(quote, "amount")).toBe(false);
      expect(Object.hasOwn(quote, "amountWon")).toBe(false);
    },
  );

  it("0원(셀프 시공)은 미정이 아니라 amountWon: 0으로 쓴다", () => {
    const { quote } = editedQuoteOf(mixedItem(), "m", { vendor: "만원업체", amountWon: 0 });
    expect(quote).toStrictEqual({ id: "m", vendor: "만원업체", amountWon: 0 });
  });

  it("미정 줄(R6)에 1,200,000원을 넣으면 amountWon만 생기고 amount는 없다", () => {
    const input = editLineInput(
      r6(),
      "rq6",
      values({ trade: "조명", vendor: "빛나라조명", amountWon: 1_200_000, detail: "거실 매입등" }),
      fixedId,
    );
    expect(input.quotes).toStrictEqual([
      { id: "rq6", vendor: "빛나라조명", amountWon: 1_200_000, memo: "거실 매입등" },
    ]);
  });

  it("줄 추가·빈 줄 채우기도 amountWon만 쓰고, 금액을 비우면 금액 키가 없다", () => {
    const added = addLineInput("sp-whole", "nq", values());
    expect(added.quotes).toStrictEqual([{ id: "nq", vendor: "새업체", amountWon: 9_990_000 }]);
    const filled = editLineInput(legacyY(), null, values({ trade: "도배" }), fixedId);
    expect(filled.quotes).toStrictEqual([
      { id: "new-quote", vendor: "새업체", amountWon: 9_990_000 },
    ]);
    const { amountWon, ...tbd } = values();
    void amountWon;
    expect(addLineInput("sp-whole", "nq", tbd).quotes).toStrictEqual([
      { id: "nq", vendor: "새업체" },
    ]);
  });

  it("로컬 저장 왕복: m 저장 뒤 원문의 m에 amount가 없고, w를 비운 뒤 w에 금액 키가 없으며 형제 z의 amountWon: 0은 남는다", () => {
    const plan = makeSimplePlanP({ items: [mixedItem()] });
    const storage = createMemoryStorage({
      [INTERIOR_PLANS_STORAGE_KEY]: JSON.stringify({ plans: [plan] }),
    });
    let minute = 0;
    const store = createInteriorPlanStore({
      storage,
      createId: () => "unused",
      now: () => `2026-10-27T09:0${(minute += 1)}:00.000Z`,
    });
    const storedQuotes = () =>
      (
        JSON.parse(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)!) as {
          plans: InteriorPlanWithItems[];
        }
      ).plans[0].items[0];
    const first = editLineInput(
      mixedItem(),
      "m",
      values({ trade: "도배", vendor: "만원업체", amountWon: 9_000_000 }),
      fixedId,
    );
    expect(store.updateItem("plan-simple", "item-w", first)).toEqual({ ok: true });
    const second = editLineInput(
      storedQuotes(),
      "w",
      values({
        trade: "도배",
        vendor: "원업체",
        amountWon: undefined,
        detail: "실크",
        isConfirmed: true,
      }),
      fixedId,
    );
    expect(store.updateItem("plan-simple", "item-w", second)).toEqual({ ok: true });
    expect(storedQuotes().quotes).toStrictEqual([
      { id: "w", vendor: "원업체", memo: "실크" },
      { id: "m", vendor: "만원업체", amountWon: 9_000_000 },
      { id: "z", vendor: "셀프", amountWon: 0 },
    ]);
  });
});
