// 스펙 interior-simple AC-0(c)·(e)(qa, ADR-032 조건 2): 새 화면이 만드는 쓰기 입력 전체가 서버(D1 하네스, 실제 마이그레이션 +
// Worker 진입점)를 그대로 통과하고, GET이 보낸 값과 같은 값을 돌려준다(서버가 알려진 키만 복사해도 지워지는 값이 없다).
// 입력은 `src/lib/utils/interiorLineWrites.ts`가 만드는 값과 같다 — 같은 모양을 `interiorLineWrites.test.ts`가
// toStrictEqual로 고정한다. server/·worker/는 `@/` 별칭을 못 쓰므로(tsconfig.worker.json) 그 값을 여기 그대로 적는다.
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { callApi, clearTables, createUser, migrate } from "../test/harness";

import type {
  InteriorItem,
  InteriorItemInput,
  InteriorItemStatus,
  InteriorPlanWithItems,
} from "../../src/lib/types/interiorPlan";
import type { TestUser } from "../test/harness";

const db = env.DB;

const time = (minute: number) => `2026-10-27T00:${String(minute).padStart(2, "0")}:00.000Z`;

/** 옛 계획 L의 X(스펙 "수용 기준", `src/test/interiorSimpleFixture.ts`의 legacyX와 같은 값) */
const X_FIELDS: InteriorItemInput = {
  spaceId: "s1",
  trade: "욕실",
  budget: 350,
  quotes: [
    { id: "q1", vendor: "하루바스", contact: "010-1234-5678", amount: 370, memo: "철거·방수" },
    { id: "q2", vendor: "욕실나라", amount: 400 },
  ],
  confirmedQuoteId: "q1",
  payments: [{ id: "pay-x1", label: "계약금", amount: 100, dueDate: "2026-11-01", isPaid: true }],
  status: "inProgress",
  startDate: "2026-11-03",
  endDate: "2026-11-07",
  memo: "폐기물 포함",
};

const Y_FIELDS: InteriorItemInput = {
  spaceId: "s0",
  trade: "도배",
  budget: 200,
  status: "planned",
};

const Z_FIELDS: InteriorItemInput = {
  spaceId: "s2",
  trade: "욕실",
  quotes: [{ id: "q3", vendor: "하루바스", amount: 250, memo: "타일 덧방" }],
  status: "quoting",
};

const withoutConfirm = ({ confirmedQuoteId, ...rest }: InteriorItemInput): InteriorItemInput => {
  void confirmedQuoteId;
  return rest;
};

const planL = (): InteriorPlanWithItems => ({
  id: "plan-l",
  name: "옛 계획",
  budget: 3000,
  spaces: [
    { id: "s0", name: "전체" },
    { id: "s1", name: "욕실1" },
    { id: "s2", name: "욕실2" },
  ],
  createdAt: time(0),
  updatedAt: time(0),
  items: [
    { id: "item-x", ...X_FIELDS, createdAt: time(1), updatedAt: time(1) },
    { id: "item-y", ...Y_FIELDS, createdAt: time(2), updatedAt: time(2) },
    { id: "item-z", ...Z_FIELDS, createdAt: time(3), updatedAt: time(3) },
  ],
});

/** 새 화면의 쓰기 입력(쓰기 규칙 표). 각 입력은 L을 막 가져온 상태의 그 항목에 대한 것이다 */
const L_WRITES: { name: string; itemId: string; input: InteriorItemInput }[] = [
  {
    name: "줄 수정 D2 a: 욕실나라 견적 400 → 380(X와 quotes[1].amount만 다르다)",
    itemId: "item-x",
    input: {
      ...X_FIELDS,
      quotes: [X_FIELDS.quotes![0], { id: "q2", vendor: "욕실나라", amount: 380 }],
    },
  },
  {
    name: "줄 수정(연락처 있는 q1): 업체·금액·세부내용 바꿔도 연락처 유지",
    itemId: "item-x",
    input: {
      ...X_FIELDS,
      quotes: [
        { id: "q1", vendor: "하루바스2", contact: "010-1234-5678", amount: 360, memo: "철거만" },
        X_FIELDS.quotes![1],
      ],
    },
  },
  {
    name: "견적 0개 Y 채우기: 예산·상태·공간 유지 + 견적 1개, memo·확정 키 없음",
    itemId: "item-y",
    input: {
      spaceId: "s0",
      trade: "도배",
      budget: 200,
      quotes: [{ id: "new-quote", vendor: "육문수", amount: 180 }],
      status: "planned",
    },
  },
  {
    name: "확정 켜기: 욕실나라 체크 → 확정이 q2로(상태 진행 중 그대로)",
    itemId: "item-x",
    input: { ...X_FIELDS, confirmedQuoteId: "q2" },
  },
  {
    name: "확정 끄기: 하루바스 철거·방수 해제 → confirmedQuoteId 키 없음",
    itemId: "item-x",
    input: withoutConfirm(X_FIELDS),
  },
  {
    name: "견적 n≥2 삭제(미확정 q2): q2만 빠짐, 확정 q1·지급·연락처 유지",
    itemId: "item-x",
    input: { ...X_FIELDS, quotes: [X_FIELDS.quotes![0]] },
  },
  {
    name: "견적 n≥2 삭제(확정 q1): quotes [q2], confirmedQuoteId 키 없음",
    itemId: "item-x",
    input: withoutConfirm({ ...X_FIELDS, quotes: [X_FIELDS.quotes![1]] }),
  },
  {
    name: "Z 확정 켜기(견적 중 그대로)",
    itemId: "item-z",
    input: { ...Z_FIELDS, confirmedQuoteId: "q3" },
  },
];

