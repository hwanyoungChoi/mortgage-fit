// @vitest-environment jsdom
// 스펙 interior-group-collapse 태스크 1-3: 접고 펴기(AC-1)·스페이스 들기→놓기 뒤 aria-expanded 불변과 접힌 묶음 옮기기(AC-2)·
// 다시 마운트 복원(AC-3)·손상 원문(AC-4)·다른 키와 API 무변화(AC-7).
// 꾹 눌러 끈 뒤 click 억제·VoiceOver 낭독·360px 모양은 사람 확인이다(합성 이벤트로 못 본다).
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { INTERIOR_COLLAPSED_GROUPS_STORAGE_KEY } from "@/lib/utils/interiorGroupCollapseStorage";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { PRIVACY_MODE_STORAGE_KEY } from "@/lib/utils/privacyModeStorage";
import { TEXT_SIZE_STORAGE_KEY } from "@/lib/utils/textSizeStorage";
import { createFakePlanApi } from "@/test/fakePlanApi";
import { toStoredPlans } from "@/test/interiorPlanFixture";
import { makeSimplePlanP } from "@/test/interiorSimpleFixture";
import { createMemoryStorage } from "@/test/memoryStorage";
import { renderWithQueryClient } from "@/test/renderWithQueryClient";

import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";

const P_HASH = "#/home/plan-simple";
const R1 = "도배 육문수 실크 전체 열기";
const GROUP_HEIGHT = 200;

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
 * jsdom은 레이아웃이 없어 묶음 키보드 이동이 다음 자리를 못 찾는다. 묶음(section)을 문서 순서대로 세로로 쌓고,
 * 묶음 밖 요소(뜬 묶음)는 든 묶음(`aria-pressed="true"` 제목)의 자리를 준다.
 */
function stubGroupRects() {
  const original = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const section =
      this.closest("section") ??
      document.querySelector('[aria-pressed="true"]')?.closest("section");
    if (section === null || section === undefined) return DOMRect.fromRect();
    const index = Array.from(document.querySelectorAll("section")).indexOf(section);
    return DOMRect.fromRect({
      x: 0,
      y: 100 + index * GROUP_HEIGHT,
      width: 360,
      height: GROUP_HEIGHT,
    });
  };
  return () => {
    HTMLElement.prototype.getBoundingClientRect = original;
  };
}

const waitForPlans = () =>
  waitFor(() => expect(screen.queryByText("인테리어 계획을 불러오는 중")).not.toBeInTheDocument());

async function renderLoggedOut(storage: Storage) {
  stubLoggedOutApi();
  window.location.hash = P_HASH;
  const view = renderWithQueryClient(<AppRoutes storage={storage} />);
  await waitForPlans();
  return view;
}

const seedPlanP = (extra: Record<string, string> = {}) =>
  createMemoryStorage({
    [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans([makeSimplePlanP()]),
    ...extra,
  });

/** 묶음 제목 버튼(접히면 이름 뒤에 "· n줄"이 붙는다) */
const groupButton = (trade: string) =>
  screen.getByRole("button", { name: new RegExp(`^${trade}( · \\d+줄)?$`) });

const loanCalculatorKeys = (storage: Storage) => {
  const entries: [string, string | null][] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith("loan-calculator/")) entries.push([key, storage.getItem(key)]);
  }
  return Object.fromEntries(entries);
};

const storedLineOrder = (storage: Storage) =>
  (
    JSON.parse(storage.getItem(INTERIOR_PLANS_STORAGE_KEY) ?? "null") as {
      plans: InteriorPlanWithItems[];
    }
  ).plans[0].lineOrder;

let restoreRects: () => void;

beforeEach(() => {
  restoreRects = stubGroupRects();
});

