// @vitest-environment jsdom
// 스펙 interior-simple 화면 "플랜 화면": AC-1(목록·요약·경계·가리기)·AC-2(e)(상한)·AC-3(확정 토글)·AC-4(옛 계획 L 보이기, 확정 옮김).
// 로그아웃(로컬 스토어)과 로그인(서버 출처)을 같이 본다. 줄 시트는 MortgageHome.lineSheet.test.tsx.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { PRIVACY_MODE_STORAGE_KEY } from "@/lib/utils/privacyModeStorage";
import { SESSION_HINT_STORAGE_KEY } from "@/lib/utils/sessionHintStorage";
import { createFakePlanApi, errorResponse } from "@/test/fakePlanApi";
import { toStoredPlans } from "@/test/interiorPlanFixture";
import {
  legacyX,
  makePlanL,
  makeSimplePlanP,
  r1,
  r4,
  simpleTime,
} from "@/test/interiorSimpleFixture";
import { createMemoryStorage } from "@/test/memoryStorage";
import { renderWithQueryClient } from "@/test/renderWithQueryClient";

import type {
  InteriorItem,
  InteriorItemStatus,
  InteriorPlanWithItems,
} from "@/lib/types/interiorPlan";

const P_HASH = "#/home/plan-simple";
const L_HASH = "#/home/plan-l";

const R1_CHECK = "도배 육문수 실크 전체 확정";
const R4_CHECK = "욕실 욕실나라 철거·방수 (1) 확정";
const X_Q1_CHECK = "욕실 하루바스 철거·방수 확정";
const X_Q2_CHECK = "욕실 욕실나라 확정";

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

