// @vitest-environment jsdom
// 스펙 interior-planner AC-6(로그인, 서버 출처) · ADR-029 조건 7·11:
// 카드는 계획 GET을 부르지 않는다, 만들기 POST 본문(가져오기 체크 해제면 items 키 없음), 매물 쪽 쓰기 요청 0회,
// 연결 계획 찾기는 매물 목록을 기다리지 않는다, 연결 끊김은 매물 목록 확정 로드 뒤에만, 연결 해제는 PATCH listingId: null.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { LOAN_REGULATIONS } from "@/lib/constants/loanRegulations";
import { createFakePlanApi, errorResponse, jsonResponse, PENDING } from "@/test/fakePlanApi";
import { makePlanP } from "@/test/interiorPlanFixture";
import { makeListing } from "@/test/listingFixture";
import { createMemoryStorage } from "@/test/memoryStorage";

import ListingCard from "../Listings/components/ListingCard";

import type { InteriorPlanCreateInput, InteriorPlanWithItems } from "@/lib/types/interiorPlan";
import type { Listing } from "@/lib/types/listing";
import type { FakePlanApi } from "@/test/fakePlanApi";

type User = ReturnType<typeof userEvent.setup>;

const RAEMIAN_ID = "listing-raemian";
const MISSING_TEXT = "연결된 매물이 삭제되었습니다";
const PLAN_LIST_PATH = "/api/interior-plans";