afterEach(() => {
  restoreRects();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("묶음 접기·펼치기 (P: 도배 2줄, 욕실 3줄)", () => {
  it("AC-1·AC-3: 클릭·엔터로 접고 펴고, 원문 {plan:[도배]}, 다시 마운트·[표]→[목록] 뒤에도 접혀 있다", async () => {
    const user = userEvent.setup();
    const storage = seedPlanP();
    const { unmount } = await renderLoggedOut(storage);

    await user.click(groupButton("도배"));
    const doBae = groupButton("도배");
    expect(doBae).toHaveAttribute("aria-expanded", "false");
    expect(doBae).toHaveAccessibleName("도배 · 2줄");
    expect(document.getElementById(doBae.getAttribute("aria-controls") ?? "")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: R1 })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /도배에 줄 추가/ })).not.toBeInTheDocument();
    expect(groupButton("욕실")).toHaveAttribute("aria-expanded", "true");
    expect(storage.getItem(INTERIOR_COLLAPSED_GROUPS_STORAGE_KEY)).toBe('{"plan-simple":["도배"]}');

    await user.click(screen.getByRole("radio", { name: "표" }));
    await user.click(screen.getByRole("radio", { name: "목록" }));
    expect(groupButton("도배")).toHaveAttribute("aria-expanded", "false");

    unmount();
    await renderLoggedOut(storage);
    expect(groupButton("도배")).toHaveAttribute("aria-expanded", "false");

    groupButton("도배").focus();
    await user.keyboard("{Enter}");
    expect(groupButton("도배")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: R1 })).toBeInTheDocument();
    expect(storage.getItem(INTERIOR_COLLAPSED_GROUPS_STORAGE_KEY)).toBe("{}");
  });

  it("AC-2: 제목에서 스페이스 들기 → 스페이스 놓기 뒤 aria-expanded가 그대로다(펼침·접힘 모두)", async () => {
    const user = userEvent.setup();
    const storage = seedPlanP();
    await renderLoggedOut(storage);

    groupButton("도배").focus();
    await user.keyboard(" ");
    expect(groupButton("도배")).toHaveAttribute("aria-pressed", "true");
    expect(groupButton("도배")).toHaveAttribute("aria-expanded", "true");
    await user.keyboard(" ");
    await waitFor(() => expect(groupButton("도배")).not.toHaveAttribute("aria-pressed", "true"));
    expect(groupButton("도배")).toHaveAttribute("aria-expanded", "true");

    await user.click(groupButton("욕실"));
    groupButton("욕실").focus();
    await user.keyboard(" ");
    expect(groupButton("욕실")).toHaveAttribute("aria-pressed", "true");
    expect(groupButton("욕실")).toHaveAttribute("aria-expanded", "false");
    await user.keyboard(" ");
    await waitFor(() => expect(groupButton("욕실")).not.toHaveAttribute("aria-pressed", "true"));
    expect(groupButton("욕실")).toHaveAttribute("aria-expanded", "false");
  });

  it("AC-2: 접힌 욕실을 들면 뜬 묶음에 줄 글자가 없고, 위로 옮겨 놓으면 순서가 저장되고 접힘은 그대로다", async () => {
    const user = userEvent.setup();
    const storage = seedPlanP();
    await renderLoggedOut(storage);
    await user.click(groupButton("욕실"));

    groupButton("욕실").focus();
    await user.keyboard(" ");
    expect(groupButton("욕실")).toHaveAttribute("aria-pressed", "true");
    const lifted = document.querySelector('[class*="liftedGroup"]');
    expect(lifted).toHaveTextContent("욕실 · 3줄");
    expect(lifted).not.toHaveTextContent("하루바스");
    await user.keyboard("{ArrowUp}");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await user.keyboard(" ");

    await waitFor(() =>
      expect(storedLineOrder(storage)).toStrictEqual([
        "r3:rq3",
        "r4:rq4",
        "r5:rq5",
        "r1:rq1",
        "r2:rq2",
      ]),
    );
    const titles = screen.getAllByRole("button", { name: /^(도배|욕실)( · \d+줄)?$/ });
    expect(titles.map((title) => title.getAttribute("aria-expanded"))).toStrictEqual([
      "false",
      "true",
    ]);
    expect(titles[0]).toHaveAccessibleName("욕실 · 3줄");
  });

  it("AC-4: 원문 {plan:[1,도배]}는 도배만 접힘이고 console.error가 없다", async () => {
    const consoleError = vi.spyOn(console, "error");
    await renderLoggedOut(
      seedPlanP({ [INTERIOR_COLLAPSED_GROUPS_STORAGE_KEY]: '{"plan-simple":[1,"도배"]}' }),
    );
    expect(groupButton("도배")).toHaveAttribute("aria-expanded", "false");
    expect(groupButton("욕실")).toHaveAttribute("aria-expanded", "true");
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("AC-7(로그인): 접기·펴기 전후 loan-calculator/* 중 바뀐 키는 접힘 키 하나뿐이고 API 호출은 0건이다", async () => {
    const user = userEvent.setup();
    const api = createFakePlanApi({ userId: "u1", plans: [makeSimplePlanP()] });
    const storage = createMemoryStorage({
      [PRIVACY_MODE_STORAGE_KEY]: "true",
      [TEXT_SIZE_STORAGE_KEY]: "smallest",
      [INTERIOR_COLLAPSED_GROUPS_STORAGE_KEY]: '{"other-plan":["주방"]}',
    });
    window.location.hash = P_HASH;
    render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });
    await waitForPlans();
    await screen.findByRole("button", { name: R1 });

    const before = loanCalculatorKeys(storage);
    const callCount = api.server.calls.length;
    await user.click(groupButton("도배"));
    await user.click(groupButton("욕실"));
    await user.click(groupButton("도배"));

    expect(api.server.calls).toHaveLength(callCount);
    const after = loanCalculatorKeys(storage);
    const changedKeys = Object.keys({ ...before, ...after }).filter(
      (key) => before[key] !== after[key],
    );
    expect(changedKeys).toStrictEqual([INTERIOR_COLLAPSED_GROUPS_STORAGE_KEY]);
    expect(after[INTERIOR_COLLAPSED_GROUPS_STORAGE_KEY]).toBe(
      '{"other-plan":["주방"],"plan-simple":["욕실"]}',
    );
  });
});