const storageWith = (plans: InteriorPlanWithItems[], extra: Record<string, string> = {}) =>
  createMemoryStorage({ [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans(plans), ...extra });

/** 로그아웃 확인이 끝나 플랜 화면이 보일 때까지 기다린다 */
async function renderLoggedOut(storage: Storage, hash = P_HASH) {
  stubLoggedOutApi();
  window.location.hash = hash;
  const result = renderWithQueryClient(<AppRoutes storage={storage} />);
  await waitFor(() =>
    expect(screen.queryByText("인테리어 계획을 불러오는 중")).not.toBeInTheDocument(),
  );
  return result;
}

function renderLoggedIn(plans: InteriorPlanWithItems[], hash: string) {
  const storage = createMemoryStorage({ [SESSION_HINT_STORAGE_KEY]: "1" });
  const api = createFakePlanApi({ userId: "user-a", plans });
  window.location.hash = hash;
  render(<AppRoutes storage={storage} />, { wrapper: api.wrapper });
  return { storage, api };
}

const storedPlans = (storage: Storage) =>
  (
    JSON.parse(storage.getItem(INTERIOR_PLANS_STORAGE_KEY) ?? '{"plans":[]}') as {
      plans: InteriorPlanWithItems[];
    }
  ).plans;

const storedItem = (storage: Storage, itemId: string) =>
  storedPlans(storage)[0].items.find((item) => item.id === itemId);

/** 요약의 큰 값(남은 예산·지출 예정) */
const headlineValue = (label: string) =>
  within(screen.getByRole("region", { name: "요약" })).getByText(label).nextElementSibling
    ?.textContent;

/** 요약의 작은 값(총 예산) */
const detailValue = (label: string) =>
  within(screen.getByRole("region", { name: "요약" })).getByText(label, { selector: "dt" })
    .nextElementSibling?.textContent;

const check = (name: string) => screen.getByRole("checkbox", { name });

/** 목록 묶음: [구분, [줄 여는 버튼 글자(세부내용·업체·비고·견적 순), 확정 여부]...] */
function listShape() {
  return screen
    .getAllByRole("region")
    .filter((region) => region.getAttribute("aria-label") !== "요약")
    .map((region) => [
      within(region).getByRole("heading", { level: 3 }).textContent,
      within(region)
        .getAllByRole("listitem")
        .map((row) => [
          within(row).getByRole("button").textContent,
          (within(row).getByRole("checkbox") as HTMLInputElement).checked,
        ]),
    ]);
}

/** id·시각을 뺀 항목 필드 */
function fieldsOf(item: InteriorItem | undefined) {
  if (item === undefined) throw new Error("항목 없음");
  const { id, createdAt, updatedAt, ...fields } = item;
  void [id, createdAt, updatedAt];
  return fields;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("AC-1 목록·요약 (예시 P, 로그아웃)", () => {
  it("묶음 [도배: R1, R2] → [욕실: R3, R4, R5], R1·R3·R5만 체크, 지출 예정 800 · 남은 예산 200 · 총 예산 1,000", async () => {
    await renderLoggedOut(storageWith([makeSimplePlanP()]));
    expect(listShape()).toEqual([
      [
        "도배",
        [
          ["실크 전체육문수180만원", true],
          ["합지동네도배150만원", false],
        ],
      ],
      [
        "욕실",
        [
          ["철거·방수 (1)하루바스370만원", true],
          ["철거·방수 (1)욕실나라400만원", false],
          ["타일 덧방 (2)하루바스250만원", true],
        ],
      ],
    ]);
    expect(headlineValue("지출 예정")).toBe("800만원");
    expect(headlineValue("남은 예산")).toBe("200만원");
    expect(detailValue("총 예산")).toBe("1,000만원");
    // 보기는 [목록 | 표] 두 개이고 목록이 기본이다
    expect(screen.getByRole("radio", { name: "목록" })).toBeChecked();
    expect(screen.getAllByRole("radio").map((radio) => radio.getAttribute("value"))).toEqual([
      "list",
      "table",
    ]);
    // 옛 화면의 [공간 편집]·[공정 순서]·할 일은 없다
    expect(screen.queryByRole("button", { name: "공간 편집" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "공정 순서" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "할 일" })).not.toBeInTheDocument();
  });

  it("줄은 여는 버튼과 확정 체크가 형제다(버튼 안에 체크박스 없음), 이름은 '{구분} {업체} {세부내용} 열기/확정'", async () => {
    await renderLoggedOut(storageWith([makeSimplePlanP()]));
    const open = screen.getByRole("button", { name: "도배 육문수 실크 전체 열기" });
    const box = check(R1_CHECK);
    expect(open.contains(box)).toBe(false);
    expect(open.parentElement).toBe(box.closest("label")?.parentElement);
    expect(within(open).queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it.each([
    [800, "0만원"],
    [799, "예산 초과 1만원"],
    [700, "예산 초과 100만원"],
  ])("총 예산 %i → 남은 예산 '%s'", async (budget, text) => {
    await renderLoggedOut(storageWith([makeSimplePlanP({ budget })]));
    expect(headlineValue("남은 예산")).toBe(text);
    expect(headlineValue("지출 예정")).toBe("800만원");
  });

  it("총 예산이 없으면 남은 예산 자리에 [총 예산 입력], 누르면 계획 관리 시트", async () => {
    const user = userEvent.setup();
    const { budget, ...withoutBudget } = makeSimplePlanP();
    void budget;
    await renderLoggedOut(storageWith([withoutBudget]));
    expect(detailValue("총 예산")).toBe("—");
    await user.click(screen.getByRole("button", { name: "총 예산 입력" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("줄 0개: 지출 예정 0만원 · 남은 예산 = 총 예산 · 빈 문구, [줄 추가]는 같은 자리", async () => {
    await renderLoggedOut(storageWith([makeSimplePlanP({ items: [] })]));
    expect(headlineValue("지출 예정")).toBe("0만원");
    expect(headlineValue("남은 예산")).toBe("1,000만원");
    expect(
      screen.getByText("아직 줄이 없습니다. [줄 추가]로 공정별 업체 견적을 적어 보세요"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "줄 추가" })).toBeEnabled();
  });

  it("묶음 끝 [+ {구분}에 줄 추가]가 묶음마다 있다", async () => {
    await renderLoggedOut(storageWith([makeSimplePlanP()]));
    for (const trade of ["도배", "욕실"]) {
      const group = screen.getByRole("region", { name: trade });
      const add = within(group).getByRole("button", { name: `${trade}에 줄 추가` });
      expect(within(group).getAllByRole("listitem").at(-1)?.compareDocumentPosition(add)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }
  });
});

describe("줄 글자 순서: 첫 줄 세부내용, 그 아래 업체", () => {
  /** 여는 버튼 왼쪽 글자 묶음의 줄들: [클래스, 글자] (금액은 빼고) */
  const rowLines = (openName: string) =>
    Array.from(
      screen.getByRole("button", { name: openName }).firstElementChild?.children ?? [],
      (line) => [line.className, line.textContent] as const,
    );

  it("세부내용이 있으면 세부내용이 첫 줄, 업체는 그 아래 줄 자리(세부내용 자리 스타일)다", async () => {
    await renderLoggedOut(storageWith([makePlanL()]), L_HASH);
    const withDetail = rowLines("욕실 하루바스 철거·방수 열기");
    const withoutDetail = rowLines("욕실 욕실나라 열기");

    expect(withDetail.map(([, text]) => text)).toEqual(["철거·방수", "하루바스", "폐기물 포함"]);
    // 세부내용이 없으면 업체가 첫 줄로 올라온다(빈 줄 없음)
    expect(withoutDetail.map(([, text]) => text)).toEqual(["욕실나라", "폐기물 포함"]);
    // 첫 줄은 내용과 상관없이 같은 스타일, 둘째 줄(업체)은 첫 줄과 다른 스타일이다
    expect(withDetail[0][0]).toBe(withoutDetail[0][0]);
    expect(withDetail[1][0]).not.toBe(withDetail[0][0]);
  });

  it("가리기 중에는 업체가 첫 줄이고, 가려진 세부내용은 그 아래 •••다", async () => {
    const user = userEvent.setup();
    await renderLoggedOut(storageWith([makeSimplePlanP()]));
    const [firstLineClass, secondLineClass] = rowLines("도배 육문수 실크 전체 열기").map(
      ([className]) => className,
    );

    await user.click(screen.getByRole("button", { name: "가리기" }));
    expect(rowLines("도배 육문수 열기")).toEqual([
      [firstLineClass, "육문수"],
      [secondLineClass, "•••가려짐"],
    ]);

    await user.click(screen.getByRole("button", { name: "가리기" }));
    expect(rowLines("도배 육문수 실크 전체 열기").map(([, text]) => text)).toEqual([
      "실크 전체",
      "육문수",
    ]);
  });
});

describe("AC-3 확정 토글 (로그아웃)", () => {
  it("R4 체크 → 시트 없음, 쓰기 정확히 1회, confirmedQuoteId만 바뀐 R4, 지출 예정 1,200 · 예산 초과 200 → R1 해제 → 1,020 · 초과 20, R1에 confirmedQuoteId 키 없음", async () => {
    const user = userEvent.setup();
    const storage = storageWith([makeSimplePlanP()]);
    await renderLoggedOut(storage);
    const setItem = vi.spyOn(storage, "setItem");

    await user.click(check(R4_CHECK));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(check(R4_CHECK)).toBeChecked());
    expect(setItem.mock.calls.map(([key]) => key)).toEqual([INTERIOR_PLANS_STORAGE_KEY]);
    expect(fieldsOf(storedItem(storage, "r4"))).toStrictEqual({
      ...fieldsOf(r4()),
      confirmedQuoteId: "rq4",
    });
    expect(headlineValue("지출 예정")).toBe("1,200만원");
    expect(headlineValue("남은 예산")).toBe("예산 초과 200만원");

    await user.click(check(R1_CHECK));
    await waitFor(() => expect(check(R1_CHECK)).not.toBeChecked());
    expect(setItem).toHaveBeenCalledTimes(2);
    const storedR1 = storedItem(storage, "r1");
    expect(storedR1 !== undefined && Object.hasOwn(storedR1, "confirmedQuoteId")).toBe(false);
    const { confirmedQuoteId, ...r1WithoutConfirm } = fieldsOf(r1());
    void confirmedQuoteId;
    expect(fieldsOf(storedR1)).toStrictEqual(r1WithoutConfirm);
    expect(headlineValue("지출 예정")).toBe("1,020만원");
    expect(headlineValue("남은 예산")).toBe("예산 초과 20만원");
  });

  // 옛 "견적 중 항목을 [확정]하면 상태가 확정으로 바뀐다"의 반전(A4): 상태는 읽지도 바꾸지도 않는다
  it.each<InteriorItemStatus>(["planned", "quoting", "inProgress"])(
    "상태 %s 항목: 확정을 켜고 꺼도 저장된 status 그대로",
    async (status) => {
      const user = userEvent.setup();
      const plan = makeSimplePlanP({
        items: makeSimplePlanP().items.map((item) =>
          item.id === "r4" ? { ...item, status } : item,
        ),
      });
      const storage = storageWith([plan]);
      await renderLoggedOut(storage);
      await user.click(check(R4_CHECK));
      await waitFor(() => expect(storedItem(storage, "r4")?.confirmedQuoteId).toBe("rq4"));
      expect(storedItem(storage, "r4")?.status).toBe(status);
      await user.click(check(R4_CHECK));
      await waitFor(() => expect(storedItem(storage, "r4")?.confirmedQuoteId).toBeUndefined());
      expect(storedItem(storage, "r4")?.status).toBe(status);
    },
  );

  it("저장 뒤 줄 DOM이 다시 마운트되지 않는다(같은 체크박스 노드, 스크롤 위치 유지의 대리 단언)", async () => {
    const user = userEvent.setup();
    await renderLoggedOut(storageWith([makeSimplePlanP()]));
    const before = check(R4_CHECK);
    await user.click(before);
    await waitFor(() => expect(check(R4_CHECK)).toBeChecked());
    expect(check(R4_CHECK)).toBe(before);
    expect(before.isConnected).toBe(true);
  });

  it("저장 실패(로컬 unavailable): 체크는 원래대로, 목록 위에 이유 한 줄, 요약 그대로", async () => {
    const user = userEvent.setup();
    const storage = storageWith([makeSimplePlanP()]);
    await renderLoggedOut(storage);
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    await user.click(check(R4_CHECK));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "저장하지 못했습니다. 이 브라우저에서 저장소를 사용할 수 없거나 저장 공간이 가득 찼습니다",
    );
    expect(check(R4_CHECK)).not.toBeChecked();
    expect(check(R4_CHECK)).toBeEnabled();
    expect(headlineValue("지출 예정")).toBe("800만원");
  });

  it("다른 탭이 그 항목을 먼저 고쳤으면(conflict) 쓰지 않고 '방금 다른 곳에서 바뀌었습니다. 다시 눌러 주세요'", async () => {
    const user = userEvent.setup();
    const storage = storageWith([makeSimplePlanP()]);
    await renderLoggedOut(storage);
    // 다른 탭이 R4 금액을 고쳤다(이 화면은 아직 storage 이벤트를 받지 않았다)
    const changed = makeSimplePlanP({
      items: makeSimplePlanP().items.map((item) =>
        item.id === "r4"
          ? { ...item, quotes: [{ ...item.quotes![0], amount: 410 }], updatedAt: simpleTime(30) }
          : item,
      ),
    });
    const otherTabRaw = toStoredPlans([changed]);
    storage.setItem(INTERIOR_PLANS_STORAGE_KEY, otherTabRaw);
    const setItem = vi.spyOn(storage, "setItem");

    await user.click(check(R4_CHECK));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "방금 다른 곳에서 바뀌었습니다. 다시 눌러 주세요",
    );
    expect(screen.queryByText(/최신 값 불러오기/)).not.toBeInTheDocument();
    expect(setItem).not.toHaveBeenCalled();
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe(otherTabRaw);
  });
});

describe("AC-3 확정 토글 (로그인, 서버 출처)", () => {
  it("응답 지연 중: 체크는 원래 상태로 비활성(aria-busy)·요약은 이전 값, 같은 항목의 형제 줄도 비활성 → 응답 뒤 함께 바뀐다", async () => {
    const user = userEvent.setup();
    const { api } = renderLoggedIn([makePlanL()], L_HASH);
    const xPut = "/api/interior-plans/plan-l/items/item-x";
    let release: (() => void) | null = null;
    api.server.respond = (call) => {
      if (call.method !== "PUT" || call.path !== xPut) return undefined;
      return new Promise<Response>((resolve) => {
        release = () => resolve(errorResponse(500, "internal"));
      }) as unknown as Response;
    };
    await user.click(await screen.findByRole("checkbox", { name: X_Q2_CHECK }));

    expect(check(X_Q2_CHECK)).not.toBeChecked();
    expect(check(X_Q2_CHECK)).toBeDisabled();
    expect(check(X_Q2_CHECK)).toHaveAttribute("aria-busy", "true");
    // 같은 항목 X의 형제 줄(하루바스 철거·방수)도 잠근다. 다른 항목 Z의 줄은 그대로
    expect(check(X_Q1_CHECK)).toBeChecked();
    expect(check(X_Q1_CHECK)).toBeDisabled();
    expect(check("욕실 하루바스 타일 덧방 확정")).toBeEnabled();
    expect(headlineValue("지출 예정")).toBe("370만원");
    fireEvent.click(check(X_Q1_CHECK));
    expect(api.callsTo("PUT", xPut)).toHaveLength(1);

    api.server.respond = undefined;
    await act(async () => release?.());
    // 서버 500: 원래대로, 이유 한 줄
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "저장하지 못했습니다. 연결을 확인하고 다시 시도해 주세요",
    );
    expect(check(X_Q2_CHECK)).not.toBeChecked();
    expect(check(X_Q2_CHECK)).toBeEnabled();
    expect(check(X_Q1_CHECK)).toBeChecked();
    expect(headlineValue("지출 예정")).toBe("370만원");
  });

  it("성공하면 PUT 정확히 1건(확정만 바뀐 X 전체), 체크·요약이 함께 바뀐다", async () => {
    const user = userEvent.setup();
    const { api } = renderLoggedIn([makePlanL()], L_HASH);
    await user.click(await screen.findByRole("checkbox", { name: X_Q2_CHECK }));
    await waitFor(() => expect(check(X_Q2_CHECK)).toBeChecked());
    expect(api.writes()).toHaveLength(1);
    expect(api.writes()[0]).toMatchObject({
      method: "PUT",
      path: "/api/interior-plans/plan-l/items/item-x",
    });
    expect((api.writes()[0].body as { item: unknown }).item).toStrictEqual({
      ...fieldsOf(legacyX()),
      confirmedQuoteId: "q2",
    });
    expect(headlineValue("지출 예정")).toBe("400만원");
  });

  it("함께 쓰는 사람이 확정한 줄이 재조회 뒤 보인다(체크·요약)", async () => {
    const { api } = renderLoggedIn([makeSimplePlanP()], P_HASH);
    expect(await screen.findByRole("checkbox", { name: R4_CHECK })).not.toBeChecked();
    api.editItemOnServer("plan-simple", "r4", { confirmedQuoteId: "rq4" });
    await act(async () => {
      window.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(check(R4_CHECK)).toBeChecked());
    expect(headlineValue("지출 예정")).toBe("1,200만원");
  });
});

describe("AC-4 옛 계획 L (보이기·확정 옮김, D2 a)", () => {
  it("[욕실: 하루바스 철거·방수 370 ✓ 폐기물 포함, 욕실나라 400 폐기물 포함, 하루바스 타일 덧방 250] → [도배: 업체·견적 빈 줄, 예산 200만원], 지출 예정 370 · 남은 예산 2,630", async () => {
    await renderLoggedOut(storageWith([makePlanL()]), L_HASH);
    expect(listShape()).toEqual([
      [
        "욕실",
        [
          ["철거·방수하루바스폐기물 포함370만원", true],
          ["욕실나라폐기물 포함400만원", false],
          ["타일 덧방하루바스250만원", false],
        ],
      ],
      ["도배", [["견적 없음예산 200만원", false]]],
    ]);
    expect(headlineValue("지출 예정")).toBe("370만원");
    expect(headlineValue("남은 예산")).toBe("2,630만원");
    // 공간 이름·지급·상태·날짜·연락처는 화면에 없다
    for (const hidden of ["욕실1", "욕실2", "계약금", "진행 중", "2026-11-03", "010-1234-5678"]) {
      expect(document.body.textContent).not.toContain(hidden);
    }
  });

  it("견적 없는 줄(Y)의 체크는 숨기지 않고 비활성 + 이유 설명, 강제 클릭해도 쓰기 0회", async () => {
    const storage = storageWith([makePlanL()]);
    await renderLoggedOut(storage, L_HASH);
    const blank = check("도배 확정");
    expect(blank).toBeDisabled();
    expect(blank).toHaveAccessibleDescription(
      "견적이 없어 확정할 수 없습니다. 줄을 열어 업체와 견적을 적으세요",
    );
    const setItem = vi.spyOn(storage, "setItem");
    fireEvent.click(blank);
    expect(setItem).not.toHaveBeenCalled();
    expect(blank).not.toBeChecked();
  });

  it("(d) 욕실나라 체크 → X의 확정이 q2로 옮겨 가 지출 예정 400 · 남은 예산 2,600, 목록 위 '같은 항목의 다른 견적 확정이 풀렸습니다'", async () => {
    const user = userEvent.setup();
    const storage = storageWith([makePlanL()]);
    await renderLoggedOut(storage, L_HASH);
    await user.click(check(X_Q2_CHECK));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "같은 항목의 다른 견적 확정이 풀렸습니다",
    );
    expect(check(X_Q2_CHECK)).toBeChecked();
    expect(check(X_Q1_CHECK)).not.toBeChecked();
    expect(headlineValue("지출 예정")).toBe("400만원");
    expect(headlineValue("남은 예산")).toBe("2,600만원");
    expect(fieldsOf(storedItem(storage, "item-x"))).toStrictEqual({
      ...fieldsOf(legacyX()),
      confirmedQuoteId: "q2",
    });
  });

  it("다른 확정이 없는 항목에서 켜면 안내가 없다", async () => {
    const user = userEvent.setup();
    await renderLoggedOut(storageWith([makePlanL()]), L_HASH);
    await user.click(check("욕실 하루바스 타일 덧방 확정"));
    await waitFor(() => expect(check("욕실 하루바스 타일 덧방 확정")).toBeChecked());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(headlineValue("지출 예정")).toBe("620만원");
  });
});

describe("AC-1 가리기 (A8·A10)", () => {
  const SECRETS = ["실크 전체", "합지", "철거·방수", "180", "150", "370", "800만원", "200만원"];

  it("켜면 세부내용·비고·금액이 DOM(innerHTML·aria-label·title)에 없고 구분·업체는 보인다, 체크 이름은 '{구분} {업체} 확정', 기존 줄 시트는 열리지 않는다", async () => {
    const user = userEvent.setup();
    const storage = storageWith([makeSimplePlanP()]);
    const { container } = await renderLoggedOut(storage);
    await user.click(screen.getByRole("button", { name: "가리기" }));
    expect(screen.getByRole("button", { name: "가리기" })).toHaveAttribute("aria-pressed", "true");
    // 저장 목록과 같은 설정 키다
    expect(storage.getItem(PRIVACY_MODE_STORAGE_KEY)).toBe("true");
    for (const secret of SECRETS) expect(container.innerHTML).not.toContain(secret);
    expect(screen.getByRole("heading", { level: 3, name: "도배" })).toBeInTheDocument();
    expect(screen.getAllByText("육문수")).toHaveLength(1);
    expect(check("도배 육문수 확정")).toBeChecked();
    expect(check("욕실 욕실나라 확정")).not.toBeChecked();
    expect(headlineValue("지출 예정")).toBe("•••가려짐");
    expect(headlineValue("남은 예산")).toBe("•••가려짐");
    expect(detailValue("총 예산")).toBe("•••가려짐");

    const open = screen.getByRole("button", { name: "도배 육문수 열기" });
    expect(open).toBeDisabled();
    fireEvent.click(open);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // 체크 토글·[줄 추가]는 가리기 중에도 된다
    await user.click(check("욕실 욕실나라 확정"));
    await waitFor(() => expect(check("욕실 욕실나라 확정")).toBeChecked());
    expect(screen.getByRole("button", { name: "줄 추가" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "가리기" }));
    expect(headlineValue("지출 예정")).toBe("1,200만원");
    expect(container.innerHTML).toContain("실크 전체");
  });

  it("예산 초과와 빈 줄의 합성 비고도 가린다(L, 이미 켜져 있으면 처음부터)", async () => {
    const { container } = await renderLoggedOut(
      storageWith([makePlanL({ budget: 300 })], { [PRIVACY_MODE_STORAGE_KEY]: "true" }),
      L_HASH,
    );
    expect(headlineValue("남은 예산")).toBe("예산 초과 •••가려짐");
    for (const secret of ["예산 200만원", "폐기물 포함", "70만원", "370", "400"]) {
      expect(container.innerHTML).not.toContain(secret);
    }
    expect(check("도배 확정")).toBeDisabled();
    // 세부내용이 빠져 X의 하루바스와 Z의 하루바스 이름이 같아진다(가리기 중에는 값을 이름에 두지 않는다)
    const sameName = screen.getAllByRole("checkbox", { name: "욕실 하루바스 확정" });
    expect(sameName.map((box) => (box as HTMLInputElement).checked)).toEqual([true, false]);
  });
});

describe("AC-2(e) 상한은 항목 수 100개(줄 수가 아님)", () => {
  const bulk = (count: number): InteriorItem[] =>
    Array.from({ length: count }, (_, index) => ({
      id: `bulk${index}`,
      spaceId: "sp-whole",
      trade: "도배",
      quotes: [{ id: `bq${index}`, vendor: "업체", amount: 10 }],
      status: "planned",
      createdAt: simpleTime(1),
      updatedAt: simpleTime(1),
    }));

  it("항목 99개(그중 하나가 견적 5개라 줄 103개)면 [줄 추가] 활성", async () => {
    const items = bulk(99);
    items[0] = {
      ...items[0],
      quotes: Array.from({ length: 5 }, (_, index) => ({
        id: `five${index}`,
        vendor: `업체${index}`,
        amount: 10,
      })),
    };
    await renderLoggedOut(storageWith([makeSimplePlanP({ items })]));
    expect(screen.getAllByRole("checkbox")).toHaveLength(103);
    expect(screen.getByRole("button", { name: "줄 추가" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "도배에 줄 추가" })).toBeEnabled();
  });

  it("항목 100개(줄은 100개)면 [줄 추가]·묶음 끝 버튼 비활성 + 기존 상한 문구", async () => {
    await renderLoggedOut(storageWith([makeSimplePlanP({ items: bulk(100) })]));
    expect(screen.getByRole("button", { name: "줄 추가" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "도배에 줄 추가" })).toBeDisabled();
    expect(screen.getByText("항목은 계획마다 100개까지 적을 수 있습니다")).toBeInTheDocument();
  });
});
