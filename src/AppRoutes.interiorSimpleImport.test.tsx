// @vitest-environment jsdom
// 스펙 interior-simple AC-0(e) 로그인 이전(qa, 시나리오 7): 로그아웃에서 새 화면으로 만든 P(옛 화면의 L도)는 로그인하면
// `/api/interior-plans/import` 본문이 저장된 계획과 같고, 서버 GET으로 받은 뒤 화면이 같은 줄·지출 예정을 보인다.
// 로컬 원문은 읽기만 한다(이전 기록 키만 쓴다). 옛 `useInteriorPlanImport.test`는 diff 0이라 새 파일로 둔다.
import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { INTERIOR_PLAN_IMPORTS_STORAGE_KEY } from "@/lib/utils/interiorPlanImportStorage";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { SESSION_HINT_STORAGE_KEY } from "@/lib/utils/sessionHintStorage";
import { createFakePlanApi } from "@/test/fakePlanApi";
import { makePlanL } from "@/test/interiorSimpleFixture";
import { createPlanPWithNewWrites, rawPlans } from "@/test/interiorSimpleStore";
import { createMemoryStorage } from "@/test/memoryStorage";

const IMPORT_PATH = "/api/interior-plans/import";
const USER_ID = "user-a";

const headlineValue = (label: string) =>
  within(screen.getByRole("region", { name: "요약" })).getByText(label).nextElementSibling
    ?.textContent;

/** 목록의 [확정 체크 이름, 체크 여부] (화면 순서) */
const checks = () =>
  screen
    .getAllByRole("checkbox", { name: / 확정$/ })
    .map((box) => [box.getAttribute("aria-label"), (box as HTMLInputElement).checked]);

/** 로그인 확인 → 이전 → 서버 GET → 화면. 이전 본문과 이전 뒤 GET 순서를 돌려준다 */
async function loginWith(storage: Storage) {
  const api = createFakePlanApi({ userId: USER_ID, plans: [] });
  const setItem = vi.spyOn(storage, "setItem");
  const removeItem = vi.spyOn(storage, "removeItem");
  window.location.hash = "#/home";
  render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });
  await waitFor(() => expect(api.callsTo("POST", IMPORT_PATH)).toHaveLength(1));
  return { api, setItem, removeItem };
}

/** 이전 요청 뒤에 계획 목록 GET이 있었다(화면은 서버 값을 그린다) */
function expectServerGetAfterImport(api: ReturnType<typeof createFakePlanApi>) {
  const calls = api.server.calls.map((call) => `${call.method} ${call.path}`);
  const importIndex = calls.indexOf(`POST ${IMPORT_PATH}`);
  expect(calls.slice(importIndex + 1)).toContain("GET /api/interior-plans");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("AC-0(e) 로그인 이전: 새 화면에서 만든 계획", () => {
  it("로그아웃에서 [줄 추가]로 만든 P → 로그인하면 import 본문 = 저장된 P, 서버 GET 뒤 5줄·R1·R3·R5 체크·지출 예정 800", async () => {
    const { storage, raw } = createPlanPWithNewWrites(
      createMemoryStorage({ [SESSION_HINT_STORAGE_KEY]: "1" }),
    );
    const [storedP] = rawPlans(raw);
    const { api, setItem, removeItem } = await loginWith(storage);

    expect(api.callsTo("POST", IMPORT_PATH).map((call) => call.body)).toStrictEqual([
      { plan: storedP },
    ]);
    expect(api.server.plans).toStrictEqual([storedP]);

    expect(
      await screen.findByRole("checkbox", { name: "도배 육문수 실크 전체 확정" }),
    ).toBeChecked();
    expectServerGetAfterImport(api);
    expect(checks()).toEqual([
      ["도배 육문수 실크 전체 확정", true],
      ["도배 동네도배 합지 확정", false],
      ["욕실 하루바스 철거·방수 (1) 확정", true],
      ["욕실 욕실나라 철거·방수 (1) 확정", false],
      ["욕실 하루바스 타일 덧방 (2) 확정", true],
    ]);
    expect(headlineValue("지출 예정")).toBe("8,000,000원");
    expect(headlineValue("남은 예산")).toBe("2,000,000원");

    // 로컬 계획 원문은 읽기만 했다(쓰기는 이전 기록과 session-hint뿐)
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY) === raw).toBe(true);
    expect(setItem.mock.calls.map(([key]) => key).toSorted()).toEqual(
      [INTERIOR_PLAN_IMPORTS_STORAGE_KEY, SESSION_HINT_STORAGE_KEY].toSorted(),
    );
    expect(removeItem).not.toHaveBeenCalled();
    expect(JSON.parse(storage.getItem(INTERIOR_PLAN_IMPORTS_STORAGE_KEY)!)).toEqual({
      [USER_ID]: [storedP.id],
    });
  });

  it("옛 화면에서 만든 L → 로그인하면 import 본문 = 저장된 L(숨은 값 그대로), 서버 GET 뒤 4줄·지출 예정 370 · 남은 예산 2,630", async () => {
    const raw = JSON.stringify({ plans: [makePlanL()] }, null, 2);
    const storage = createMemoryStorage({
      [INTERIOR_PLANS_STORAGE_KEY]: raw,
      [SESSION_HINT_STORAGE_KEY]: "1",
    });
    const { api } = await loginWith(storage);

    expect(api.callsTo("POST", IMPORT_PATH).map((call) => call.body)).toStrictEqual([
      { plan: makePlanL() },
    ]);
    expect(
      await screen.findByRole("checkbox", { name: "욕실 하루바스 철거·방수 확정" }),
    ).toBeChecked();
    expectServerGetAfterImport(api);
    expect(checks()).toEqual([
      ["욕실 하루바스 철거·방수 확정", true],
      ["욕실 욕실나라 확정", false],
      ["욕실 하루바스 타일 덧방 확정", false],
      ["도배 확정", false],
    ]);
    expect(headlineValue("지출 예정")).toBe("3,700,000원");
    expect(headlineValue("남은 예산")).toBe("26,300,000원");
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY) === raw).toBe(true);
  });
});
