// ADR-034 조건 3·4·7(qa Q2·Q6·Q7): 견적 `amountWon`·총 예산 `budgetWon`(원 정수)을 Worker 진입점(실제 마이그레이션 + D1)으로 본다.
// - POST·`/import`·항목 PUT이 새 키를 그대로 저장하고 GET이 보낸 값과 같다(정규화 없음). 형제 견적 PUT 뒤 다른 견적의 키가 그대로다.
// - PATCH는 `budgetMergePatch`로 두 예산 키를 함께 정한다. `json_patch`가 null로 키를 지우므로 `SELECT data` 원문에서
//   지운 키가 null이 아니라 아예 없는지 본다. 이름만 고치면 예산 키를 건드리지 않는다.
// - 같은 뜻의 두 키가 함께 오면 모든 쓰기 경로가 400이고 아무것도 바뀌지 않는다.
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { callApi, clearTables, createUser, migrate, snapshotPlans } from "../test/harness";

import type {
  InteriorItem,
  InteriorItemInput,
  InteriorPlan,
  InteriorPlanWithItems,
} from "../../src/lib/types/interiorPlan";
import type { TestUser } from "../test/harness";

const db = env.DB;

const time = (minute: number) => `2026-10-27T02:${String(minute).padStart(2, "0")}:00.000Z`;

const SPACES = [{ id: "sp-whole", name: "전체" }];

/** 원 단위 견적(1,234,500·0)과 만원 견적이 한 항목에 섞인 줄 */
const MIXED_LINE: InteriorItemInput = {
  spaceId: "sp-whole",
  trade: "도배",
  quotes: [
    { id: "wq1", vendor: "육문수", amountWon: 1_234_500 },
    { id: "wq2", vendor: "동네도배", amount: 800, memo: "합지" },
    { id: "wq3", vendor: "셀프시공", amountWon: 0 },
  ],
  confirmedQuoteId: "wq1",
  status: "planned",
};

/** 상한 견적(13자리) */
const MAX_LINE: InteriorItemInput = {
  spaceId: "sp-whole",
  trade: "욕실",
  quotes: [{ id: "wq9", vendor: "하루바스", amountWon: 9_999_999_999_999 }],
  status: "planned",
};

/** 로그아웃 상태에서 만든 원 단위 계획(id·시각 그대로 옮긴다) */
const wonPlan = (): InteriorPlanWithItems => ({
  id: "plan-won",
  name: "원 단위 집",
  budgetWon: 12_345_000,
  spaces: SPACES,
  createdAt: time(0),
  updatedAt: time(0),
  items: [MIXED_LINE, MAX_LINE].map((fields, index) => ({
    id: `won-item-${index + 1}`,
    ...fields,
    createdAt: time(index + 1),
    updatedAt: time(index + 1),
  })),
});

const fieldsOf = ({ id, createdAt, updatedAt, ...fields }: InteriorItem): InteriorItemInput => {
  void [id, createdAt, updatedAt];
  return fields;
};

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

const patchPlan = (user: TestUser, planId: string, plan: unknown) =>
  callApi(db, "PATCH", `/api/interior-plans/${planId}`, { cookie: user.cookie, body: { plan } });

/** `interior_plans.data` 원문(JSON). 응답이 아니라 저장된 키를 본다 */
const readPlanData = async (userId: string, id: string) => {
  const row = await db
    .prepare("SELECT data FROM interior_plans WHERE user_id = ? AND id = ?")
    .bind(userId, id)
    .first<{ data: string }>();
  return row === null ? null : (JSON.parse(row.data) as Record<string, unknown>);
};

let alice: TestUser;

beforeAll(async () => {
  await migrate(db);
});

beforeEach(async () => {
  await clearTables(db);
  alice = await createUser(db, "alice");
});

