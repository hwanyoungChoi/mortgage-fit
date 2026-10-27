// @vitest-environment jsdom
// qa 태스크 1(스펙 interior-tbd-amount "추가 요청" 뒤로 가기, ADR-017 개정): `AppRoutes.sheetBack.test`가 다루지 않은 주요 시트.
// - 우리 집 계획 관리(설정) 시트: 고친 것 없으면 뒤로 가기 = 닫기, 고친 이름이 있으면 같은 확인(취소 → 시트·입력·이력 남음).
// - 계획 관리 → [다른 계획 만들기]로 시트를 바꿔 열어도 이력 항목은 하나(뒤로 가기 한 번이면 시트가 닫힌다).
// - 계획 관리 → [이 계획 삭제]: #/home으로 replace, 시트 항목·지운 계획 주소가 이력에 남지 않는다.
// - 저장 목록([목록 공유] 시트)·계산 화면(실거래가 시트): 뒤로 가기는 시트만 닫고 그 화면에 머문다.
// 모두 열고 닫기만 하면 저장소 쓰기 0회이고, 다음 뒤로 가기는 들어오기 전 화면(홈)이다.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { LISTINGS_STORAGE_KEY } from "@/lib/utils/listingStorage";
import { toStoredPlans } from "@/test/interiorPlanFixture";
import { makeSimplePlanPPlus } from "@/test/interiorSimpleFixture";
import { makeListing } from "@/test/listingFixture";
import { createMemoryStorage } from "@/test/memoryStorage";
import { renderWithQueryClient } from "@/test/renderWithQueryClient";

const P_HASH = "#/home/plan-simple";

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

/** 홈(#/)에서 시작해 `hash`로 옮긴(push) 상태. 돌려주는 값은 그 시점 이력 길이·항목 상태 */
async function renderFromHub(storage: Storage, hash: string) {
  stubLoggedOutApi();
  window.location.hash = "#/";
  renderWithQueryClient(<AppRoutes storage={storage} />);
  await screen.findByRole("heading", { level: 1, name: "홈" });
  window.location.hash = hash;
  await waitFor(() => expect(window.location.hash).toBe(hash));
  return { length: window.history.length, state: window.history.state as unknown };
}