/** 예시 P의 줄 추가 입력(addLineInput: 첫 공간, 상태 계획, 비고 없음 → memo 키 없음) */
const P_LINES: InteriorItemInput[] = [
  ["rq1", "도배", "육문수", "실크 전체", 180, true],
  ["rq2", "도배", "동네도배", "합지", 150, false],
  ["rq3", "욕실", "하루바스", "철거·방수 (1)", 370, true],
  ["rq4", "욕실", "욕실나라", "철거·방수 (1)", 400, false],
  ["rq5", "욕실", "하루바스", "타일 덧방 (2)", 250, true],
].map(([quoteId, trade, vendor, memo, amount, isConfirmed]) => ({
  spaceId: "sp-whole",
  trade: trade as string,
  quotes: [
    {
      id: quoteId as string,
      vendor: vendor as string,
      amount: amount as number,
      memo: memo as string,
    },
  ],
  ...(isConfirmed === true && { confirmedQuoteId: quoteId as string }),
  status: "planned" as const,
}));

/** 모든 선택 키가 채워진 항목(AC-0(c) c3, `makeFullItem`과 같은 값) */
const fullItem = (status: InteriorItemStatus): InteriorItemInput => ({
  spaceId: "sp-whole",
  trade: "욕실",
  budget: 350,
  quotes: [
    { id: "fq1", vendor: "하루바스", contact: "010-1234-5678", amount: 370, memo: "철거·방수" },
    {
      id: "fq2",
      vendor: "욕실나라",
      contact: "02-123-4567",
      amountWon: 4_000_000,
      memo: "도기 포함",
    },
  ],
  confirmedQuoteId: "fq1",
  payments: [
    { id: "fp1", label: "계약금", amount: 100, dueDate: "2026-11-01", isPaid: true },
    { id: "fp2", label: "잔금", amount: 270, dueDate: "2026-11-20", isPaid: false },
  ],
  status,
  startDate: "2026-11-03",
  endDate: "2026-11-07",
  memo: "폐기물 포함",
});

const STATUSES: InteriorItemStatus[] = ["planned", "quoting", "confirmed", "inProgress", "done"];

const fieldsOf = ({ id, createdAt, updatedAt, ...fields }: InteriorItem): InteriorItemInput => {
  void [id, createdAt, updatedAt];
  return fields;
};

async function getPlans(user: TestUser) {
  const response = await callApi(db, "GET", "/api/interior-plans", { cookie: user.cookie });
  expect(response.status).toBe(200);
  return ((await response.json()) as { plans: InteriorPlanWithItems[] }).plans;
}

async function importPlan(user: TestUser, plan: InteriorPlanWithItems) {
  const response = await callApi(db, "POST", "/api/interior-plans/import", {
    cookie: user.cookie,
    body: { plan },
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ imported: 1 });
}

let alice: TestUser;

beforeAll(async () => {
  await migrate(db);
});

beforeEach(async () => {
  await clearTables(db);
  alice = await createUser(db, "alice");
});

