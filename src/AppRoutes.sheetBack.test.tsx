// @vitest-environment jsdom
// 스펙 interior-tbd-amount "추가 요청" 버그: 시트에서 뒤로 가기는 시트를 닫고 그 화면에 머문다(우리 집 줄 시트에서 홈으로 가던 문제).
// 시트를 열면 같은 주소의 이력 항목이 하나 쌓이고(해시 그대로), [닫기]·Esc·저장으로 닫으면 그 항목을 되돌린다.
// 고친 내용이 있는 시트는 뒤로 가기에도 [닫기]와 같은 확인을 거친다. 열고 닫기만 하면 저장소 쓰기 0회(AC-0).
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { toStoredPlans } from "@/test/interiorPlanFixture";
import { makeSimplePlanP } from "@/test/interiorSimpleFixture";
import { createMemoryStorage } from "@/test/memoryStorage";
import { renderWithQueryClient } from "@/test/renderWithQueryClient";

const P_HASH = "#/home/plan-simple";
const LINE_NAME = "도배 동네도배 합지";

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
 * 홈(#/)에서 시작해 링크처럼 `hash`로 옮긴(push) 상태로 그린다. 뒤로 가기 한 번이면 홈이어야 한다.
 * 돌려주는 `history`는 그 시점의 이력 길이와 항목 상태(시트를 닫은 뒤 이 상태로 돌아와야 한다).
 */
async function renderAppFromHub(storage: Storage, hash: string) {
  stubLoggedOutApi();
  window.location.hash = "#/";
  renderWithQueryClient(<AppRoutes storage={storage} />);
  await screen.findByRole("heading", { level: 1, name: "홈" });
  window.location.hash = hash;
  await waitFor(() => expect(window.location.hash).toBe(hash));
  return { length: window.history.length, state: window.history.state as unknown };
}

async function renderPlanP() {
  const storage = createMemoryStorage({
    [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans([makeSimplePlanP()]),
  });
  const history = await renderAppFromHub(storage, P_HASH);
  await screen.findByRole("heading", { level: 1, name: "우리 집" });
  const setItem = vi.spyOn(storage, "setItem");
  return { storage, history, setItem };
}

const openLine = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: `${LINE_NAME} 열기` }));
  return screen.getByRole("dialog", { name: "줄" });
};

/** 시트가 쌓은 항목을 되돌려 연 때의 항목으로 왔다 */
const expectBackAt = async (history: { state: unknown }) => {
  await waitFor(() => expect(window.history.state).toEqual(history.state));
};

/** 남은 이력 항목이 없다: 뒤로 가기 한 번이면 들어오기 전 화면(홈)이다 */
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

