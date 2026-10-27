// @vitest-environment jsdom
// 스펙 interior-planner AC-6(로그아웃, 로컬 출처): 저장 목록 카드 [인테리어 계획] → `#/home?listing={id}` →
// 만들기 시트(이름·총 예산·"추가 비용 인테리어 n줄 가져오기") → 플랜(전체/도배 300·전체/샷시 1,200·listingId) →
// 같은 카드는 `#/home/{planId}`로 replace. 매물 원문은 전후 같고, 매물을 지우면 "연결된 매물이 삭제되었습니다".
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { INTERIOR_WHOLE_SPACE_NAME } from "@/lib/constants/interiorSpaces";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";
import { LISTINGS_STORAGE_KEY } from "@/lib/utils/listingStorage";
import { makePlanP, toStoredPlans } from "@/test/interiorPlanFixture";
import { makeListing } from "@/test/listingFixture";
import { createMemoryStorage } from "@/test/memoryStorage";
import { renderWithQueryClient } from "@/test/renderWithQueryClient";

import { LISTING_ENTRY_NOTICES } from "./listingEntry";

import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";

type User = ReturnType<typeof userEvent.setup>;

const RAEMIAN_ID = "listing-raemian";
const XI_ID = "listing-xi";
const MISSING_TEXT = "연결된 매물이 삭제되었습니다";

/** AC-6 예시 매물: 인테리어/도배 300, 인테리어/샷시 1,200, 가전/냉장고 400 */
const raemian = makeListing({
  id: RAEMIAN_ID,
  name: "래미안 84",
  extraCosts: [
    { category: "interior", label: "도배", amount: 300 },
    { category: "interior", label: "샷시", amount: 1200 },
    { category: "appliance", label: "냉장고", amount: 400 },
  ],
});
/** 인테리어 줄이 없는 매물(가전만) */
const xi = makeListing({
  id: XI_ID,
  name: "자이 59",
  createdAt: "2026-10-02T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
  extraCosts: [{ category: "appliance", label: "세탁기", amount: 200 }],
});

/** 앱이 쓰는 모양과 다르게(들여쓰기) 적어 다시 직렬화해 쓰면 원문 비교에서 걸린다 */
const LISTINGS_RAW = JSON.stringify([raemian, xi], null, 2);

