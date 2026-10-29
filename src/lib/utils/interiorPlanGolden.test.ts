// 스펙 interior-vendor-tbd-line-order AC-0(a)(qa 태스크 1-0, ADR-036 조건 7): 기존 계획 P·L·옛 P(`makePlanP`)·P⁺·M이
// 변경 전(f5ad2b0)과 같게 읽히는지 리터럴 JSON 골든(`src/test/interiorPlanGolden.f5ad2b0.json`)으로 본다.
// 골든은 f5ad2b0 코드로 한 번 만들었다. 업체 미정·`lineOrder`가 들어온 뒤에도 `lineOrder` 없는 계획은
// 파싱 결과(`lineOrder` 키 없음·`vendor` 그대로)·묶음·줄 순서·표·CSV 행·요약·표 머리가 이 골든과 `toStrictEqual`이어야 한다.
// 기대값을 다시 만들지 않는다(변경 후 코드로 만들면 순환이 된다). undefined 자리는 `toGoldenJson`의 표식으로 비교한다.
import { describe, expect, it } from "vitest";

import { makePlanP, toStoredPlans } from "@/test/interiorPlanFixture";
import {
  projectRows,
  projectTableWithoutVendor,
  toGoldenJson,
  UNDEFINED_MARK,
} from "@/test/interiorPlanGolden";
import goldenText from "@/test/interiorPlanGolden.f5ad2b0.json?raw";
import goldenScreenText from "@/test/interiorPlanScreenGolden.f5ad2b0.json?raw";
import {
  makePlanL,
  makePlanM,
  makeSimplePlanP,
  makeSimplePlanPPlus,
} from "@/test/interiorSimpleFixture";

import { buildInteriorPlanTable } from "./buildInteriorPlanTable";
import { interiorPlanExportFileName, interiorPlanTableHeading } from "./interiorPlanExportText";
import { buildInteriorPlanRows, summarizeInteriorPlan } from "./interiorPlanRows";
import { parseInteriorPlans } from "./interiorPlanStorage";
import { interiorPlanTableToCsvRows } from "./interiorPlanTableToCsvRows";

import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";

type PlanGolden = {
  input: unknown;
  parsed: unknown;
  rows: unknown;
  tableWithoutVendor: unknown;
  csvRows: unknown;
  summary: unknown;
  tableHeading: unknown;
};

const GOLDEN = JSON.parse(goldenText) as { baseCommit: string; plans: Record<string, PlanGolden> };
const SCREEN_GOLDEN = JSON.parse(goldenScreenText) as {
  plans: Record<string, { csv: { fileName: string; text: string } }>;
};

const PLANS: [name: string, make: () => InteriorPlanWithItems][] = [
  ["P", makeSimplePlanP],
  ["L", makePlanL],
  ["oldP", makePlanP],
  ["PPlus", makeSimplePlanPPlus],
  ["M", makePlanM],
];

const TODAY = "2026-10-28";

describe("AC-0(a) 기존 계획 골든(f5ad2b0)", () => {
  it("골든은 f5ad2b0에서 만든 것이고 다섯 계획이 모두 있다", () => {
    expect(GOLDEN.baseCommit).toBe("f5ad2b0");
    expect(Object.keys(GOLDEN.plans)).toStrictEqual(PLANS.map(([name]) => name));
  });

  it("표식 변환: undefined 값인 키와 키 없음이 서로 다르게 적힌다(골든이 `vendor: undefined`를 잡는다)", () => {
    expect(toGoldenJson({ vendor: undefined })).toStrictEqual({ vendor: UNDEFINED_MARK });
    expect(toGoldenJson({})).toStrictEqual({});
    expect(toGoldenJson({ vendor: undefined })).not.toStrictEqual(toGoldenJson({}));
    expect(toGoldenJson([undefined, null])).toStrictEqual([UNDEFINED_MARK, null]);
  });

  describe.each(PLANS)("%s", (name, make) => {
    const golden = () => GOLDEN.plans[name];

    it("fixture가 골든을 만든 입력 그대로다(fixture는 추가만 한다)", () => {
      expect(toGoldenJson(make())).toStrictEqual(golden().input);
    });

    it("parseInteriorPlans(원문) = 골든: `lineOrder` 키가 없고 견적 `vendor`가 그대로", () => {
      const snapshot = parseInteriorPlans(toStoredPlans([make()]));
      expect(toGoldenJson(snapshot)).toStrictEqual(golden().parsed);
      if (snapshot.status !== "ok") throw new Error(snapshot.status);
      expect(Object.hasOwn(snapshot.plans[0], "lineOrder")).toBe(false);
    });

    it("들여쓴 JSON 원문도 같은 골든", () => {
      const indented = JSON.stringify({ plans: [make()] }, null, 2);
      expect(toGoldenJson(parseInteriorPlans(indented))).toStrictEqual(golden().parsed);
    });

    it("목록 묶음·줄 순서·줄 값·지출 예정·미정 건수 = 골든", () => {
      expect(toGoldenJson(projectRows(make()))).toStrictEqual(golden().rows);
    });

    it("표 모델(업체 칸 제외) = 골든", () => {
      expect(toGoldenJson(projectTableWithoutVendor(make()))).toStrictEqual(
        golden().tableWithoutVendor,
      );
    });

    it("CSV 행(업체 칸 포함 글자) = 골든", () => {
      const table = buildInteriorPlanTable(buildInteriorPlanRows(make()));
      expect(toGoldenJson(interiorPlanTableToCsvRows(table))).toStrictEqual(golden().csvRows);
    });

    it("요약·표 머리 = 골든", () => {
      const plan = make();
      const summary = summarizeInteriorPlan(plan);
      // 지출 완료는 f5ad2b0 뒤에 더한 값이다. [완료] 줄이 없는 기존 계획은 0이고 나머지는 골든 그대로
      const { doneTotalWon, doneCount, ...goldenFields } = summary;
      expect([doneTotalWon, doneCount]).toStrictEqual([0, 0]);
      expect(toGoldenJson(goldenFields)).toStrictEqual(golden().summary);
      expect(toGoldenJson(interiorPlanTableHeading(plan.name, summary, TODAY))).toStrictEqual(
        golden().tableHeading,
      );
    });

    it("화면 골든의 CSV 파일 이름이 같은 계획 이름에서 나온다(두 골든이 같은 입력)", () => {
      expect(SCREEN_GOLDEN.plans[name].csv.fileName).toBe(
        interiorPlanExportFileName(make().name, "2026-10-27"),
      );
    });
  });

  // 계획 상한은 3개이고 P와 P⁺는 같은 계획 id(plan-simple)라, id가 다른 세 계획을 한 원문에 담는다.
  it("세 계획(P·L·M)을 한 원문에 담아도 계획마다 같은 골든이고 순서도 그대로", () => {
    const plans = PLANS.filter(([name]) => ["P", "L", "M"].includes(name));
    const snapshot = parseInteriorPlans(toStoredPlans(plans.map(([, make]) => make())));
    expect(toGoldenJson(snapshot)).toStrictEqual({
      status: "ok",
      plans: plans.map(([name]) => (GOLDEN.plans[name].parsed as { plans: unknown[] }).plans[0]),
    });
  });
});