describe("새 키 왕복: 보낸 값과 GET이 같다(정규화 없음)", () => {
  it("/import 원 단위 계획 → 200 imported 1, GET이 보낸 계획과 같다", async () => {
    const response = await importPlan(alice, wonPlan());
    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({ imported: 1 });
    expect(await getPlans(alice)).toStrictEqual([wonPlan()]);
    expect(await readPlanData("alice", "plan-won")).toStrictEqual({
      name: "원 단위 집",
      budgetWon: 12_345_000,
      spaces: SPACES,
    });
  });

  it("계획 POST(budgetWon + 원 단위 항목) → 201, 응답과 GET이 같고 옛 키로 바뀌지 않는다", async () => {
    const response = await createPlan(alice, {
      name: "원 단위 집",
      budgetWon: 12_345_000,
      spaces: SPACES,
      items: [MIXED_LINE, MAX_LINE],
    });
    expect(response.status).toBe(201);
    const { plan } = (await response.json()) as { plan: InteriorPlanWithItems };
    expect(plan.budgetWon).toBe(12_345_000);
    expect(Object.hasOwn(plan, "budget")).toBe(false);
    expect(plan.items.map(fieldsOf)).toStrictEqual([MIXED_LINE, MAX_LINE]);
    expect(await getPlans(alice)).toStrictEqual([plan]);
  });

  it("항목 POST → 201, 형제 견적(wq2 만원)만 바꿔 PUT → 200, wq1·wq3의 amountWon이 그대로", async () => {
    expect((await importPlan(alice, { ...wonPlan(), items: [] })).status).toBe(200);
    const posted = await postItem(alice, "plan-won", MIXED_LINE);
    expect(posted.status).toBe(201);
    const { item } = (await posted.json()) as { item: InteriorItem };
    expect(fieldsOf((await getPlans(alice))[0].items[0])).toStrictEqual(MIXED_LINE);

    const edited: InteriorItemInput = {
      ...MIXED_LINE,
      quotes: MIXED_LINE.quotes!.map((quote) =>
        quote.id === "wq2" ? { ...quote, amount: 900 } : quote,
      ),
    };
    const put = await putItem(alice, "plan-won", item.id, edited);
    expect(put.status).toBe(200);
    expect(fieldsOf(((await put.json()) as { item: InteriorItem }).item)).toStrictEqual(edited);
    const [stored] = (await getPlans(alice))[0].items;
    expect(stored.quotes).toStrictEqual([
      { id: "wq1", vendor: "육문수", amountWon: 1_234_500 },
      { id: "wq2", vendor: "동네도배", amount: 900, memo: "합지" },
      { id: "wq3", vendor: "셀프시공", amountWon: 0 },
    ]);
  });
});

