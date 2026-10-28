// @vitest-environment jsdom
// 스펙 interior-vendor-tbd-line-order AC-0(a)(qa 태스크 1-0, ADR-036 조건 7): 기존 계획(P·L·옛 P·P⁺·M)의 우리 집 화면이
// 변경 전(f5ad2b0)과 같은지 리터럴 JSON 골든(`src/test/interiorPlanScreenGolden.f5ad2b0.json`)으로 본다.
// 골든은 f5ad2b0 코드로 한 번 만들었다. `lineOrder`가 없는 계획은 업체 미정·줄 끌기 뒤에도 목록 묶음·줄 순서·이름·체크,
// 요약, 표 칸, CSV 원문이 이 골든과 `toStrictEqual`이어야 한다(골든을 다시 만들지 않는다).
// 목록은 로그아웃(로컬)·로그인 혼자·가구 세 출처가 같은 골든이고, 읽기만으로는 쓰기가 0회다(AC-0(c)의 일부).
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { downloadTextFile } from "@/lib/utils/downloadTextFile";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { SESSION_HINT_STORAGE_KEY } from "@/lib/utils/sessionHintStorage";
import { createFakePlanApi } from "@/test/fakePlanApi";
import { makePlanP, toStoredPlans } from "@/test/interiorPlanFixture";
import { captureListGolden, captureTableGolden } from "@/test/interiorPlanScreenGolden";
import goldenText from "@/test/interiorPlanScreenGolden.f5ad2b0.json?raw";
import {
  makePlanL,
  makePlanM,
  makeSimplePlanP,
  makeSimplePlanPPlus,
} from "@/test/interiorSimpleFixture";
import { createMemoryStorage } from "@/test/memoryStorage";
import { renderWithQueryClient } from "@/test/renderWithQueryClient";

import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";

vi.mock("@/lib/utils/downloadTextFile", () => ({ downloadTextFile: vi.fn() }));

const download = vi.mocked(downloadTextFile);

type ScreenGolden = {
  baseCommit: string;
  plans: Record<string, { list: unknown; table: unknown; csv: { fileName: string; text: string } }>;
};

const GOLDEN = JSON.parse(goldenText) as ScreenGolden;

const PLANS: [name: string, make: () => InteriorPlanWithItems][] = [
  ["P", makeSimplePlanP],
  ["L", makePlanL],
  ["oldP", makePlanP],
  ["PPlus", makeSimplePlanPPlus],
  ["M", makePlanM],
];

/** 기기 날짜 2026-10-27 정오(로컬 생성자라 시간대와 무관) */
const OCT_27_NOON = new Date(2026, 9, 27, 12, 0, 0);

function stubLoggedOutApi() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const isMe = String(input) === "/api/me";
      return new Response(JSON.stringify(isMe ? { user: null } : { error: "notFound" }), {
        status: isMe ? 200 : 404,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}

/**
 * 로그아웃에서 읽기만 할 때 허용되는 저장소 쓰기. 로그인 흔적(session-hint)을 지우는 것은 기존 동작이다
 * (`AppRoutes.storageKeys.interiorSimple.test.tsx`의 허용 목록과 같다). 계획 원문 키에는 쓰지 않는다
 */
const LOGGED_OUT_READ_WRITES = [`removeItem ${SESSION_HINT_STORAGE_KEY}`];

/** 로그아웃: 그 계획 하나만 든 저장소로 연다. 저장소 쓰기("메서드 키 값")를 돌려주는 함수를 함께 준다 */
async function renderLoggedOut(plan: InteriorPlanWithItems, query = "") {
  stubLoggedOutApi();
  const storage = createMemoryStorage({ [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans([plan]) });
  const setItem = vi.spyOn(storage, "setItem");
  const removeItem = vi.spyOn(storage, "removeItem");
  const clear = vi.spyOn(storage, "clear");
  const writes = () => [
    ...setItem.mock.calls.map(([key, value]) => `setItem ${key} ${value}`),
    ...removeItem.mock.calls.map(([key]) => `removeItem ${key}`),
    ...clear.mock.calls.map(() => "clear"),
  ];
  window.location.hash = `#/home/${plan.id}${query}`;
  renderWithQueryClient(<AppRoutes storage={storage} />);
  await waitFor(() =>
    expect(screen.queryByText("인테리어 계획을 불러오는 중")).not.toBeInTheDocument(),
  );
  return { storage, writes };
}

/** 로그인(혼자 또는 가구): 서버에 그 계획 하나 */
async function renderLoggedIn(plan: InteriorPlanWithItems, isInHousehold: boolean) {
  const api = createFakePlanApi({ userId: "user-a", isInHousehold, plans: [plan] });
  window.location.hash = `#/home/${plan.id}`;
  render(<AppRoutes storage={createMemoryStorage({ [SESSION_HINT_STORAGE_KEY]: "1" })} />, {
    wrapper: api.wrapper,
  });
  await screen.findAllByRole("button", { name: / 열기$/ });
  return api;
}

beforeEach(() => {
  download.mockReset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(OCT_27_NOON);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("AC-0(a) 우리 집 화면 골든(f5ad2b0)", () => {
  it("골든은 f5ad2b0에서 만든 것이고 다섯 계획이 모두 있다", () => {
    expect(GOLDEN.baseCommit).toBe("f5ad2b0");
    expect(Object.keys(GOLDEN.plans)).toStrictEqual(PLANS.map(([name]) => name));
  });

  describe.each(PLANS)("%s", (name, make) => {
    it("로그아웃 목록: 묶음·줄 순서·이름·글자·체크·요약이 골든과 같고 계획 원문 쓰기 0회", async () => {
      const plan = make();
      const { storage, writes } = await renderLoggedOut(plan);
      expect(captureListGolden()).toStrictEqual(GOLDEN.plans[name].list);
      expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY) === toStoredPlans([plan])).toBe(true);
      expect(writes()).toStrictEqual(LOGGED_OUT_READ_WRITES);
    });

    it("로그인 혼자 목록이 같은 골든이고 쓰기 요청 0건", async () => {
      const api = await renderLoggedIn(make(), false);
      expect(captureListGolden()).toStrictEqual(GOLDEN.plans[name].list);
      expect(api.writes()).toStrictEqual([]);
    });

    it("가구 목록이 같은 골든이고 쓰기 요청 0건", async () => {
      const api = await renderLoggedIn(make(), true);
      expect(captureListGolden()).toStrictEqual(GOLDEN.plans[name].list);
      expect(api.writes()).toStrictEqual([]);
    });

    it("로그아웃 표·CSV 원문이 골든과 같고 계획 원문 쓰기 0회", async () => {
      const user = userEvent.setup();
      const plan = make();
      const { storage, writes } = await renderLoggedOut(plan, "?view=table");
      expect(captureTableGolden(`${plan.name} 인테리어 계획`)).toStrictEqual(
        GOLDEN.plans[name].table,
      );
      await user.click(screen.getByRole("button", { name: "CSV 내려받기" }));
      expect(download).toHaveBeenCalledTimes(1);
      const [fileName, text] = download.mock.calls[0];
      expect({ fileName, text }).toStrictEqual(GOLDEN.plans[name].csv);
      expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY) === toStoredPlans([plan])).toBe(true);
      expect(writes()).toStrictEqual(LOGGED_OUT_READ_WRITES);
    });
  });
});