async function renderPlanPPlus() {
  const storage = createMemoryStorage({
    [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans([makeSimplePlanPPlus()]),
  });
  const history = await renderFromHub(storage, P_HASH);
  await screen.findByRole("heading", { level: 1, name: "우리 집" });
  const setItem = vi.spyOn(storage, "setItem");
  return { storage, history, setItem };
}

const expectBackAt = async (history: { state: unknown }) => {
  await waitFor(() => expect(window.history.state).toEqual(history.state));
};

const expectNextBackLeaves = async () => {
  window.history.back();
  await waitFor(() => expect(window.location.hash).toBe("#/"));
  expect(await screen.findByRole("heading", { level: 1, name: "홈" })).toBeInTheDocument();
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("우리 집 계획 관리 시트에서 뒤로 가기", () => {
  it("고친 것이 없으면 시트만 닫고 우리 집에 머문다(확인 없음), 포커스는 [계획 관리]로, 쓰기 0회", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm");
    const { history, setItem } = await renderPlanPPlus();
    const opener = screen.getByRole("button", { name: "계획 관리" });
    await user.click(opener);
    expect(screen.getByRole("dialog", { name: "계획 관리" })).toBeInTheDocument();
    expect(window.history.length).toBe(history.length + 1);

    window.history.back();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(confirm).not.toHaveBeenCalled();
    expect(window.location.hash).toBe(P_HASH);
    expect(screen.getByRole("heading", { level: 1, name: "우리 집" })).toBeInTheDocument();
    expect(opener).toHaveFocus();
    await expectBackAt(history);
    expect(setItem).not.toHaveBeenCalled();
    await expectNextBackLeaves();
  });

  it("이름을 고친 채 뒤로 가기 → [닫기]와 같은 확인. 취소면 시트·입력·이력이 남고, 확인이면 닫히고 쓰지 않는다", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { history, setItem } = await renderPlanPPlus();
    await user.click(screen.getByRole("button", { name: "계획 관리" }));
    const dialog = screen.getByRole("dialog", { name: "계획 관리" });
    await user.type(within(dialog).getByLabelText("계획 이름"), " 2");

    window.history.back();
    await waitFor(() => expect(confirm).toHaveBeenCalledWith("고친 내용을 버리고 닫을까요?"));
    expect(screen.getByRole("dialog", { name: "계획 관리" })).toBe(dialog);
    expect(within(dialog).getByLabelText("계획 이름")).toHaveValue("우리 집 2");
    expect(window.location.hash).toBe(P_HASH);
    expect(window.history.length).toBe(history.length + 1);
    expect(window.history.state).not.toEqual(history.state);

    confirm.mockReturnValue(true);
    window.history.back();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("heading", { level: 1, name: "우리 집" })).toBeInTheDocument();
    await expectBackAt(history);
    expect(setItem).not.toHaveBeenCalled();
    await expectNextBackLeaves();
  });

  it("[다른 계획 만들기]로 시트를 바꿔 열어도 이력 항목은 하나: 뒤로 가기 한 번에 만들기 시트가 닫히고 우리 집", async () => {
    const user = userEvent.setup();
    const { history, setItem } = await renderPlanPPlus();
    await user.click(screen.getByRole("button", { name: "계획 관리" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "계획 관리" })).getByRole("button", {
        name: "다른 계획 만들기",
      }),
    );
    expect(screen.getByRole("dialog", { name: "인테리어 계획 만들기" })).toBeInTheDocument();
    expect(window.history.length).toBe(history.length + 1);

    window.history.back();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(window.location.hash).toBe(P_HASH);
    expect(screen.getByRole("heading", { level: 1, name: "우리 집" })).toBeInTheDocument();
    await expectBackAt(history);
    expect(setItem).not.toHaveBeenCalled();
    await expectNextBackLeaves();
  });

  it("[이 계획 삭제] 확인 → #/home으로 바뀌고, 다음 뒤로 가기는 홈(지운 계획 주소·시트 항목이 남지 않음)", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { storage, history } = await renderPlanPPlus();
    await user.click(screen.getByRole("button", { name: "계획 관리" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "계획 관리" })).getByRole("button", {
        name: "이 계획 삭제",
      }),
    );
    await waitFor(() => expect(window.location.hash).toBe("#/home"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(JSON.parse(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)!)).toEqual({ plans: [] });
    expect(window.history.length).toBe(history.length + 1);
    await expectNextBackLeaves();
  });
});

describe("다른 화면의 시트도 뒤로 가기는 시트만 닫는다", () => {
  it("저장 목록 [목록 공유] 시트: 시트만 닫고 #/listings, 포커스는 [목록 공유]로, 쓰기 0회", async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorage({
      [LISTINGS_STORAGE_KEY]: JSON.stringify([makeListing({ id: "listing-1", name: "래미안 84" })]),
    });
    const history = await renderFromHub(storage, "#/listings");
    const setItem = vi.spyOn(storage, "setItem");
    const opener = await screen.findByRole("button", { name: "목록 공유" });
    await user.click(opener);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(window.history.length).toBe(history.length + 1);

    window.history.back();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(window.location.hash).toBe("#/listings");
    expect(screen.getByRole("button", { name: "목록 공유" })).toHaveFocus();
    await expectBackAt(history);
    expect(setItem).not.toHaveBeenCalled();
    await expectNextBackLeaves();
  });

  it("계산 화면 실거래가 시트: 시트만 닫고 #/calculator", async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorage();
    const history = await renderFromHub(storage, "#/calculator");
    await user.click(screen.getByRole("button", { name: "이 지역 실거래가 보기" }));
    expect(screen.getByRole("dialog", { name: "이 지역 실거래가" })).toBeInTheDocument();
    expect(window.history.length).toBe(history.length + 1);

    window.history.back();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(window.location.hash).toBe("#/calculator");
    await expectBackAt(history);
    await expectNextBackLeaves();
  });
});
