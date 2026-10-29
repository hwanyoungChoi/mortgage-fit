// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { REGULATION_BASE_DATE } from "@/lib/constants/loanRegulations";
import { PATHS } from "@/lib/constants/paths";
import { DRAFT_STORAGE_KEY } from "@/lib/utils/draftStorage";
import { LISTINGS_STORAGE_KEY } from "@/lib/utils/listingStorage";
import { makeListing } from "@/test/listingFixture";
import { createMemoryStorage } from "@/test/memoryStorage";
import { renderWithQueryClient } from "@/test/renderWithQueryClient";

import type { Listing } from "@/lib/types/listing";

const RESET_CONFIRM_MESSAGE =
  "손상된 저장 데이터를 삭제하고 빈 목록으로 시작합니다. 되돌릴 수 없으니 원문을 먼저 복사하세요";

function listingsWrites(setItem: { mock: { calls: unknown[][] } }) {
  return setItem.mock.calls.filter(([key]) => key === LISTINGS_STORAGE_KEY);
}

function storedListings(storage: Storage): Listing[] {
  return JSON.parse(storage.getItem(LISTINGS_STORAGE_KEY) ?? "null") as Listing[];
}

function baseDateText() {
  return screen.getByText(new RegExp(`규제 기준일 ${REGULATION_BASE_DATE}`));
}

/** 접힌 줄 버튼의 글자(이름 + 필요한 자기자금) */
function listingRows(list: HTMLElement) {
  return within(list)
    .getAllByRole("listitem")
    .map((item) => within(item).getByRole("button", { expanded: false }).textContent);
}

/** 줄을 펼치고 펼친 카드의 [수정]을 누른다(계산 화면으로 push). */
async function openListing(
  user: ReturnType<typeof userEvent.setup>,
  list: HTMLElement,
  name: string,
) {
  await user.click(
    within(list).getByRole("button", { name: new RegExp(`^${name}`), expanded: false }),
  );
  await user.click(within(list).getByRole("link", { name: `${name} 수정` }));
}

/** jsdom의 scrollY는 늘 0이다. 브라우저처럼 scrollTo가 scrollY를 바꾸게 해서 복원 순서까지 본다. */
function setScrollY(y: number) {
  Object.defineProperty(window, "scrollY", { value: y, configurable: true, writable: true });
}

function mockBrowserScroll() {
  return vi.spyOn(window, "scrollTo").mockImplementation(((x: number, y: number) => {
    void x;
    setScrollY(y);
  }) as typeof window.scrollTo);
}