const raemian = makeListing({
  id: RAEMIAN_ID,
  name: "래미안 84",
  extraCosts: [
    { category: "interior", label: "도배", amount: 300 },
    { category: "interior", label: "샷시", amount: 1200 },
    { category: "appliance", label: "냉장고", amount: 400 },
  ],
});
const xi = makeListing({
  id: "listing-xi",
  name: "자이 59",
  createdAt: "2026-10-02T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/**
 * 계정 매물(서버 D1 `listings.data` 대신). GET은 이 배열을, DELETE는 지운다. `listingsGet`으로 GET 응답을 붙잡거나 바꾼다.
 * 그 밖의 매물 쓰기(PUT·PATCH·POST)는 받기만 하고 404 — 이 흐름에서 0회여야 한다.
 */
function setUp({
  plans = [],
  listingsGet,
}: {
  plans?: InteriorPlanWithItems[];
  listingsGet?: () => Response | Promise<Response> | typeof PENDING | undefined;
} = {}) {
  const api = createFakePlanApi({ userId: "user-a", plans });
  const serverListings: Listing[] = [structuredClone(raemian), structuredClone(xi)];
  const listingsRawBefore = JSON.stringify(serverListings);
  api.server.respond = (call) => {
    if (call.method === "GET" && call.path === "/api/listings") {
      return listingsGet?.() ?? jsonResponse(200, { listings: serverListings });
    }
    const listingPath = /^\/api\/listings\/([^/]+)$/.exec(call.path);
    if (listingPath !== null && call.method === "DELETE") {
      const index = serverListings.findIndex((listing) => listing.id === listingPath[1]);
      if (index === -1) return errorResponse(404, "notFound");
      serverListings.splice(index, 1);
      return new Response(null, { status: 204 });
    }
    return undefined;
  };
  return { api, serverListings, listingsRawBefore };
}

/** 매물 쪽 쓰기 요청(가져오기·연결·해제 흐름에서는 0이어야 한다) */
const listingWrites = (api: FakePlanApi) =>
  api.server.calls.filter((call) => call.path.startsWith("/api/listings") && call.method !== "GET");

const planListGets = (api: FakePlanApi) => api.callsTo("GET", PLAN_LIST_PATH);

function renderApp(api: FakePlanApi, hash: string) {
  window.location.hash = hash;
  return render(<AppRoutes storage={createMemoryStorage()} />, { wrapper: api.wrapper });
}

async function expandCard(user: User, name: string) {
  const list = await screen.findByRole("list", { name: /^저장한 매물/ });
  await user.click(
    await within(list).findByRole("button", { name: new RegExp(`^${name}`), expanded: false }),
  );
  return screen.findByRole("link", { name: `${name} 인테리어 계획` });
}

async function createFromCard(user: User, api: FakePlanApi, { keepImport = true } = {}) {
  await user.click(await expandCard(user, "래미안 84"));
  const sheet = await screen.findByRole("dialog", { name: "인테리어 계획 만들기" });
  if (!keepImport) {
    await user.click(
      within(sheet).getByRole("checkbox", { name: "추가 비용 인테리어 2줄 가져오기" }),
    );
  }
  await user.click(within(sheet).getByRole("button", { name: "만들기" }));
  await waitFor(() => expect(api.callsTo("POST", PLAN_LIST_PATH)).toHaveLength(1));
  await waitFor(() => expect(window.location.hash).toMatch(/^#\/home\/srvplan\d+$/));
  const { plan } = api.callsTo("POST", PLAN_LIST_PATH)[0].body as {
    plan: InteriorPlanCreateInput;
  };
  return plan;
}

describe("AC-6 매물 카드 → [우리 집] (로그인)", () => {
  beforeEach(() => {
    window.location.hash = "#/";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.location.hash = "#/";
  });

  it("카드 단독: 렌더·[인테리어 계획] 클릭 동안 fetch 0회(계획 쿼리 없음)", async () => {
    const user = userEvent.setup();
    const { api } = setUp();
    window.location.hash = "#/listings";
    render(
      <ListingCard
        listing={raemian}
        regulations={LOAN_REGULATIONS}
        onOpen={() => {}}
        budget={null}
        onCopy={() => {}}
        onDelete={() => {}}
        onShare={() => {}}
        onSaveMemo={async () => ({ ok: true })}
        onSaveName={async () => ({ ok: true })}
        onStatusOpen={() => {}}
        statusFailure={null}
        isPrivacyMode={false}
        revealedId={null}
        onRevealChange={() => {}}
      />,
      { wrapper: api.wrapper },
    );
    const link = screen.getByRole("link", { name: "래미안 84 인테리어 계획" });
    await user.click(link);
    await waitFor(() => expect(window.location.hash).toBe(`#/home?listing=${RAEMIAN_ID}`));
    expect(api.fetchMock).not.toHaveBeenCalled();
    expect(api.queryClient.getQueryCache().getAll()).toEqual([]);
  });

  it("앱: 저장 목록에서 카드를 펼쳐도 계획 GET 0회, 클릭 뒤 [우리 집]이 계획 목록을 한 번 받아 만들기 시트", async () => {
    const user = userEvent.setup();
    const { api } = setUp();
    renderApp(api, "#/listings");
    const link = await expandCard(user, "래미안 84");
    await expandCard(user, "자이 59");
    await waitFor(() => expect(api.callsTo("GET", "/api/listings").length).toBeGreaterThan(0));
    expect(planListGets(api)).toHaveLength(0);

    await user.click(link);
    expect(await screen.findByRole("dialog", { name: "인테리어 계획 만들기" })).toBeInTheDocument();
    expect(planListGets(api)).toHaveLength(1);
    expect(window.location.hash).toBe("#/home");
  });

  it("만들기 POST 본문: 이름·총 예산 15,000,000원(budgetWon)·listingId·items 2개(전체/도배 300·전체/샷시 1,200, 계획), 냉장고 없음, 매물 쓰기 0회", async () => {
    const user = userEvent.setup();
    const { api, serverListings, listingsRawBefore } = setUp();
    renderApp(api, "#/listings");
    const plan = await createFromCard(user, api);

    const whole = plan.spaces[0];
    expect(whole.name).toBe("전체");
    expect(plan).toMatchObject({ name: "래미안 84", budgetWon: 15_000_000, listingId: RAEMIAN_ID });
    expect(Object.hasOwn(plan, "budget")).toBe(false);
    expect(plan.items).toEqual([
      { spaceId: whole.id, trade: "도배", budget: 300, status: "planned" },
      { spaceId: whole.id, trade: "샷시", budget: 1200, status: "planned" },
    ]);
    expect(JSON.stringify(plan)).not.toContain("냉장고");
    expect(await screen.findByText("연결된 매물 · 래미안 84")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "도배 열기" })).toBeInTheDocument();
    expect(listingWrites(api)).toEqual([]);
    expect(JSON.stringify(serverListings)).toBe(listingsRawBefore);
  });

  it("가져오기 체크를 풀면 POST 본문 plan에 items 키가 없다", async () => {
    const user = userEvent.setup();
    const { api } = setUp();
    renderApp(api, "#/listings");
    const plan = await createFromCard(user, api, { keepImport: false });
    expect("items" in plan).toBe(false);
    expect(plan).toMatchObject({ name: "래미안 84", budgetWon: 15_000_000, listingId: RAEMIAN_ID });
    expect(Object.hasOwn(plan, "budget")).toBe(false);
  });

  it("만든 뒤 같은 카드: #/home/{planId}로 replace(이력 +1 = 링크 클릭뿐), 새 POST 없음, 매물 쓰기 0회", async () => {
    const user = userEvent.setup();
    const { api, serverListings, listingsRawBefore } = setUp();
    renderApp(api, "#/listings");
    await createFromCard(user, api);
    const planHash = window.location.hash;

    await user.click(screen.getByRole("link", { name: "매물" }));
    await waitFor(() => expect(window.location.hash).toBe("#/listings"));
    const historyBefore = window.history.length;
    await user.click(await expandCard(user, "래미안 84"));
    await waitFor(() => expect(window.location.hash).toBe(planHash));
    expect(window.history.length).toBe(historyBefore + 1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 1, name: "래미안 84" })).toBeInTheDocument();
    expect(api.callsTo("POST", PLAN_LIST_PATH)).toHaveLength(1);
    expect(listingWrites(api)).toEqual([]);
    expect(JSON.stringify(serverListings)).toBe(listingsRawBefore);
  });

  it("연결 계획이 여럿이면 첫 번째로, 매물 목록 응답을 기다리지 않는다", async () => {
    const { api } = setUp({
      plans: [
        makePlanP({ id: "plan-first", name: "첫 계획", listingId: RAEMIAN_ID, items: [] }),
        makePlanP({ id: "plan-second", name: "둘째 계획", listingId: RAEMIAN_ID, items: [] }),
      ],
      listingsGet: () => PENDING,
    });
    renderApp(api, `#/home?listing=${RAEMIAN_ID}`);
    await waitFor(() => expect(window.location.hash).toBe("#/home/plan-first"));
    expect(await screen.findByRole("heading", { level: 1, name: "첫 계획" })).toBeInTheDocument();
    // 매물 목록이 아직 없으니 연결 표시는 판단하지 않는다
    expect(screen.queryByText(MISSING_TEXT)).not.toBeInTheDocument();
    expect(screen.queryByText(/^연결된 매물 · /)).not.toBeInTheDocument();
  });

  it("연결 계획이 없고 매물 목록이 로딩이면 '매물을 확인하는 중'으로 기다렸다가, 받으면 만들기 시트", async () => {
    const listings = deferred<Response>();
    const { api } = setUp({ listingsGet: () => listings.promise });
    renderApp(api, `#/home?listing=${RAEMIAN_ID}`);
    expect(await screen.findByText("매물을 확인하는 중")).toBeInTheDocument();
    await waitFor(() => expect(planListGets(api)).toHaveLength(1));
    expect(window.location.hash).toBe(`#/home?listing=${RAEMIAN_ID}`);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "계획 만들기" })).not.toBeInTheDocument();

    listings.resolve(jsonResponse(200, { listings: [raemian, xi] }));
    const sheet = await screen.findByRole("dialog", { name: "인테리어 계획 만들기" });
    expect(within(sheet).getByRole("textbox", { name: "계획 이름" })).toHaveValue("래미안 84");
    await waitFor(() => expect(window.location.hash).toBe("#/home"));
  });

  it("매물 목록 조회 실패: 연결 계획이 없으면 안내(listingsUnavailable)·주소 #/home, 연결 계획 화면엔 끊김 문구 없음", async () => {
    const { api } = setUp({
      plans: [
        makePlanP({ id: "plan-linked", name: "연결 계획", listingId: RAEMIAN_ID, items: [] }),
      ],
      listingsGet: () => errorResponse(500, "internal"),
    });
    renderApp(api, "#/home?listing=listing-xi");
    expect(
      await screen.findByText(
        "저장 목록을 불러오지 못해 매물에서 계획을 만들 수 없습니다. 저장 목록을 확인해 주세요",
      ),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe("#/home");

    window.location.hash = "#/home/plan-linked";
    // 주소가 바뀌면 화면이 다시 그려진다(찾은 제목이 바로 바뀔 수 있어 waitFor로 본다)
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: "연결 계획" })).toBeInTheDocument(),
    );
    expect(screen.queryByText(MISSING_TEXT)).not.toBeInTheDocument();
  });

  it("연결 끊김은 매물 목록 확정 로드 뒤에만: 응답 전엔 문구 없음 → 매물 없는 목록을 받으면 문구, 플랜은 그대로", async () => {
    const listings = deferred<Response>();
    const { api } = setUp({
      plans: [
        makePlanP({ id: "plan-linked", name: "연결 계획", listingId: RAEMIAN_ID }), // P 항목 4개
      ],
      listingsGet: () => listings.promise,
    });
    renderApp(api, "#/home/plan-linked");
    expect(await screen.findByRole("heading", { level: 1, name: "연결 계획" })).toBeInTheDocument();
    await waitFor(() => expect(api.callsTo("GET", "/api/listings").length).toBeGreaterThan(0));
    expect(screen.queryByText(MISSING_TEXT)).not.toBeInTheDocument();

    listings.resolve(jsonResponse(200, { listings: [xi] }));
    expect(await screen.findByText(MISSING_TEXT)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "샷시 E샷시 열기" })).toBeInTheDocument();
    expect(api.server.plans[0].items).toHaveLength(4);
  });

  it("매물 삭제(DELETE) 뒤 연결 끊김 → [매물 연결 해제] = PATCH {listingId: null} → 문구 사라짐, 그 밖의 매물 쓰기 0회", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { api } = setUp();
    renderApp(api, "#/listings");
    await createFromCard(user, api);
    const planId = window.location.hash.replace("#/home/", "");

    await user.click(screen.getByRole("link", { name: "매물" }));
    await expandCard(user, "래미안 84");
    await user.click(screen.getByRole("button", { name: "래미안 84 삭제" }));
    await waitFor(() =>
      expect(api.callsTo("DELETE", `/api/listings/${RAEMIAN_ID}`)).toHaveLength(1),
    );

    window.location.hash = `#/home/${planId}`;
    expect(await screen.findByText(MISSING_TEXT)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "도배 열기" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "계획 관리" }));
    await user.click(screen.getByRole("button", { name: "매물 연결 해제" }));
    await waitFor(() =>
      expect(api.callsTo("PATCH", `${PLAN_LIST_PATH}/${planId}`)).toHaveLength(1),
    );
    expect(api.callsTo("PATCH", `${PLAN_LIST_PATH}/${planId}`)[0].body).toEqual({
      plan: { listingId: null },
    });
    await waitFor(() => expect(screen.queryByText(MISSING_TEXT)).not.toBeInTheDocument());
    expect("listingId" in api.server.plans[0]).toBe(false);
    expect(api.server.plans[0].items).toHaveLength(2);
    // 매물 쪽 쓰기는 사용자가 누른 삭제 하나뿐
    expect(listingWrites(api).map((call) => `${call.method} ${call.path}`)).toEqual([
      `DELETE /api/listings/${RAEMIAN_ID}`,
    ]);
  });
});
