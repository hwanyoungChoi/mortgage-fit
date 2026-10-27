// @vitest-environment jsdom
// 스펙 hub-account AC-2(fe): 카카오 로그인 결과(`#/?login=`)는 홈이 한 번 잡아 계정 자리 아래에 보이고 주소에서 지운다(replace).
// 저장 목록은 더 이상 `login`을 받지 않는다.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { createFakePlanApi } from "@/test/fakePlanApi";
import { createMemoryStorage } from "@/test/memoryStorage";

const LOGIN_MESSAGES = [
  "로그인하지 못했습니다. 다시 시도해 주세요",
  "로그인을 취소했습니다",
  "로그인을 준비 중입니다",
];

function renderApp(hash: string) {
  const storage = createMemoryStorage();
  const api = createFakePlanApi({ userId: null });
  window.location.hash = hash;
  const historyLength = window.history.length;
  const view = render(
    <StrictMode>
      <AppRoutes storage={storage} />
    </StrictMode>,
    { wrapper: api.wrapper },
  );
  return { historyLength, view, api, storage };
}

async function findHub() {
  expect(await screen.findByRole("heading", { level: 1, name: "홈" })).toBeInTheDocument();
  return screen.getByRole("main");
}

const tab = (name: string) =>
  within(screen.getByRole("navigation", { name: "화면" })).getByRole("link", { name });

/** 다음 매크로태스크까지 흘려 effect·응답 처리가 끝나게 한다 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("홈의 로그인 결과 안내 (hub-account AC-2)", () => {
  it.each([
    ["failed", "로그인하지 못했습니다. 다시 시도해 주세요"],
    ["cancelled", "로그인을 취소했습니다"],
    ["notConfigured", "로그인을 준비 중입니다"],
  ])(
    "#/?login=%s → 홈 안내 줄 한 번(StrictMode), 주소는 #/로 replace(이력 불변)",
    async (login, message) => {
      const { historyLength } = renderApp(`#/?login=${login}`);
      const hub = await findHub();

      const line = await within(hub).findByText(message);
      expect(line).toHaveAttribute("role", "status");
      expect(within(hub).getAllByText(message)).toHaveLength(1);
      await waitFor(() => expect(window.location.hash).toBe("#/"));
      expect(window.history.length).toBe(historyLength);
      // 계정 자리 아래, 카드 목록 앞
      expect(
        within(hub).getByRole("link", { name: "카카오로 로그인" }).compareDocumentPosition(line),
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(line.compareDocumentPosition(within(hub).getByRole("list"))).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    },
  );

  it("안내를 잡은 뒤 같은 해시 #/로 다시 마운트하면 안내가 없다(새로고침 재표시 없음)", async () => {
    const first = renderApp("#/?login=cancelled");
    await findHub();
    expect(await screen.findByText("로그인을 취소했습니다")).toBeInTheDocument();
    await waitFor(() => expect(window.location.hash).toBe("#/"));
    first.view.unmount();

    renderApp(window.location.hash);
    await findHub();
    await screen.findByRole("link", { name: "카카오로 로그인" });
    await settle();
    expect(screen.queryByText("로그인을 취소했습니다")).not.toBeInTheDocument();
  });

  it("[매물] → [홈]으로 돌아와도 안내가 다시 뜨지 않는다", async () => {
    const user = userEvent.setup();
    renderApp("#/?login=cancelled");
    await findHub();
    expect(await screen.findByText("로그인을 취소했습니다")).toBeInTheDocument();
    await waitFor(() => expect(window.location.hash).toBe("#/"));

    await user.click(tab("매물"));
    expect(await screen.findByRole("heading", { level: 1, name: "저장 목록" })).toBeInTheDocument();
    await user.click(tab("홈"));
    await findHub();
    await settle();

    expect(screen.queryByText("로그인을 취소했습니다")).not.toBeInTheDocument();
  });

  it("#/(login 없음, 로그인 성공 복귀)로 열면 로그인 안내 줄이 없다", async () => {
    renderApp("#/");
    const hub = await findHub();
    await within(hub).findByRole("link", { name: "카카오로 로그인" });
    await settle();

    for (const message of LOGIN_MESSAGES) expect(within(hub).queryByText(message)).toBeNull();
    expect(within(hub).queryByRole("status")).toBeNull();
  });

  it.each(["#/?login=constructor", "#/?login=FAILED", "#/?login="])(
    "%s는 안내 없이 #/",
    async (hash) => {
      renderApp(hash);
      const hub = await findHub();
      await waitFor(() => expect(window.location.hash).toBe("#/"));
      await settle();

      expect(within(hub).queryByRole("status")).toBeNull();
    },
  );

  it("#/listings?login=failed로 열면 저장 목록에 로그인 안내가 없고 주소는 #/listings", async () => {
    renderApp("#/listings?login=failed");
    expect(await screen.findByRole("heading", { level: 1, name: "저장 목록" })).toBeInTheDocument();
    await waitFor(() => expect(window.location.hash).toBe("#/listings"));
    await settle();

    for (const message of LOGIN_MESSAGES) expect(screen.queryByText(message)).toBeNull();
  });
});
