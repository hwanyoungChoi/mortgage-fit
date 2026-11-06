// 스펙 interior-budget-exclude AC-7(세 출처·함께 쓰기)의 실제 서버 왕복(Worker 진입점 + D1).
// 요약 값은 계획 하나의 순수 계산(interiorOffBudgetTotals.test.ts가 예시 E로 본다)이므로, 여기서는 서버를 거친 계획이
// 예시 E와 같은 값(`toStrictEqual`)인지 본다. 같으면 계산도 같다. 화면 연결은 MortgageHome.offBudgetSources.test.tsx.
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { callApi, clearTables, createUser, insertHousehold, migrate } from "../test/harness";

import type {
  InteriorItem,
  InteriorItemInput,
  InteriorPlanWithItems,
} from "../../src/lib/types/interiorPlan";
import type { TestUser } from "../test/harness";

const db = env.DB;

const time = (minute: number) => `2026-10-27T00:${String(minute).padStart(2, "0")}:00.000Z`;

/** src/test/interiorSimpleFixture.ts 예시 E와 같은 값(그 파일은 `@/` 별칭이라 서버 테스트 타입 검사가 못 읽는다) */
const row = (
  index: number,
  trade: string,
  vendor: string,
  memo: string,
  amount: number,
  { isConfirmed = false, isDone = false, isOffBudget = false } = {},
): InteriorItem => ({
  id: `r${index}`,
  spaceId: "sp-whole",
  trade,
  quotes: [{ id: `rq${index}`, vendor, amount, memo }],
  ...(isConfirmed && { confirmedQuoteId: `rq${index}` }),
  status: isDone ? "done" : "planned",
  ...(isOffBudget && { isOffBudget: true }),
  createdAt: time(index),
  updatedAt: time(index),
});

/** 예시 E: P에서 R3 [완료], R5 예산 외 + [완료]. 총 예산 1,000(만원) */
const makeOffBudgetPlanE = (): InteriorPlanWithItems => ({
  id: "plan-simple",
  name: "우리 집",
  budget: 1000,
  spaces: [{ id: "sp-whole", name: "전체" }],
  createdAt: time(0),
  updatedAt: time(0),
  items: [
    row(1, "도배", "육문수", "실크 전체", 180, { isConfirmed: true }),
    row(2, "도배", "동네도배", "합지", 150),
    row(3, "욕실", "하루바스", "철거·방수 (1)", 370, { isConfirmed: true, isDone: true }),
    row(4, "욕실", "욕실나라", "철거·방수 (1)", 400),
    row(5, "욕실", "하루바스", "타일 덧방 (2)", 250, {
      isConfirmed: true,
      isDone: true,
      isOffBudget: true,
    }),
  ],
});

const fieldsOf = ({ id, createdAt, updatedAt, ...fields }: InteriorItem): InteriorItemInput => {
  void [id, createdAt, updatedAt];
  return fields;
};

const withoutOffBudget = ({ isOffBudget, ...fields }: InteriorItemInput): InteriorItemInput => {
  void isOffBudget;
  return fields;
};

async function getPlans(user: TestUser) {
  const response = await callApi(db, "GET", "/api/interior-plans", { cookie: user.cookie });
  expect(response.status).toBe(200);
  return ((await response.json()) as { plans: InteriorPlanWithItems[] }).plans;
}

beforeAll(async () => {
  await migrate(db);
});

beforeEach(async () => {
  await clearTables(db);
});

describe("AC-7 서버 왕복", () => {
  it("로그아웃에서 만든 E를 /import → GET이 E와 같다(R5 isOffBudget: true, 나머지 키 없음)", async () => {
    const alice = await createUser(db, "alice");
    const response = await callApi(db, "POST", "/api/interior-plans/import", {
      cookie: alice.cookie,
      body: { plan: makeOffBudgetPlanE() },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({ imported: 1 });
    const plans = await getPlans(alice);
    expect(plans).toStrictEqual([makeOffBudgetPlanE()]);
    expect(plans[0].items.map((item) => Object.hasOwn(item, "isOffBudget"))).toStrictEqual([
      false,
      false,
      false,
      false,
      true,
    ]);
  });

  it("함께 쓰는 중: hb가 R5를 예산 외로 PUT → ha·hb 재조회 GET이 E 항목과 같다", async () => {
    await insertHousehold(db, "h1");
    const ha = await createUser(db, "ha", { householdId: "h1" });
    const hb = await createUser(db, "hb", { householdId: "h1" });
    const planE = makeOffBudgetPlanE();
    const itemsE = planE.items.map(fieldsOf);

    // ha가 E에서 예산 외만 뺀 계획(E0)을 만든다
    const created = await callApi(db, "POST", "/api/interior-plans", {
      cookie: ha.cookie,
      body: {
        plan: {
          name: planE.name,
          budget: planE.budget,
          spaces: planE.spaces,
          items: itemsE.map(withoutOffBudget),
        },
      },
    });
    expect(created.status).toBe(201);
    const { plan } = (await created.json()) as { plan: InteriorPlanWithItems };
    const r5Id = plan.items[4].id;

    // hb가 R5 [예산에 반영]을 끄고 저장(시트 저장 = 항목 전체 PUT)
    const put = await callApi(db, "PUT", `/api/interior-plans/${plan.id}/items/${r5Id}`, {
      cookie: hb.cookie,
      body: { item: itemsE[4] },
    });
    expect(put.status).toBe(200);

    for (const user of [ha, hb]) {
      const [seen] = await getPlans(user);
      expect(seen.budget).toBe(planE.budget);
      expect(seen.items.map(fieldsOf)).toStrictEqual(itemsE);
    }
  });
});
