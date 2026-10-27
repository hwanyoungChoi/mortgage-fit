// 스펙 interior-tbd-amount AC-0(a)·(d), ADR-033 조건 3: 견적 금액은 선택 필드다(키 없음 = 미정). 서버 코드는 바꾸지 않고
// 공용 검증(`validateInteriorPlan.ts` `parseQuote`)만 넓어졌으므로, Worker 진입점(실제 마이그레이션 + D1)으로
// `/import`·계획 POST·항목 POST·PUT이 금액 없는 견적을 받고 GET이 보낸 값과 같은 값을 돌려주는지, 미정이 아닌 잘못된 금액
// (`null`·문자열·소수·음수·상한 초과)은 지금처럼 400인지 본다. 개정(셀프 시공): 견적 금액 0은 금액이 정해진 0이라
// 같은 네 경로에서 통과하고 GET이 `amount: 0`을 그대로 돌려준다. server/는 `@/` 별칭을 못 쓰므로 예시 P⁺ 값을 여기 그대로 적는다.
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  callApi,
  clearTables,
  createUser,
  insertHousehold,
  migrate,
  snapshotPlans,
} from "../test/harness";

import type {
  InteriorItem,
  InteriorItemInput,
  InteriorPlanWithItems,
} from "../../src/lib/types/interiorPlan";
import type { TestUser } from "../test/harness";

const db = env.DB;

const time = (minute: number) => `2026-10-27T01:${String(minute).padStart(2, "0")}:00.000Z`;

/** 예시 P⁺ 줄 하나(줄 추가 입력: 첫 공간, 상태 계획). 세부내용·금액이 null이면 그 키가 없다 */
const line = (
  quoteId: string,
  trade: string,
  vendor: string,
  memo: string | null,
  amount: number | null,
  isConfirmed: boolean,
): InteriorItemInput => ({
  spaceId: "sp-whole",
  trade,
  quotes: [
    {
      id: quoteId,
      vendor,
      ...(amount !== null && { amount }),
      ...(memo !== null && { memo }),
    },
  ],
  ...(isConfirmed && { confirmedQuoteId: quoteId }),
  status: "planned",
});

/** 예시 P⁺: P의 R1~R5 뒤에 R6(확정 미정)·R7(미확정 미정, 세부내용 없음) */
const P_PLUS_LINES: InteriorItemInput[] = [
  line("rq1", "도배", "육문수", "실크 전체", 180, true),
  line("rq2", "도배", "동네도배", "합지", 150, false),
  line("rq3", "욕실", "하루바스", "철거·방수 (1)", 370, true),
  line("rq4", "욕실", "욕실나라", "철거·방수 (1)", 400, false),
  line("rq5", "욕실", "하루바스", "타일 덧방 (2)", 250, true),
  line("rq6", "조명", "빛나라조명", "거실 매입등", null, true),
  line("rq7", "도배", "한솔도배", null, null, false),
];

const R6 = P_PLUS_LINES[5];

const PLAN_FIELDS = {
  name: "우리 집",
  budget: 1000,
  spaces: [{ id: "sp-whole", name: "전체" }],
};

/** 로그아웃 상태에서 만든 P⁺(id·시각 그대로 옮긴다) */
const planPPlus = (): InteriorPlanWithItems => ({
  id: "plan-p-plus",
  ...PLAN_FIELDS,
  createdAt: time(0),
  updatedAt: time(0),
  items: P_PLUS_LINES.map((fields, index) => ({
    id: `item-r${index + 1}`,
    ...fields,
    createdAt: time(index + 1),
    updatedAt: time(index + 1),
  })),
});

const fieldsOf = ({ id, createdAt, updatedAt, ...fields }: InteriorItem): InteriorItemInput => {
  void [id, createdAt, updatedAt];
  return fields;
};

/** 견적 금액만 바꾼 R6(금액이 undefined면 키를 그대로 두어 JSON에서 빠지게 한다) */
const r6WithAmount = (amount: unknown) => ({
  ...R6,
  quotes: [{ ...R6.quotes![0], amount }],
});

async function getPlans(user: TestUser) {
  const response = await callApi(db, "GET", "/api/interior-plans", { cookie: user.cookie });
  expect(response.status).toBe(200);
  return ((await response.json()) as { plans: InteriorPlanWithItems[] }).plans;
}

const importPlan = (user: TestUser, plan: unknown) =>
  callApi(db, "POST", "/api/interior-plans/import", { cookie: user.cookie, body: { plan } });

const createPlan = (user: TestUser, plan: unknown) =>
  callApi(db, "POST", "/api/interior-plans", { cookie: user.cookie, body: { plan } });

const postItem = (user: TestUser, planId: string, item: unknown) =>
  callApi(db, "POST", `/api/interior-plans/${planId}/items`, {
    cookie: user.cookie,
    body: { item },
  });

const putItem = (user: TestUser, planId: string, itemId: string, item: unknown) =>
  callApi(db, "PUT", `/api/interior-plans/${planId}/items/${itemId}`, {
    cookie: user.cookie,
    body: { item },
  });

