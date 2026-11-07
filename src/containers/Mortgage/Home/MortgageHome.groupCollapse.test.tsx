// @vitest-environment jsdom
// 스펙 interior-group-collapse: 오른쪽 끝 화살표로 접고 펴기(AC-1)·제목 스페이스 들기→놓기 뒤 접힘 불변과 접힌 묶음 옮기기(AC-2)·
// 다시 마운트 복원(AC-3)·손상 원문(AC-4)·다른 키와 API 무변화(AC-7)·줄 저장 뒤 자동 펼침(AC-5·AC-6).
// 화살표를 꾹 눌러도 묶음이 들리지 않는지·VoiceOver 낭독·360px 모양은 사람 확인이다(합성 이벤트로 못 본다).
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { INTERIOR_COLLAPSED_GROUPS_STORAGE_KEY } from "@/lib/utils/interiorGroupCollapseStorage";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { PRIVACY_MODE_STORAGE_KEY } from "@/lib/utils/privacyModeStorage";
import { TEXT_SIZE_STORAGE_KEY } from "@/lib/utils/textSizeStorage";
import { createFakePlanApi } from "@/test/fakePlanApi";
import { toStoredPlans } from "@/test/interiorPlanFixture";
import { makeSimplePlanP, r1, r3, r4, r5 } from "@/test/interiorSimpleFixture";
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

/** 묶음 제목 = 묶음 끌기 손잡이(접히면 이름 뒤에 "· n줄"이 붙는다) */
const groupHandle = (trade: string) =>
  screen.getByRole("button", { name: new RegExp(`^${trade}( · \\d+줄)?$`) });

