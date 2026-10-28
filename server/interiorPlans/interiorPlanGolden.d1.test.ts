/// <reference types="vite/client" />
// 스펙 interior-vendor-tbd-line-order AC-0(a)(qa 태스크 1-0, ADR-036 조건 7): 기존 계획 P·L·옛 P·P⁺·M을 서버(D1 하네스,
// 실제 마이그레이션 + Worker 진입점)에 `/import`로 옮긴 뒤 GET으로 받아도 로컬 파싱 골든과 같다.
// 입력과 기대값은 모두 f5ad2b0 코드로 만든 리터럴 JSON 골든(`src/test/interiorPlanGolden.f5ad2b0.json`)에서 읽는다
// (server/는 `@/` 별칭을 못 써 fixture 함수를 부를 수 없다). 골든은 다시 만들지 않는다.
// 골든에는 undefined 표식(`{ "$undefined": true }`)이 입력·파싱 결과에 없다(저장 원문은 JSON이라 undefined가 없다).
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import goldenText from "../../src/test/interiorPlanGolden.f5ad2b0.json?raw";
import { callApi, clearTables, createUser, migrate } from "../test/harness";

import type { InteriorPlanWithItems } from "../../src/lib/types/interiorPlan";
import type { TestUser } from "../test/harness";

const db = env.DB;

type PlanGolden = {
  input: InteriorPlanWithItems;
  parsed: { status: "ok"; plans: InteriorPlanWithItems[] };
};

const GOLDEN = JSON.parse(goldenText) as {
  baseCommit: string;
  plans: Record<string, PlanGolden>;
};

const PLAN_NAMES = ["P", "L", "oldP", "PPlus", "M"];

async function getPlans(user: TestUser) {
  const response = await callApi(db, "GET", "/api/interior-plans", { cookie: user.cookie });
  expect(response.status).toBe(200);
  return ((await response.json()) as { plans: unknown[] }).plans;
}

async function importPlan(user: TestUser, plan: InteriorPlanWithItems) {
  const response = await callApi(db, "POST", "/api/interior-plans/import", {
    cookie: user.cookie,
    body: { plan },
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toStrictEqual({ imported: 1 });
}

let alice: TestUser;

beforeAll(async () => {
  await migrate(db);
});

beforeEach(async () => {
  await clearTables(db);
  alice = await createUser(db, "alice");
});

describe("AC-0(a) 서버 GET = 기존 계획 골든(f5ad2b0)", () => {
  it("골든은 f5ad2b0에서 만든 것이고 다섯 계획이 모두 있다", () => {
    expect(GOLDEN.baseCommit).toBe("f5ad2b0");
    expect(Object.keys(GOLDEN.plans)).toStrictEqual(PLAN_NAMES);
    expect(goldenText.includes("$undefined")).toBe(true);
    for (const name of PLAN_NAMES) {
      expect(JSON.stringify(GOLDEN.plans[name].input)).not.toContain("$undefined");
      expect(JSON.stringify(GOLDEN.plans[name].parsed)).not.toContain("$undefined");
    }
  });

  it.each(PLAN_NAMES)(
    "%s: /import 뒤 GET이 로컬 파싱 골든과 같다(`lineOrder` 키 없음)",
    async (name) => {
      const { input, parsed } = GOLDEN.plans[name];
      await importPlan(alice, input);
      const plans = await getPlans(alice);
      expect(plans).toStrictEqual(parsed.plans);
      expect(Object.hasOwn(plans[0] as object, "lineOrder")).toBe(false);
    },
  );

  // 계획 상한은 3개이고 P와 P⁺는 같은 계획 id(plan-simple)라, id가 다른 세 계획으로 본다.
  it("세 계획(P·L·M)을 모두 옮기면 GET에 세 골든이 그대로 있다", async () => {
    const names = ["P", "L", "M"];
    for (const name of names) await importPlan(alice, GOLDEN.plans[name].input);
    const plans = await getPlans(alice);
    expect([...plans].sort(byId)).toStrictEqual(
      names.map((name) => GOLDEN.plans[name].parsed.plans[0]).sort(byId),
    );
  });
});

function byId(a: unknown, b: unknown) {
  return (a as { id: string }).id.localeCompare((b as { id: string }).id);
}