describe("AC-0(e) 옛 계획 L: 가져온 값 그대로, 새 화면의 PUT 입력은 GET에서 같은 값", () => {
  it("import 뒤 GET은 L과 같다(숨은 지급·날짜·연락처·공간·예산 포함)", async () => {
    await importPlan(alice, planL());
    expect(await getPlans(alice)).toStrictEqual([planL()]);
  });

  it.each(L_WRITES)("$name", async ({ itemId, input }) => {
    await importPlan(alice, planL());
    const response = await callApi(db, "PUT", `/api/interior-plans/plan-l/items/${itemId}`, {
      cookie: alice.cookie,
      body: { item: input },
    });
    expect(response.status).toBe(200);
    const { item: returned } = (await response.json()) as { item: InteriorItem };
    expect(fieldsOf(returned)).toStrictEqual(input);

    const [plan] = await getPlans(alice);
    const stored = plan.items.find((item) => item.id === itemId)!;
    expect(fieldsOf(stored)).toStrictEqual(input);
    // 같은 자리·같은 만든 시각(PUT은 항목 전체 교체지만 id·createdAt은 그대로)
    const original = planL().items.find((item) => item.id === itemId)!;
    expect(stored.createdAt).toBe(original.createdAt);
    expect(plan.items.map((item) => item.id)).toEqual(["item-x", "item-y", "item-z"]);
    // 다른 항목은 그대로
    for (const other of planL().items.filter((item) => item.id !== itemId)) {
      expect(plan.items.find((item) => item.id === other.id)).toStrictEqual(other);
    }
  });

  it("타일 덧방 줄 삭제(Z 견적 1개) → DELETE 204, GET에 X·Y만", async () => {
    await importPlan(alice, planL());
    const response = await callApi(db, "DELETE", "/api/interior-plans/plan-l/items/item-z", {
      cookie: alice.cookie,
    });
    expect(response.status).toBe(204);
    const [plan] = await getPlans(alice);
    expect(plan.items).toStrictEqual(planL().items.slice(0, 2));
  });
});

describe("AC-0(c)·(e) 새 화면에서 만든 P와 모든 키 항목: POST/PUT 후 GET이 같은 값", () => {
  it("P: 계획 POST → 줄 추가 R1~R5 POST 201 → GET 순서·값 그대로(memo 키 없음, 확정 R1·R3·R5)", async () => {
    const created = await callApi(db, "POST", "/api/interior-plans", {
      cookie: alice.cookie,
      body: { plan: { name: "우리 집", budget: 1000, spaces: [{ id: "sp-whole", name: "전체" }] } },
    });
    expect(created.status).toBe(201);
    const { plan } = (await created.json()) as { plan: InteriorPlanWithItems };
    for (const input of P_LINES) {
      // 서버 순서는 ORDER BY created_at, id다. 같은 ms에 만든 항목은 무작위 id 순이 되므로(사람의 연속 [줄 추가]는
      // 1ms 안에 일어나지 않는다) 줄 추가 사이에 시각이 바뀌게 둔다
      await new Promise((resolve) => setTimeout(resolve, 3));
      const response = await callApi(db, "POST", `/api/interior-plans/${plan.id}/items`, {
        cookie: alice.cookie,
        body: { item: input },
      });
      expect(response.status).toBe(201);
    }
    const [stored] = await getPlans(alice);
    expect(stored.items.map(fieldsOf)).toStrictEqual(P_LINES);
    expect(stored.items.filter((item) => "confirmedQuoteId" in item)).toHaveLength(3);
    expect(stored.items.some((item) => "memo" in item)).toBe(false);
  });

  it.each(STATUSES)(
    "모든 키 항목(상태 %s) POST → GET 같은 값, 확정 켜기(fq2)·끄기 PUT도 같은 값",
    async (status) => {
      await importPlan(alice, { ...planL(), items: [] });
      const posted = await callApi(db, "POST", "/api/interior-plans/plan-l/items", {
        cookie: alice.cookie,
        body: { item: fullItem(status) },
      });
      expect(posted.status).toBe(201);
      const { item } = (await posted.json()) as { item: InteriorItem };
      expect(fieldsOf((await getPlans(alice))[0].items[0])).toStrictEqual(fullItem(status));

      for (const input of [
        { ...fullItem(status), confirmedQuoteId: "fq2" },
        withoutConfirm(fullItem(status)),
      ]) {
        const put = await callApi(db, "PUT", `/api/interior-plans/plan-l/items/${item.id}`, {
          cookie: alice.cookie,
          body: { item: input },
        });
        expect(put.status).toBe(200);
        expect(fieldsOf((await getPlans(alice))[0].items[0])).toStrictEqual(input);
      }
    },
  );
});