describe("우리 집 줄 시트에서 뒤로 가기", () => {
  it("열면 이력이 하나 쌓이고(해시 그대로), 뒤로 가기는 시트만 닫고 우리 집에 머문다. 쓰기 0회", async () => {
    const user = userEvent.setup();
    const { history, setItem } = await renderPlanP();
    await openLine(user);
    expect(window.history.length).toBe(history.length + 1);
    expect(window.location.hash).toBe(P_HASH);

    window.history.back();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(window.location.hash).toBe(P_HASH);
    expect(screen.getByRole("heading", { level: 1, name: "우리 집" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `${LINE_NAME} 열기` })).toHaveFocus();
    await expectBackAt(history);
    expect(setItem).not.toHaveBeenCalled();
    await expectNextBackLeaves();
  });

  it("세부내용을 고친 채 뒤로 가기 → [닫기]와 같은 확인. 취소하면 시트·입력이 남고 이력도 다시 쌓인다, 확인하면 닫힌다", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { history, setItem } = await renderPlanP();
    const dialog = await openLine(user);
    await user.type(within(dialog).getByLabelText("세부내용(선택)"), " 추가");

    window.history.back();
    await waitFor(() => expect(confirm).toHaveBeenCalledWith("고친 내용을 버리고 닫을까요?"));
    expect(screen.getByRole("dialog", { name: "줄" })).toBe(dialog);
    expect(within(dialog).getByLabelText("세부내용(선택)")).toHaveValue("합지 추가");
    expect(window.location.hash).toBe(P_HASH);
    // 다시 쌓은 항목에 있다: 이력 길이는 연 때와 같고, 다음 뒤로 가기도 시트에서 멈춘다
    expect(window.history.length).toBe(history.length + 1);
    expect(window.history.state).not.toEqual(history.state);

    confirm.mockReturnValue(true);
    window.history.back();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(window.location.hash).toBe(P_HASH);
    await expectBackAt(history);
    expect(setItem).not.toHaveBeenCalled();
    await expectNextBackLeaves();
  });

  it.each([
    ["[닫기]", () => userEvent.click(within(screen.getByRole("dialog")).getByText("닫기"))],
    ["[취소]", () => userEvent.click(within(screen.getByRole("dialog")).getByText("취소"))],
    ["Esc", () => fireEvent.keyDown(document, { key: "Escape" })],
  ])(
    "%s로 닫으면 쌓은 이력을 되돌린다: 다시 열고 닫아도 이력이 늘지 않고, 다음 뒤로 가기는 들어오기 전 화면",
    async (_label, closeSheet) => {
      const user = userEvent.setup();
      const { history, setItem } = await renderPlanP();
      for (let round = 0; round < 3; round += 1) {
        await openLine(user);
        expect(window.history.length).toBe(history.length + 1);
        await closeSheet();
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        await expectBackAt(history);
      }
      expect(window.history.length).toBe(history.length + 1);
      expect(window.location.hash).toBe(P_HASH);
      expect(setItem).not.toHaveBeenCalled();
      await expectNextBackLeaves();
    },
  );

  it("저장으로 닫아도 이력을 되돌린다(쓰기 1회)", async () => {
    const user = userEvent.setup();
    const { history, setItem } = await renderPlanP();
    const dialog = await openLine(user);
    await user.type(within(dialog).getByLabelText("세부내용(선택)"), " 추가");
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await expectBackAt(history);
    expect(setItem).toHaveBeenCalledTimes(1);
    await expectNextBackLeaves();
  });
});

describe("다른 시트도 같게 동작한다", () => {
  it("계획 만들기: 만든 뒤 #/home/{id}로 replace, 만들기 전 #/home·시트 항목이 이력에 남지 않는다", async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorage();
    await renderAppFromHub(storage, "#/home");
    await user.click(await screen.findByRole("button", { name: "계획 만들기" }));
    const dialog = screen.getByRole("dialog", { name: "인테리어 계획 만들기" });
    await user.type(within(dialog).getByLabelText("계획 이름"), "새 집");
    await user.click(within(dialog).getByRole("button", { name: "만들기" }));
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/home\/[0-9a-f]{32}$/));
    expect(await screen.findByRole("heading", { level: 1, name: "새 집" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await expectNextBackLeaves();
  });

  it("글자 크기 시트(머리 줄): 뒤로 가기는 시트만 닫고 계산 화면에 머문다", async () => {
    const storage = createMemoryStorage();
    const history = await renderAppFromHub(storage, "#/calculator");
    const setItem = vi.spyOn(storage, "setItem");
    await userEvent.click(screen.getByRole("button", { name: "글자 크기" }));
    expect(screen.getByRole("dialog", { name: "글자 크기" })).toBeInTheDocument();
    expect(window.history.length).toBe(history.length + 1);

    window.history.back();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(window.location.hash).toBe("#/calculator");
    expect(screen.getByRole("button", { name: "글자 크기" })).toHaveFocus();
    await expectBackAt(history);
    expect(setItem).not.toHaveBeenCalled();
    await expectNextBackLeaves();
  });

  it("계산 화면 시트(스크린샷으로 채우기): 뒤로 가기는 시트만 닫는다, [닫기]는 이력을 되돌린다", async () => {
    const storage = createMemoryStorage();
    const history = await renderAppFromHub(storage, "#/calculator");
    const open = () => userEvent.click(screen.getByRole("button", { name: "스크린샷으로 채우기" }));
    await open();
    expect(window.history.length).toBe(history.length + 1);
    window.history.back();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(window.location.hash).toBe("#/calculator");
    await expectBackAt(history);

    await open();
    await userEvent.click(within(screen.getByRole("dialog")).getByText("닫기"));
    await expectBackAt(history);
    expect(window.history.length).toBe(history.length + 1);
    await expectNextBackLeaves();
  });
});
