// @vitest-environment jsdom
// 스펙 platform-home AC-5: 홈 — 데이터 없음(빈 저장소, 로그아웃, #/). 카드 3개 순서·주소·소개 문구(aria-describedby),
// 순번·단계 표시 없음(판정식), 카드는 push, [매물 모으기]는 저장 목록을 맨 위에서 시작.
// "대출 계산 카드가 가장 크다"는 jsdom이 레이아웃을 계산하지 않아 리드 화면 확인(태스크 1-3)으로 판정한다.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { LISTINGS_STORAGE_KEY } from "@/lib/utils/listingStorage";
import { createFakePlanApi } from "@/test/fakePlanApi";
import { makeListing } from "@/test/listingFixture";
import { createMemoryStorage } from "@/test/memoryStorage";

const CARDS = [
  ["대출 계산", "#/calculator", "매매가와 KB시세로 예상 한도와 필요한 자기자금을 계산합니다"],
  ["매물 모으기", "#/listings", "본 매물을 저장해 자기자금·추가 비용을 비교합니다"],
  ["우리 집 인테리어", "#/home", "공정별 업체 견적을 모아 확정한 금액을 예산과 비교합니다"],
] as const;

function renderApp(hash: string, seed: Record<string, string> = {}) {
  const storage = createMemoryStorage(seed);
  const api = createFakePlanApi({ userId: null });
  window.location.hash = hash;
  render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });
  return { storage };
}

async function findHub() {
  expect(await screen.findByRole("heading", { level: 1, name: "홈" })).toBeInTheDocument();
  return screen.getByRole("main");
}

/** jsdom의 scrollY는 늘 0이다. 브라우저처럼 scrollTo가 scrollY를 바꾸게 한다 */
function setScrollY(y: number) {
  Object.defineProperty(window, "scrollY", { value: y, configurable: true, writable: true });
}

function mockBrowserScroll() {
  return vi.spyOn(window, "scrollTo").mockImplementation(((x: number, y: number) => {
    void x;
    setScrollY(y);
  }) as typeof window.scrollTo);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setScrollY(0);
  window.location.hash = "#/";
});

describe("홈 — 데이터 없음 (AC-5)", () => {
  it("h1 홈, 카드 링크는 DOM 순서대로 대출 계산 → 매물 모으기 → 우리 집 인테리어, 소개 문구는 설명으로 읽힌다", async () => {
    renderApp("#/");
    const hub = await findHub();
    // 계정 확인(/api/me) 전에는 요약 줄이 "불러오는 중"이다(AC-7 4행). 로그아웃이 확인된 뒤 소개 문구가 된다.
    await waitFor(() => expect(hub.querySelector('[aria-busy="true"]')).toBeNull());

    const links = within(hub).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(CARDS.map(([, href]) => href));
    for (const [index, [name, href, description]] of CARDS.entries()) {
      const link = within(hub).getByRole("link", { name });
      expect(link).toBe(links[index]);
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveAccessibleName(name);
      expect(link).toHaveAccessibleDescription(description);
    }
  });

  it("순번·단계·완료·잠김·준비 중 표시가 없다 (판정식)", async () => {
    renderApp("#/");
    const hub = await findHub();

    expect(hub.querySelector("ol")).toBeNull();
    for (const [name] of CARDS) {
      const link = within(hub).getByRole("link", { name });
      expect(link.textContent).not.toMatch(/^\s*\d+[.)]/);
      // 카드 제목(링크 이름)도
      expect(name).not.toMatch(/^\s*\d+[.)]/);
    }
    expect(hub.textContent).not.toMatch(/단계|완료|잠김|준비 중/);
  });

  it("카드 [대출 계산]은 push(이력 +1)이고 뒤로 가기로 #/ 홈에 돌아온다", async () => {
    const user = userEvent.setup();
    renderApp("#/");
    const hub = await findHub();
    const historyLength = window.history.length;

    await user.click(within(hub).getByRole("link", { name: "대출 계산" }));
    expect(await screen.findByLabelText("매매가")).toBeInTheDocument();
    expect(window.location.hash).toBe("#/calculator");
    expect(window.history.length).toBe(historyLength + 1);

    window.history.back();
    await waitFor(() => expect(window.location.hash).toBe("#/"));
    expect(await screen.findByRole("heading", { level: 1, name: "홈" })).toBeInTheDocument();
  });

  it("카드 [매물 모으기]·[우리 집 인테리어]도 push다", async () => {
    const user = userEvent.setup();
    renderApp("#/");
    for (const [name, href] of [
      ["매물 모으기", "#/listings"],
      ["우리 집 인테리어", "#/home"],
    ]) {
      // 뒤로 가기 뒤의 push는 앞쪽 이력을 잘라 길이가 그대로이므로, 매번 이력 끝(새 항목)에서 홈을 연다
      window.location.hash = "#/calculator";
      await screen.findByLabelText("매매가");
      await user.click(
        within(screen.getByRole("navigation", { name: "화면" })).getByRole("link", { name: "홈" }),
      );
      const hub = await findHub();
      const historyLength = window.history.length;
      await user.click(within(hub).getByRole("link", { name }));
      await waitFor(() => expect(window.location.hash).toBe(href));
      expect(window.history.length).toBe(historyLength + 1);
      window.history.back();
      await waitFor(() => expect(window.location.hash).toBe("#/"));
    }
  });

  it("저장 목록을 스크롤한 뒤 홈으로 와도 카드 [매물 모으기]로 가면 맨 위에서 시작한다(scrollTo(0, 0))", async () => {
    const user = userEvent.setup();
    renderApp("#/listings", {
      [LISTINGS_STORAGE_KEY]: JSON.stringify([makeListing({ name: "래미안 84" })]),
    });
    const scrollTo = mockBrowserScroll();
    expect(await screen.findByRole("list", { name: "저장한 매물 1개" })).toBeInTheDocument();

    // 목록을 1500까지 내린 채 탭 [홈]으로 떠난다(목록이 위치를 저장한다)
    setScrollY(1500);
    await user.click(
      within(screen.getByRole("navigation", { name: "화면" })).getByRole("link", { name: "홈" }),
    );
    const hub = await findHub();

    scrollTo.mockClear();
    await user.click(within(hub).getByRole("link", { name: "매물 모으기" }));
    expect(await screen.findByRole("list", { name: "저장한 매물 1개" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#/listings");
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
    expect(window.scrollY).toBe(0);
  });
});