function stubLoggedOutApi() {
  const fetchMock = vi.fn(async (input: string) => {
    const isMe = String(input) === "/api/me";
    return new Response(JSON.stringify(isMe ? { user: null } : { error: "notFound" }), {
      status: isMe ? 200 : 404,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const storageWith = (plans: InteriorPlanWithItems[] = []) =>
  createMemoryStorage({
    [LISTINGS_STORAGE_KEY]: LISTINGS_RAW,
    ...(plans.length > 0 && { [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans(plans) }),
  });

const storedPlans = (storage: Storage) =>
  (
    JSON.parse(storage.getItem(INTERIOR_PLANS_STORAGE_KEY) ?? '{"plans":[]}') as {
      plans: InteriorPlanWithItems[];
    }
  ).plans;

function renderApp(storage: Storage, hash: string) {
  window.location.hash = hash;
  return renderWithQueryClient(<AppRoutes storage={storage} />);
}

/** 저장 목록에서 그 매물 줄을 펼쳐 카드를 돌려준다 */
async function expandCard(user: User, name: string) {
  const list = await screen.findByRole("list", { name: /^저장한 매물/ });
  await user.click(
    within(list).getByRole("button", { name: new RegExp(`^${name}`), expanded: false }),
  );
  const link = await screen.findByRole("link", { name: `${name} 인테리어 계획` });
  return link.closest("article") as HTMLElement;
}

async function clickInteriorLink(user: User, name: string) {
  await expandCard(user, name);
  await user.click(screen.getByRole("link", { name: `${name} 인테리어 계획` }));
}

const createSheet = () => screen.findByRole("dialog", { name: "인테리어 계획 만들기" });

/** 요약 줄의 작은 값(총 예산 등) */
const detailValue = (label: string) =>
  within(screen.getByRole("region", { name: "요약" })).getByText(label, { selector: "dt" })
    .nextElementSibling?.textContent;

describe("AC-6 매물 카드 → [우리 집] (로그아웃)", () => {
  let fetchMock: ReturnType<typeof stubLoggedOutApi>;

  beforeEach(() => {
    fetchMock = stubLoggedOutApi();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.location.hash = "#/";
  });

  it("카드 링크: 버튼 줄(수정·복사·메모·공유·삭제) 아래 전체 폭 한 줄, href #/home?listing={id}, 접근 이름 '{이름} 인테리어 계획'", async () => {
    const user = userEvent.setup();
    renderApp(storageWith(), "#/listings");
    const card = await expandCard(user, "래미안 84");

    const link = within(card).getByRole("link", { name: "래미안 84 인테리어 계획" });
    expect(link).toHaveAttribute("href", `#/home?listing=${RAEMIAN_ID}`);
    expect(link).toHaveTextContent("인테리어 계획");

    const deleteButton = within(card).getByRole("button", { name: "래미안 84 삭제" });
    const actionRow = deleteButton.parentElement as HTMLElement;
    for (const name of ["수정", "복사"]) {
      expect(within(actionRow).getByRole("link", { name: `래미안 84 ${name}` })).toBeVisible();
    }
    for (const name of ["메모", "공유"]) {
      expect(within(actionRow).getByRole("button", { name: `래미안 84 ${name}` })).toBeVisible();
    }
    // 버튼 줄 안이 아니라 그 뒤의 따로 한 줄
    expect(actionRow.contains(link)).toBe(false);
    expect(actionRow.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(link.parentElement).toBe(actionRow.parentElement);
    // 로그아웃: 계획 API를 부르지 않는다(로그인 상태는 MortgageHome.listingEntry.loggedIn.test.tsx)
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("interior"))).toEqual([]);
  });

  it("카드 → 만들기 시트(이름 '래미안 84', 총 예산 15,000,000원, '추가 비용 인테리어 2줄 가져오기' 체크) → 만들기 → 항목 전체/도배 300·전체/샷시 1,200(계획), 냉장고 없음, listingId", async () => {
    const user = userEvent.setup();
    const storage = storageWith();
    renderApp(storage, "#/listings");
    await clickInteriorLink(user, "래미안 84");

    const sheet = await createSheet();
    // 시트를 연 뒤 주소에서 listing을 지운다
    await waitFor(() => expect(window.location.hash).toBe("#/home"));
    expect(within(sheet).getByRole("textbox", { name: "계획 이름" })).toHaveValue("래미안 84");
    expect(within(sheet).getByLabelText("총 예산(선택)")).toHaveValue("15,000,000");
    const importBox = within(sheet).getByRole("checkbox", {
      name: "추가 비용 인테리어 2줄 가져오기",
    });
    expect(importBox).toBeChecked();

    await user.click(within(sheet).getByRole("button", { name: "만들기" }));
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/home\/[0-9a-f]{32}$/));

    const [plan] = storedPlans(storage);
    expect(window.location.hash).toBe(`#/home/${plan.id}`);
    expect(plan.name).toBe("래미안 84");
    expect(plan.budgetWon).toBe(15_000_000);
    expect(Object.hasOwn(plan, "budget")).toBe(false);
    expect(plan.listingId).toBe(RAEMIAN_ID);
    const whole = plan.spaces[0];
    expect(whole.name).toBe(INTERIOR_WHOLE_SPACE_NAME);
    expect(whole.name).toBe("전체");
    expect(
      plan.items.map(({ spaceId, trade, budget, status }) => ({ spaceId, trade, budget, status })),
    ).toEqual([
      { spaceId: whole.id, trade: "도배", budget: 300, status: "planned" },
      { spaceId: whole.id, trade: "샷시", budget: 1200, status: "planned" },
    ]);
    // 가져온 항목에는 견적·지급·메모 등 다른 키가 없다
    for (const item of plan.items) {
      expect(Object.keys(item).toSorted()).toEqual(
        ["budget", "createdAt", "id", "spaceId", "status", "trade", "updatedAt"].toSorted(),
      );
    }
    expect(JSON.stringify(plan)).not.toContain("냉장고");

    // 화면: 그 플랜, 연결 매물 이름, 총 예산 1,500, 두 항목
    expect(screen.getByRole("heading", { level: 1, name: "래미안 84" })).toBeInTheDocument();
    expect(screen.getByText("연결된 매물 · 래미안 84")).toBeInTheDocument();
    expect(detailValue("총 예산")).toBe("15,000,000원");
    expect(screen.getByRole("button", { name: "도배 열기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "샷시 열기" })).toBeInTheDocument();
    expect(screen.queryByText(/냉장고/)).not.toBeInTheDocument();
    // 매물 원문 그대로
    expect(storage.getItem(LISTINGS_STORAGE_KEY)).toBe(LISTINGS_RAW);
  });

  it("줄 이름 30자는 자르지 않고 공종으로 들어간다(공종 상한 30자, 저장 성공)", async () => {
    const user = userEvent.setup();
    const label30 = "가나다라마바사아자차".repeat(3);
    expect(Array.from(label30)).toHaveLength(30);
    const longLabel = makeListing({
      id: "listing-long",
      name: "긴 이름 매물",
      extraCosts: [{ category: "interior", label: label30, amount: 700 }],
    });
    const storage = createMemoryStorage({ [LISTINGS_STORAGE_KEY]: JSON.stringify([longLabel]) });
    renderApp(storage, "#/listings");
    await clickInteriorLink(user, "긴 이름 매물");
    const sheet = await createSheet();
    expect(
      within(sheet).getByRole("checkbox", { name: "추가 비용 인테리어 1줄 가져오기" }),
    ).toBeChecked();
    await user.click(within(sheet).getByRole("button", { name: "만들기" }));
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/home\/[0-9a-f]{32}$/));
    const [plan] = storedPlans(storage);
    expect(plan.items.map((item) => [item.trade, item.budget])).toEqual([[label30, 700]]);
    expect(screen.getByRole("button", { name: `${label30} 열기` })).toBeInTheDocument();
  });

  it("시트를 취소하고 저장 목록에서 같은 카드를 다시 누르면 시트가 다시 열린다(계획은 안 생김)", async () => {
    const user = userEvent.setup();
    const storage = storageWith();
    renderApp(storage, "#/listings");
    await clickInteriorLink(user, "래미안 84");
    await user.click(within(await createSheet()).getByRole("button", { name: "취소" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBeNull();

    await user.click(screen.getByRole("link", { name: "매물" }));
    await clickInteriorLink(user, "래미안 84");
    const sheet = await createSheet();
    expect(within(sheet).getByRole("textbox", { name: "계획 이름" })).toHaveValue("래미안 84");
    await waitFor(() => expect(window.location.hash).toBe("#/home"));
  });

  it("회귀(0761b34): 시트 [취소] 뒤 같은 탭에서 같은 ?listing= 주소를 다시 열면(화면 마운트 유지) 시트가 다시 열리고 주소 #/home", async () => {
    const user = userEvent.setup();
    const storage = storageWith();
    renderApp(storage, `#/home?listing=${RAEMIAN_ID}`);
    await user.click(within(await createSheet()).getByRole("button", { name: "취소" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(window.location.hash).toBe("#/home");

    // 주소창·북마크처럼 같은 문서 안 해시 이동(탭을 거치지 않아 [우리 집]이 그대로 마운트돼 있다)
    window.location.hash = `#/home?listing=${RAEMIAN_ID}`;
    const sheet = await createSheet();
    expect(within(sheet).getByRole("textbox", { name: "계획 이름" })).toHaveValue("래미안 84");
    await waitFor(() => expect(window.location.hash).toBe("#/home"));
    expect(screen.queryByText("매물을 확인하는 중")).not.toBeInTheDocument();
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBeNull();
  });

  it("회귀(0761b34): 없는 매물 안내 뒤 같은 탭에서 같은 주소를 다시 열어도 다시 처리한다(멈추지 않음)", async () => {
    const storage = storageWith();
    renderApp(storage, "#/home?listing=no-such-listing");
    expect(await screen.findByText(LISTING_ENTRY_NOTICES.listingMissing)).toBeInTheDocument();
    expect(window.location.hash).toBe("#/home");

    window.location.hash = "#/home?listing=no-such-listing";
    await waitFor(() => expect(window.location.hash).toBe("#/home"));
    expect(screen.queryByText("매물을 확인하는 중")).not.toBeInTheDocument();
    expect(screen.getByText(LISTING_ENTRY_NOTICES.listingMissing)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "계획 만들기" })).toBeInTheDocument();
  });

  it("체크를 풀고 만들면 항목이 없다(이름·총 예산·listingId는 들어감)", async () => {
    const user = userEvent.setup();
    const storage = storageWith();
    renderApp(storage, "#/listings");
    await clickInteriorLink(user, "래미안 84");
    const sheet = await createSheet();
    await user.click(
      within(sheet).getByRole("checkbox", { name: "추가 비용 인테리어 2줄 가져오기" }),
    );
    await user.click(within(sheet).getByRole("button", { name: "만들기" }));
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/home\/[0-9a-f]{32}$/));

    const [plan] = storedPlans(storage);
    expect(plan.items).toEqual([]);
    expect(plan).toMatchObject({ name: "래미안 84", budgetWon: 15_000_000, listingId: RAEMIAN_ID });
    expect(screen.queryByRole("button", { name: "도배 열기" })).not.toBeInTheDocument();
  });

  it("인테리어 줄이 없는 매물(가전만): 가져오기 체크가 없고 총 예산은 비어 있다, 만들면 항목 0", async () => {
    const user = userEvent.setup();
    const storage = storageWith();
    renderApp(storage, "#/listings");
    await clickInteriorLink(user, "자이 59");
    const sheet = await createSheet();
    expect(within(sheet).getByRole("textbox", { name: "계획 이름" })).toHaveValue("자이 59");
    expect(within(sheet).getByLabelText("총 예산(선택)")).toHaveValue("");
    expect(within(sheet).queryByRole("checkbox")).not.toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "만들기" }));
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/home\/[0-9a-f]{32}$/));
    const [plan] = storedPlans(storage);
    expect(plan.items).toEqual([]);
    expect(plan.listingId).toBe(XI_ID);
    expect("budget" in plan).toBe(false);
    expect("budgetWon" in plan).toBe(false);
  });

  it("같은 카드를 다시 누르면 #/home/{planId}로 replace(이력은 링크 클릭 1개만 늘고, 뒤로 가기는 저장 목록)", async () => {
    const user = userEvent.setup();
    const storage = storageWith();
    renderApp(storage, "#/listings");
    await clickInteriorLink(user, "래미안 84");
    const sheet = await createSheet();
    await user.click(within(sheet).getByRole("button", { name: "만들기" }));
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/home\/[0-9a-f]{32}$/));
    const [plan] = storedPlans(storage);

    await user.click(screen.getByRole("link", { name: "매물" }));
    await waitFor(() => expect(window.location.hash).toBe("#/listings"));
    const historyBefore = window.history.length;
    await clickInteriorLink(user, "래미안 84");

    await waitFor(() => expect(window.location.hash).toBe(`#/home/${plan.id}`));
    expect(await screen.findByRole("heading", { level: 1, name: "래미안 84" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // 링크(push) 1개. 연결 계획으로 가는 것은 replace라 `#/home?listing=`이 이력에 남지 않는다
    expect(window.history.length).toBe(historyBefore + 1);
    // 플랜이 새로 생기지 않는다
    expect(storedPlans(storage)).toHaveLength(1);

    window.history.back();
    await waitFor(() => expect(window.location.hash).toBe("#/listings"));
    expect(storage.getItem(LISTINGS_STORAGE_KEY)).toBe(LISTINGS_RAW);
  });

  it("연결 계획이 여럿이면 첫 번째를 연다(만들기 시트 없음)", async () => {
    const storage = storageWith([
      makePlanP({ id: "plan-other", name: "다른 매물 계획", listingId: XI_ID, items: [] }),
      makePlanP({ id: "plan-first", name: "첫 계획", listingId: RAEMIAN_ID, items: [] }),
      makePlanP({ id: "plan-second", name: "둘째 계획", listingId: RAEMIAN_ID, items: [] }),
    ]);
    renderApp(storage, `#/home?listing=${RAEMIAN_ID}`);
    await waitFor(() => expect(window.location.hash).toBe("#/home/plan-first"));
    expect(await screen.findByRole("heading", { level: 1, name: "첫 계획" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("처리 중 본문은 '매물을 확인하는 중'이고 고르기·빈 상태를 먼저 그리지 않는다", async () => {
    const storage = storageWith([
      makePlanP({ id: "plan-a", name: "A 계획", items: [] }),
      makePlanP({ id: "plan-b", name: "B 계획", items: [] }),
    ]);
    // `/api/me` 응답 전에는 계획 목록이 loading이다. 그동안 고르기 화면이 보이면 안 된다
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderApp(storage, `#/home?listing=${RAEMIAN_ID}`);
    expect(await screen.findByText("인테리어 계획을 불러오는 중")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /A 계획/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(window.location.hash).toBe(`#/home?listing=${RAEMIAN_ID}`);
  });

  it("#/home?listing=없는id → 안내 한 줄, 주소 #/home, 만들기 시트 없음, 계획 안 생김", async () => {
    const storage = storageWith();
    renderApp(storage, "#/home?listing=no-such-listing");
    expect(await screen.findByText(LISTING_ENTRY_NOTICES.listingMissing)).toBeInTheDocument();
    expect(window.location.hash).toBe("#/home");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("매물을 확인하는 중")).not.toBeInTheDocument();
    // 빈 상태로 돌아간다
    expect(screen.getByRole("button", { name: "계획 만들기" })).toBeInTheDocument();
    expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBeNull();
  });

  it("계획 3개(상한)인데 연결 계획이 없으면 안내 한 줄, 주소 #/home, 시트 없음", async () => {
    const storage = storageWith([
      makePlanP({ id: "plan-1", name: "계획 1", items: [] }),
      makePlanP({ id: "plan-2", name: "계획 2", items: [] }),
      makePlanP({ id: "plan-3", name: "계획 3", items: [] }),
    ]);
    renderApp(storage, `#/home?listing=${RAEMIAN_ID}`);
    expect(await screen.findByText(LISTING_ENTRY_NOTICES.planLimit)).toBeInTheDocument();
    expect(window.location.hash).toBe("#/home");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(storedPlans(storage)).toHaveLength(3);
  });

  it("매물을 지우면 플랜·항목은 남고 '연결된 매물이 삭제되었습니다', [매물 연결 해제] 뒤 문구가 사라진다", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const storage = storageWith();
    renderApp(storage, "#/listings");
    await clickInteriorLink(user, "래미안 84");
    await user.click(within(await createSheet()).getByRole("button", { name: "만들기" }));
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/home\/[0-9a-f]{32}$/));
    const [plan] = storedPlans(storage);
    expect(screen.queryByText(MISSING_TEXT)).not.toBeInTheDocument();

    // 저장 목록에서 매물 삭제(매물 쪽 쓰기는 이 삭제뿐)
    await user.click(screen.getByRole("link", { name: "매물" }));
    const card = await expandCard(user, "래미안 84");
    await user.click(within(card).getByRole("button", { name: "래미안 84 삭제" }));
    expect(await screen.findByRole("list", { name: "저장한 매물 1개" })).toBeInTheDocument();
    const listingsAfterDelete = storage.getItem(LISTINGS_STORAGE_KEY);

    window.location.hash = `#/home/${plan.id}`;
    expect(await screen.findByText(MISSING_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(/^연결된 매물 · /)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "도배 열기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "샷시 열기" })).toBeInTheDocument();
    expect(storedPlans(storage)[0]).toMatchObject({ id: plan.id, listingId: RAEMIAN_ID });
    expect(storedPlans(storage)[0].items).toHaveLength(2);

    // ⋯ → [매물 연결 해제]
    await user.click(screen.getByRole("button", { name: "계획 관리" }));
    const settings = screen.getByRole("dialog", { name: "계획 관리" });
    await user.click(within(settings).getByRole("button", { name: "매물 연결 해제" }));
    expect(await within(settings).findByText("매물 연결을 해제했습니다")).toBeInTheDocument();
    expect(within(settings).queryByRole("button", { name: "매물 연결 해제" })).toBeNull();
    expect(screen.queryByText(MISSING_TEXT)).not.toBeInTheDocument();
    const [unlinked] = storedPlans(storage);
    expect("listingId" in unlinked).toBe(false);
    expect(unlinked.items).toHaveLength(2);
    // 연결 해제는 매물 쪽을 건드리지 않는다
    expect(storage.getItem(LISTINGS_STORAGE_KEY)).toBe(listingsAfterDelete);
  });

  it("[매물 연결 해제]를 확인창에서 취소하면 연결이 그대로다", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const storage = storageWith([
      makePlanP({ id: "plan-linked", name: "연결 계획", listingId: RAEMIAN_ID, items: [] }),
    ]);
    renderApp(storage, "#/home/plan-linked");
    expect(await screen.findByText("연결된 매물 · 래미안 84")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "계획 관리" }));
    await user.click(screen.getByRole("button", { name: "매물 연결 해제" }));
    expect(storedPlans(storage)[0].listingId).toBe(RAEMIAN_ID);
    expect(screen.getByText("연결된 매물 · 래미안 84")).toBeInTheDocument();
  });

  it("공유 화면의 매물 줄에는 [인테리어 계획] 링크가 없다", async () => {
    const { id: _id, createdAt: _c, updatedAt: _u, ...shared } = raemian;
    void _id;
    void _c;
    void _u;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        const path = String(input);
        if (path === "/api/me") {
          return new Response(JSON.stringify({ user: null }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (path.startsWith("/api/shares/")) {
          return new Response(
            JSON.stringify({
              kind: "listing",
              listings: [shared],
              createdAt: "2026-10-20T00:00:00.000Z",
              expiresAt: "2099-01-01T00:00:00.000Z",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("{}", { status: 404 });
      }),
    );
    renderApp(createMemoryStorage(), "#/share/AbCdEfGhIjKlMnOpQrStUv");
    expect(await screen.findByText("래미안 84", { selector: "strong" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /인테리어 계획/ })).not.toBeInTheDocument();
    expect(document.querySelector('a[href^="#/home?listing"]')).toBeNull();
  });
});