describe("PATCH 총 예산: 시작 상태 × 입력(qa Q6), 원문에서 지운 키는 아예 없다", () => {
  type Budgets = Pick<InteriorPlan, "budget" | "budgetWon">;

  const STATES: [string, Budgets][] = [
    ["S0(예산 없음)", {}],
    ["S1 { budget: 1000 }", { budget: 1000 }],
    ["S2 { budgetWon: 12345000 }", { budgetWon: 12_345_000 }],
  ];

  /** 입력과 기대 결과(예산 키). "keep"은 시작 상태 그대로 */
  const INPUTS: [string, Record<string, unknown>, Budgets | "keep"][] = [
    ["{ budget: 500 }", { budget: 500 }, { budget: 500 }],
    ["{ budget: null }", { budget: null }, {}],
    ["{ budgetWon: 5000000 }", { budgetWon: 5_000_000 }, { budgetWon: 5_000_000 }],
    ["{ budgetWon: null }", { budgetWon: null }, {}],
    ['{ name: "새 이름" }만', { name: "새 이름" }, "keep"],
    ["{ budget: 500, budgetWon: null }", { budget: 500, budgetWon: null }, { budget: 500 }],
    [
      "{ budget: null, budgetWon: 5000000 }",
      { budget: null, budgetWon: 5_000_000 },
      { budgetWon: 5_000_000 },
    ],
  ];

  const MATRIX = STATES.flatMap(([stateLabel, state]) =>
    INPUTS.map(
      ([inputLabel, input, expected]) => [stateLabel, inputLabel, state, input, expected] as const,
    ),
  );

  it.each(MATRIX)("%s × %s → 200", async (_, __, state, input, expected) => {
    const plan = { ...wonPlan(), budgetWon: undefined, ...state, items: [] };
    expect((await importPlan(alice, plan)).status).toBe(200);

    const response = await patchPlan(alice, "plan-won", input);
    expect(response.status).toBe(200);

    const budgets = expected === "keep" ? state : expected;
    const data = await readPlanData("alice", "plan-won");
    expect(data).toStrictEqual({
      name: typeof input.name === "string" ? input.name : "원 단위 집",
      ...budgets,
      spaces: SPACES,
    });
    expect(Object.hasOwn(data!, "budget")).toBe(budgets.budget !== undefined);
    expect(Object.hasOwn(data!, "budgetWon")).toBe(budgets.budgetWon !== undefined);

    const { plan: patched } = (await response.json()) as { plan: InteriorPlan };
    expect(patched).toStrictEqual({
      id: "plan-won",
      ...data,
      createdAt: time(0),
      updatedAt: patched.updatedAt,
    });
  });

  it.each([
    ["두 키 모두 숫자", { budget: 500, budgetWon: 5_000_000 }],
    ["두 키 모두 숫자(이름과 함께)", { name: "새 이름", budget: 500, budgetWon: 12_345_000 }],
    ["budgetWon 0", { budgetWon: 0 }],
    ["budgetWon 10_000_000_000_000", { budgetWon: 10_000_000_000_000 }],
    ['budgetWon "1"', { budgetWon: "1" }],
    ["budgetWon 1.5", { budgetWon: 1.5 }],
  ])("%s → 400 invalidParams, 바뀌지 않는다", async (_, input) => {
    expect((await importPlan(alice, { ...wonPlan(), items: [] })).status).toBe(200);
    const before = await snapshotPlans(db);
    const response = await patchPlan(alice, "plan-won", input);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalidParams" });
    expect(await snapshotPlans(db)).toStrictEqual(before);
  });

  it("두 키 모두 숫자 → 오류 메시지가 이유를 알려 준다", async () => {
    expect((await importPlan(alice, { ...wonPlan(), items: [] })).status).toBe(200);
    const response = await patchPlan(alice, "plan-won", { budget: 500, budgetWon: 5_000_000 });
    expect(await response.json()).toStrictEqual({
      error: "invalidParams",
      message: "budget과 budgetWon을 함께 숫자로 보낼 수 없습니다",
    });
  });
});

describe("같은 뜻의 두 키는 모든 쓰기 경로에서 400이고 아무것도 바뀌지 않는다", () => {
  const BOTH_QUOTE_LINE = {
    ...MIXED_LINE,
    quotes: [{ id: "wq1", vendor: "육문수", amount: 123, amountWon: 1_230_000 }],
    confirmedQuoteId: "wq1",
  };

  it("견적 amount·amountWon 함께: /import·계획 POST·항목 POST·PUT 400", async () => {
    expect((await importPlan(alice, wonPlan())).status).toBe(200);
    const before = await snapshotPlans(db);

    const badPlan = wonPlan();
    const responses = [
      await importPlan(alice, {
        ...badPlan,
        id: "plan-other",
        items: [{ ...badPlan.items[0], ...BOTH_QUOTE_LINE }],
      }),
      await createPlan(alice, { name: "새 집", spaces: SPACES, items: [BOTH_QUOTE_LINE] }),
      await postItem(alice, "plan-won", BOTH_QUOTE_LINE),
      await putItem(alice, "plan-won", "won-item-1", BOTH_QUOTE_LINE),
    ];
    for (const response of responses) {
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "invalidParams" });
    }
    expect(await snapshotPlans(db)).toStrictEqual(before);
  });

  it("플랜 budget·budgetWon 함께: /import·계획 POST 400", async () => {
    const before = await snapshotPlans(db);
    const both = { budget: 1000, budgetWon: 10_000_000 };
    const responses = [
      await importPlan(alice, { ...wonPlan(), ...both }),
      await createPlan(alice, { name: "새 집", spaces: SPACES, ...both }),
    ];
    for (const response of responses) {
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "invalidParams" });
    }
    expect(await snapshotPlans(db)).toStrictEqual(before);
  });
});