let alice: TestUser;

beforeAll(async () => {
  await migrate(db);
});

beforeEach(async () => {
  await clearTables(db);
  alice = await createUser(db, "alice");
});

describe("금액 없는 견적: 쓰기 200(201)이고 GET이 같은 값 (AC-0(a)·(d))", () => {
  it("/import P⁺ → 200 imported 1, GET은 P⁺와 같다(R6·R7 견적에 amount 키 없음)", async () => {
    const response = await importPlan(alice, planPPlus());
    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({ imported: 1 });

    const plans = await getPlans(alice);
    expect(plans).toStrictEqual([planPPlus()]);
    const [, , , , , r6, r7] = plans[0].items;
    expect(Object.hasOwn(r6.quotes![0], "amount")).toBe(false);
    expect(Object.hasOwn(r7.quotes![0], "amount")).toBe(false);
  });

  it("계획 POST(items P⁺) → 201, 응답과 GET의 항목이 입력 순서·값 그대로", async () => {
    const response = await createPlan(alice, { ...PLAN_FIELDS, items: P_PLUS_LINES });
    expect(response.status).toBe(201);
    const { plan } = (await response.json()) as { plan: InteriorPlanWithItems };
    expect(plan.items.map(fieldsOf)).toStrictEqual(P_PLUS_LINES);

    const [stored] = await getPlans(alice);
    expect(stored).toStrictEqual(plan);
  });

  it("항목 POST(R6) → 201, PUT 그대로 → 200, 120 채우기 PUT → 200, GET이 매번 입력과 같다", async () => {
    expect((await importPlan(alice, { ...planPPlus(), items: [] })).status).toBe(200);

    const posted = await postItem(alice, "plan-p-plus", R6);
    expect(posted.status).toBe(201);
    const { item } = (await posted.json()) as { item: InteriorItem };
    expect(fieldsOf(item)).toStrictEqual(R6);
    expect(fieldsOf((await getPlans(alice))[0].items[0])).toStrictEqual(R6);

    const filled = r6WithAmount(120) as InteriorItemInput;
    for (const input of [R6, filled]) {
      const put = await putItem(alice, "plan-p-plus", item.id, input);
      expect(put.status).toBe(200);
      expect(fieldsOf(((await put.json()) as { item: InteriorItem }).item)).toStrictEqual(input);
      expect(fieldsOf((await getPlans(alice))[0].items[0])).toStrictEqual(input);
    }
  });

  it("금액 있는 견적을 키 없이 PUT → 200, GET에 amount 키 없음(서버는 2단계 비우기 입력도 받는다)", async () => {
    expect((await importPlan(alice, planPPlus())).status).toBe(200);
    const cleared = {
      ...P_PLUS_LINES[0],
      quotes: [{ id: "rq1", vendor: "육문수", memo: "실크 전체" }],
    };

    const put = await putItem(alice, "plan-p-plus", "item-r1", cleared);
    expect(put.status).toBe(200);
    const stored = (await getPlans(alice))[0].items[0];
    expect(fieldsOf(stored)).toStrictEqual(cleared);
    expect(Object.hasOwn(stored.quotes![0], "amount")).toBe(false);
  });

  it("amount: undefined로 보낸 견적(JSON에서 키가 빠짐)도 키 없음과 같다", async () => {
    expect((await importPlan(alice, { ...planPPlus(), items: [] })).status).toBe(200);
    const posted = await postItem(alice, "plan-p-plus", r6WithAmount(undefined));
    expect(posted.status).toBe(201);
    expect(fieldsOf((await getPlans(alice))[0].items[0])).toStrictEqual(R6);
  });

  it.each([1, 999_999_999])("견적 금액 %s는 경계 안이라 201이고 그대로 저장", async (amount) => {
    expect((await importPlan(alice, { ...planPPlus(), items: [] })).status).toBe(200);
    const input = r6WithAmount(amount) as InteriorItemInput;
    const posted = await postItem(alice, "plan-p-plus", input);
    expect(posted.status).toBe(201);
    expect(fieldsOf((await getPlans(alice))[0].items[0])).toStrictEqual(input);
  });
});