/** 제목 줄 오른쪽 끝 접기 화살표 */
const toggleButton = (trade: string) =>
  screen.getByRole("button", { name: `${trade} 접기/펼치기` });

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
  it("AC-1·AC-3: 제목을 눌러도 그대로, 화살표 클릭·엔터로 접고 펴고, 원문 {plan:[도배]}, 다시 마운트·[표]→[목록] 뒤에도 접혀 있다", async () => {
    const user = userEvent.setup();
    const storage = seedPlanP();
    const { unmount } = await renderLoggedOut(storage);

    await user.click(groupHandle("도배"));
    expect(toggleButton("도배")).toHaveAttribute("aria-expanded", "true");

    await user.click(toggleButton("도배"));
    const doBae = toggleButton("도배");
    expect(doBae).toHaveAttribute("aria-expanded", "false");
    expect(groupHandle("도배")).toHaveAccessibleName("도배 · 2줄");
    expect(document.getElementById(doBae.getAttribute("aria-controls") ?? "")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: R1 })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /도배에 줄 추가/ })).not.toBeInTheDocument();
    expect(toggleButton("욕실")).toHaveAttribute("aria-expanded", "true");
    expect(storage.getItem(INTERIOR_COLLAPSED_GROUPS_STORAGE_KEY)).toBe('{"plan-simple":["도배"]}');

    await user.click(screen.getByRole("radio", { name: "표" }));
    await user.click(screen.getByRole("radio", { name: "목록" }));
    expect(toggleButton("도배")).toHaveAttribute("aria-expanded", "false");

    unmount();
    await renderLoggedOut(storage);
    expect(toggleButton("도배")).toHaveAttribute("aria-expanded", "false");

    toggleButton("도배").focus();
    await user.keyboard("{Enter}");
    expect(toggleButton("도배")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: R1 })).toBeInTheDocument();
    expect(storage.getItem(INTERIOR_COLLAPSED_GROUPS_STORAGE_KEY)).toBe("{}");
  });

  it("AC-9: [모두 접기]는 펼친 묶음이 하나라도 있으면 모두 접고, 모두 접히면 [모두 펴기]로 바뀌어 모두 편다", async () => {
    const user = userEvent.setup();
    const storage = seedPlanP({
      [INTERIOR_COLLAPSED_GROUPS_STORAGE_KEY]: '{"plan-simple":["도배"]}',
    });
    await renderLoggedOut(storage);

    await user.click(screen.getByRole("button", { name: "모두 접기" }));
    expect(toggleButton("도배")).toHaveAttribute("aria-expanded", "false");
    expect(toggleButton("욕실")).toHaveAttribute("aria-expanded", "false");
    expect(JSON.parse(storage.getItem(INTERIOR_COLLAPSED_GROUPS_STORAGE_KEY) ?? "")).toStrictEqual({
      "plan-simple": ["도배", "욕실"],
    });

    await user.click(toggleButton("욕실"));
    expect(screen.getByRole("button", { name: "모두 접기" })).toBeInTheDocument();
    await user.click(toggleButton("욕실"));

    await user.click(screen.getByRole("button", { name: "모두 펴기" }));
    expect(toggleButton("도배")).toHaveAttribute("aria-expanded", "true");
    expect(toggleButton("욕실")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: R1 })).toBeInTheDocument();
    expect(storage.getItem(INTERIOR_COLLAPSED_GROUPS_STORAGE_KEY)).toBe("{}");
    expect(screen.getByRole("button", { name: "모두 접기" })).toBeInTheDocument();
  });

  it("AC-2: 제목에서 스페이스 들기 → 놓기 뒤 접힘이 그대로고, 화살표에서 스페이스는 들지 않고 접는다", async () => {
    const user = userEvent.setup();
    const storage = seedPlanP();
    await renderLoggedOut(storage);

    groupHandle("도배").focus();
    await user.keyboard(" ");
    expect(groupHandle("도배")).toHaveAttribute("aria-pressed", "true");
    expect(toggleButton("도배")).toHaveAttribute("aria-expanded", "true");
    await user.keyboard(" ");
    await waitFor(() => expect(groupHandle("도배")).not.toHaveAttribute("aria-pressed", "true"));
    expect(toggleButton("도배")).toHaveAttribute("aria-expanded", "true");

    toggleButton("욕실").focus();
    await user.keyboard(" ");
    expect(toggleButton("욕실")).toHaveAttribute("aria-expanded", "false");
    expect(groupHandle("욕실")).not.toHaveAttribute("aria-pressed", "true");
    groupHandle("욕실").focus();
    await user.keyboard(" ");
    expect(groupHandle("욕실")).toHaveAttribute("aria-pressed", "true");
    await user.keyboard(" ");
    await waitFor(() => expect(groupHandle("욕실")).not.toHaveAttribute("aria-pressed", "true"));
    expect(toggleButton("욕실")).toHaveAttribute("aria-expanded", "false");
  });

  it("AC-2: 접힌 욕실을 들면 뜬 묶음에 줄 글자가 없고, 위로 옮겨 놓으면 순서가 저장되고 접힘은 그대로다", async () => {
    const user = userEvent.setup();
    const storage = seedPlanP();
    await renderLoggedOut(storage);
    await user.click(toggleButton("욕실"));

    groupHandle("욕실").focus();
    await user.keyboard(" ");
    expect(groupHandle("욕실")).toHaveAttribute("aria-pressed", "true");
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
    const toggles = screen.getAllByRole("button", { name: /접기\/펼치기$/ });
    expect(toggles.map((toggle) => toggle.getAttribute("aria-expanded"))).toStrictEqual([
      "false",
      "true",
    ]);
    expect(toggles[0]).toHaveAccessibleName("욕실 접기/펼치기");
  });

  it("AC-4: 원문 {plan:[1,도배]}는 도배만 접힘이고 console.error가 없다", async () => {
    const consoleError = vi.spyOn(console, "error");
    await renderLoggedOut(
      seedPlanP({ [INTERIOR_COLLAPSED_GROUPS_STORAGE_KEY]: '{"plan-simple":[1,"도배"]}' }),
    );
    expect(toggleButton("도배")).toHaveAttribute("aria-expanded", "false");
    expect(toggleButton("욕실")).toHaveAttribute("aria-expanded", "true");
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
    await user.click(toggleButton("도배"));
    await user.click(toggleButton("욕실"));
    await user.click(toggleButton("도배"));

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

describe("줄 저장 뒤 자동 펼침 (U5)", () => {
  const collapsedRaw = (storage: Storage) => storage.getItem(INTERIOR_COLLAPSED_GROUPS_STORAGE_KEY);
  const tradeField = (dialog: HTMLElement) => within(dialog).getByLabelText("구분");

  async function saveAndClose(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  }

  it("AC-6: 도배를 접고 떠 있는 [+]로 도배 새 줄 저장 — 실패하면 접힌 그대로, 성공하면 펼쳐지고 새 줄이 보이며 원문에서 빠진다", async () => {
    const user = userEvent.setup();
    const storage = seedPlanP();
    await renderLoggedOut(storage);
    await user.click(toggleButton("도배"));

    await user.click(screen.getByRole("button", { name: "줄 추가" }));
    const dialog = screen.getByRole("dialog", { name: "줄 추가" });
    await user.type(tradeField(dialog), "도배");
    await user.type(within(dialog).getByLabelText("업체(비우면 미정)"), "가나도배");
    const setItem = storage.setItem.bind(storage);
    const failPlanWrite = vi.spyOn(storage, "setItem").mockImplementation((key, value) => {
      if (key === INTERIOR_PLANS_STORAGE_KEY) throw new Error("QuotaExceededError");
      setItem(key, value);
    });
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/^저장하지 못했습니다/);
    expect(toggleButton("도배")).toHaveAttribute("aria-expanded", "false");
    expect(collapsedRaw(storage)).toBe('{"plan-simple":["도배"]}');

    failPlanWrite.mockRestore();
    await saveAndClose(user, dialog);
    expect(toggleButton("도배")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /^도배 가나도배/ })).toBeInTheDocument();
    expect(collapsedRaw(storage)).toBe("{}");
  });

  it("AC-6: 고친 줄의 구분을 접힌 묶음(욕실)으로 바꿔 저장하면 욕실이 펼쳐지고 그 줄이 욕실에 보인다", async () => {
    const user = userEvent.setup();
    const storage = seedPlanP();
    await renderLoggedOut(storage);
    await user.click(toggleButton("욕실"));

    await user.click(screen.getByRole("button", { name: R1 }));
    const dialog = screen.getByRole("dialog", { name: "줄" });
    await user.clear(tradeField(dialog));
    await user.type(tradeField(dialog), "욕실");
    await saveAndClose(user, dialog);

    expect(toggleButton("욕실")).toHaveAttribute("aria-expanded", "true");
    expect(
      within(screen.getByRole("region", { name: "욕실" })).getByRole("button", {
        name: "욕실 육문수 실크 전체 열기",
      }),
    ).toBeInTheDocument();
    expect(collapsedRaw(storage)).toBe("{}");
  });

  it("AC-5: 줄 하나뿐인 도배를 벽지로 바꿔 저장하면 벽지는 펼침, 접힌 욕실은 그대로, 다음 접기 때 없는 구분은 원문에서 빠진다", async () => {
    // 접힌 묶음의 줄은 그려지지 않아 시트로 열 수 없다(U6). 지금 화면에 없는 구분은 원문에 남은 옛 이름(주방)으로 둔다.
    const user = userEvent.setup();
    const storage = createMemoryStorage({
      [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans([
        makeSimplePlanP({ items: [r1(), r3(), r4(), r5()] }),
      ]),
      [INTERIOR_COLLAPSED_GROUPS_STORAGE_KEY]: '{"plan-simple":["주방","욕실"]}',
    });
    await renderLoggedOut(storage);

    await user.click(screen.getByRole("button", { name: R1 }));
    const dialog = screen.getByRole("dialog", { name: "줄" });
    await user.clear(tradeField(dialog));
    await user.type(tradeField(dialog), "벽지");
    await saveAndClose(user, dialog);

    expect(screen.queryByRole("region", { name: "도배" })).not.toBeInTheDocument();
    expect(toggleButton("벽지")).toHaveAttribute("aria-expanded", "true");
    expect(toggleButton("욕실")).toHaveAttribute("aria-expanded", "false");

    await user.click(toggleButton("벽지"));
    expect(collapsedRaw(storage)).toBe('{"plan-simple":["욕실","벽지"]}');
  });
});