describe("저장 흐름 (통합)", () => {
  // jsdom은 테스트 사이에 해시가 남는다.
  beforeEach(() => {
    window.location.hash = PATHS.calculator;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setScrollY(0);
  });

  it("#4 손상된 Storage를 주입하면 저장 버튼이 disabled이고 목록에 setItem하지 않으며, 목록 화면에 손상 문구와 초기화가 보인다 (AC-6d)", async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorage({ [LISTINGS_STORAGE_KEY]: "{" });
    const setItem = vi.spyOn(storage, "setItem");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderWithQueryClient(<AppRoutes storage={storage} />);

    // 손상돼도 계산은 동작한다.
    await user.type(screen.getByLabelText("매매가"), "125000");
    await user.type(screen.getByLabelText("KB시세"), "120000");
    expect(
      within(screen.getByRole("region", { name: "계산 결과" })).queryByText(
        "매매가와 KB시세를 입력하세요",
      ),
    ).not.toBeInTheDocument();

    const saveButton = screen.getByRole("button", { name: "저장" });
    expect(saveButton).toBeDisabled();
    expect(saveButton).toHaveAccessibleDescription(expect.stringContaining("손상"));
    await user.click(saveButton);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // draft는 쓰이지만(스파이가 살아 있다는 확인) 목록 키에는 한 번도 쓰지 않는다.
    expect(setItem).toHaveBeenCalledWith(DRAFT_STORAGE_KEY, expect.any(String));
    expect(listingsWrites(setItem)).toHaveLength(0);
    expect(storage.getItem(LISTINGS_STORAGE_KEY)).toBe("{");

    // 목록 화면: 손상 안내, 원문, 원문 복사, 목록 초기화
    await user.click(screen.getByRole("link", { name: "매물" }));
    expect(
      await screen.findByRole("heading", { name: "저장된 목록이 손상되어 불러올 수 없습니다" }),
    ).toBeInTheDocument();
    expect(baseDateText()).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "손상된 저장 원문" })).toHaveValue("{");

    await user.click(screen.getByRole("button", { name: "원문 복사" }));
    expect(await navigator.clipboard.readText()).toBe("{");

    // 확인을 취소하면 아무것도 지우지 않는다.
    await user.click(screen.getByRole("button", { name: "목록 초기화" }));
    expect(confirm).toHaveBeenCalledWith(RESET_CONFIRM_MESSAGE);
    expect(storage.getItem(LISTINGS_STORAGE_KEY)).toBe("{");
    expect(screen.getByRole("button", { name: "목록 초기화" })).toBeInTheDocument();

    // 확인하면 원문을 지우고 빈 목록이 된다.
    confirm.mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "목록 초기화" }));
    expect(await screen.findByText("저장한 매물이 없습니다")).toBeInTheDocument();
    expect(storage.getItem(LISTINGS_STORAGE_KEY)).toBeNull();
    expect(listingsWrites(setItem)).toHaveLength(0);

    // 초기화 뒤에는 계산 화면에서 다시 저장할 수 있다(draft 값은 남아 있다).
    await user.click(screen.getByRole("link", { name: "계산" }));
    expect(await screen.findByRole("button", { name: "저장" })).toBeEnabled();
    expect(screen.getByLabelText("매매가")).toHaveValue("125,000");
  });

  it("#5 불러온 매물을 덮어쓰기하면 목록 개수가 그대로이고, 목록 화면에 규제 기준일이 보인다 (AC-7, AC-5)", async () => {
    const user = userEvent.setup();
    const raemian = makeListing({
      id: "listing-a",
      name: "래미안 101동",
      salePrice: 125000,
      kbPrice: 120000,
      region: "regulated",
      borrower: "firstHome",
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    });
    // 규제지역·무주택 90000 → 한도 36000, 자기자금 54000 + 부대비용 3420 (래미안 65000 + 4875보다 작다)
    const xi = makeListing({
      id: "listing-b",
      name: "자이 3단지",
      salePrice: 90000,
      kbPrice: 90000,
      createdAt: "2026-10-02T00:00:00.000Z",
      updatedAt: "2026-10-02T00:00:00.000Z",
    });
    const storage = createMemoryStorage({
      [LISTINGS_STORAGE_KEY]: JSON.stringify([raemian, xi]),
    });
    window.location.hash = "#/listings";
    const scrollTo = mockBrowserScroll();
    renderWithQueryClient(<AppRoutes storage={storage} />);

    // 목록: 기준일, 2개, 직접 순서가 없어 최근 저장순
    expect(baseDateText()).toBeInTheDocument();
    // 로그인 확인(/api/me)이 끝나 출처가 정해진 뒤에 목록이 뜬다.
    let list = await screen.findByRole("list", { name: "저장한 매물 2개" });
    expect(listingRows(list)).toEqual([
      expect.stringMatching(/^자이 3단지/),
      expect.stringMatching(/^래미안 101동/),
    ]);

    // 스크롤 복원 (AC-8e): 목록 → 카드(push) → 계산 화면은 맨 위 → 뒤로 가기 → 같은 위치
    setScrollY(1500);
    const historyBeforeCard = window.history.length;
    await openListing(user, list, "래미안 101동");
    expect(await screen.findByLabelText("KB시세")).toBeInTheDocument();
    expect(window.location.hash).toBe("#/calculator");
    expect(window.history.length).toBe(historyBeforeCard + 1);
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
    expect(window.scrollY).toBe(0);

    window.history.back();
    list = await screen.findByRole("list", { name: "저장한 매물 2개" });
    expect(window.location.hash).toBe("#/listings");
    expect(scrollTo).toHaveBeenLastCalledWith(0, 1500);
    expect(window.scrollY).toBe(1500);

    // [수정]을 누르면 계산 화면에 그 매물 값이 채워지고 "저장됨"
    await openListing(user, list, "래미안 101동");
    const kbPrice = await screen.findByLabelText("KB시세");
    expect(screen.getByLabelText("매매가")).toHaveValue("125,000");
    expect(kbPrice).toHaveValue("120,000");
    expect(screen.getByRole("radio", { name: "규제지역" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "무주택·생애최초" })).toBeChecked();
    expect(screen.getByRole("button", { name: "저장됨" })).toBeDisabled();

    // KB시세를 고치면 "변경 저장"이 다시 활성화되고, 시트에서 덮어쓰기
    await user.clear(kbPrice);
    await user.type(kbPrice, "118000");
    await user.click(screen.getByRole("button", { name: "변경 저장" }));
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByRole("textbox", { name: "매물 이름" })).toHaveValue("래미안 101동");
    expect(within(sheet).getByRole("button", { name: "새로 저장" })).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "덮어쓰기" }));

    // 시트가 닫히고 계산 화면이 새 계산으로 비워지며(조건 유지), 알림이 뜨고 매매가로 포커스가 간다.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(window.location.hash).toBe("#/calculator");
    expect(screen.getByRole("status")).toHaveTextContent("'래미안 101동' 저장했습니다");
    expect(screen.getByLabelText("매매가")).toHaveValue("");
    expect(screen.getByLabelText("매매가")).toHaveFocus();
    expect(screen.getByLabelText("KB시세")).toHaveValue("");
    expect(screen.getByRole("radio", { name: "무주택·생애최초" })).toBeChecked();

    // 저장본: 같은 id를 갱신, 개수 그대로, createdAt 유지, updatedAt 갱신
    const saved = storedListings(storage);
    expect(saved).toHaveLength(2);
    expect(saved.map((listing) => listing.id)).toEqual(["listing-a", "listing-b"]);
    expect(saved[0]).toMatchObject({
      id: "listing-a",
      name: "래미안 101동",
      kbPrice: 118000,
      createdAt: "2026-10-01T00:00:00.000Z",
    });
    expect(saved[0].updatedAt).not.toBe("2026-10-01T00:00:00.000Z");
    expect(Number.isNaN(Date.parse(saved[0].updatedAt))).toBe(false);
    expect(saved[1]).toEqual(xi);

    // 목록 화면: 개수 그대로, 기준일 표시.
    // 탭 이동은 replace라 이력이 쌓이지 않고, 탭으로 들어온 목록은 저장된 위치(1500)가 아니라 맨 위에서 시작한다.
    const historyBeforeTab = window.history.length;
    scrollTo.mockClear();
    await user.click(screen.getByRole("link", { name: "매물" }));
    expect(await screen.findByRole("list", { name: "저장한 매물 2개" })).toBeInTheDocument();
    expect(baseDateText()).toBeInTheDocument();
    expect(window.location.hash).toBe("#/listings");
    expect(window.history.length).toBe(historyBeforeTab);
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
    expect(window.scrollY).toBe(0);

    // "새 계산"은 금액과 listingId를 비우고 조건은 유지한다:
    // 같은 값을 다시 입력해도 더는 그 매물의 "저장됨"이 아니다.
    await user.click(screen.getByRole("link", { name: "계산" }));
    await user.click(await screen.findByRole("button", { name: "초기화" }));
    expect(window.location.hash).toBe("#/calculator");
    expect(window.history.length).toBe(historyBeforeTab);
    expect(screen.getByLabelText("매매가")).toHaveValue("");
    expect(screen.getByLabelText("KB시세")).toHaveValue("");
    expect(screen.getByRole("radio", { name: "무주택·생애최초" })).toBeChecked();
    await user.type(screen.getByLabelText("매매가"), "125000");
    await user.type(screen.getByLabelText("KB시세"), "118000");
    expect(screen.getByRole("button", { name: "저장" })).toBeEnabled();
    expect(JSON.parse(storage.getItem(DRAFT_STORAGE_KEY) ?? "null")).toMatchObject({
      listingId: null,
    });
  });
});