describe("견적 금액 0(셀프 시공): 쓰기 200(201)이고 GET이 amount: 0을 그대로 (ADR-033 개정)", () => {
  /** 확정한 셀프 시공 0원 줄 */
  const SELF = line("rq0", "도배", "셀프시공", null, 0, true);

  it("/import·계획 POST에 0 견적 → 200·201, GET이 보낸 값과 같다", async () => {
    const plan = { ...planPPlus(), items: [{ ...planPPlus().items[0], ...SELF }] };
    const imported = await importPlan(alice, plan);
    expect(imported.status).toBe(200);
    expect(await imported.json()).toStrictEqual({ imported: 1 });

    const created = await createPlan(alice, { ...PLAN_FIELDS, items: [SELF] });
    expect(created.status).toBe(201);
    const createdPlan = ((await created.json()) as { plan: InteriorPlanWithItems }).plan;
    expect(createdPlan.items.map(fieldsOf)).toStrictEqual([SELF]);

    const plans = await getPlans(alice);
    expect(plans.find((stored) => stored.id === plan.id)).toStrictEqual(plan);
    expect(plans.find((stored) => stored.id === createdPlan.id)).toStrictEqual(createdPlan);
  });

  it("항목 POST 0 → 201, 120으로 PUT → 200, 다시 0으로 PUT → 200, GET이 매번 입력과 같다", async () => {
    expect((await importPlan(alice, { ...planPPlus(), items: [] })).status).toBe(200);

    const posted = await postItem(alice, "plan-p-plus", SELF);
    expect(posted.status).toBe(201);
    const { item } = (await posted.json()) as { item: InteriorItem };
    expect(fieldsOf(item)).toStrictEqual(SELF);
    expect(fieldsOf((await getPlans(alice))[0].items[0])).toStrictEqual(SELF);

    const priced = { ...SELF, quotes: [{ ...SELF.quotes![0], amount: 120 }] };
    for (const input of [priced, SELF]) {
      const put = await putItem(alice, "plan-p-plus", item.id, input);
      expect(put.status).toBe(200);
      expect(fieldsOf(((await put.json()) as { item: InteriorItem }).item)).toStrictEqual(input);
      expect(fieldsOf((await getPlans(alice))[0].items[0])).toStrictEqual(input);
    }
    expect((await getPlans(alice))[0].items[0].quotes![0].amount).toBe(0);
  });
});

describe("미정이 아닌 잘못된 금액은 지금처럼 400이고 아무것도 바뀌지 않는다 (AC-0(a))", () => {
  const REJECTED: [string, unknown][] = [
    ["null", null],
    ['"100"', "100"],
    ["-1", -1],
    ["1.5", 1.5],
    ["1,000,000,000", 1_000_000_000],
  ];

  const ITEM_INVALID = {
    error: "invalidParams",
    message: "요청 본문은 { item } 객체이고 항목 값이 올바라야 합니다",
  };
  /** import·계획 POST는 항목 위치를 알려 준다(R6은 6번째 줄) */
  const SIXTH_ITEM_INVALID = {
    error: "invalidParams",
    message: "6번째 항목의 값이 올바르지 않습니다",
  };

  it.each(REJECTED)("견적 금액 %s: /import·계획 POST·항목 POST·PUT 모두 400", async (_, amount) => {
    expect((await importPlan(alice, planPPlus())).status).toBe(200);
    const before = await snapshotPlans(db);
    const badR6 = r6WithAmount(amount);

    const badPlan = planPPlus();
    const imported = await importPlan(alice, {
      ...badPlan,
      id: "plan-other",
      items: badPlan.items.map((item, index) => (index === 5 ? { ...item, ...badR6 } : item)),
    });
    const created = await createPlan(alice, {
      ...PLAN_FIELDS,
      items: P_PLUS_LINES.map((fields, index) => (index === 5 ? badR6 : fields)),
    });
    const posted = await postItem(alice, "plan-p-plus", badR6);
    const put = await putItem(alice, "plan-p-plus", "item-r6", badR6);

    for (const [response, body] of [
      [imported, SIXTH_ITEM_INVALID],
      [created, SIXTH_ITEM_INVALID],
      [posted, ITEM_INVALID],
      [put, ITEM_INVALID],
    ] as const) {
      expect(response.status).toBe(400);
      expect(await response.json()).toStrictEqual(body);
    }
    expect(await snapshotPlans(db)).toStrictEqual(before);
  });
});

describe("가구 모드: 다른 구성원이 금액 없는 견적을 쓰고 둘 다 같은 값을 본다 (AC-0(d))", () => {
  it("hb가 ha의 계획에 R6 POST 201·채우기 PUT 200, ha·hb GET이 입력과 같다", async () => {
    await insertHousehold(db, "h1");
    const ha = await createUser(db, "ha", { householdId: "h1" });
    const hb = await createUser(db, "hb", { householdId: "h1" });

    const created = await createPlan(ha, PLAN_FIELDS);
    expect(created.status).toBe(201);
    const planId = ((await created.json()) as { plan: InteriorPlanWithItems }).plan.id;

    const posted = await postItem(hb, planId, R6);
    expect(posted.status).toBe(201);
    const itemId = ((await posted.json()) as { item: InteriorItem }).item.id;
    for (const user of [ha, hb]) {
      expect((await getPlans(user))[0].items.map(fieldsOf)).toStrictEqual([R6]);
    }

    const filled = r6WithAmount(120) as InteriorItemInput;
    const put = await putItem(ha, planId, itemId, filled);
    expect(put.status).toBe(200);
    for (const user of [ha, hb]) {
      expect((await getPlans(user))[0].items.map(fieldsOf)).toStrictEqual([filled]);
    }
  });
});
