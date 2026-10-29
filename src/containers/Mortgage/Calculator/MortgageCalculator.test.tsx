// @vitest-environment jsdom
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AppRoutes from "@/AppRoutes";
import { LAWD_CODES } from "@/lib/constants/lawdCodes";
import { PATHS } from "@/lib/constants/paths";
import DETAIL_SCREEN_TEXT from "@/lib/utils/__fixtures__/screenText/assumed-01-detail.txt?raw";
import JEONSE_SCREEN_TEXT from "@/lib/utils/__fixtures__/screenText/assumed-03-jeonse.txt?raw";
import { LISTINGS_STORAGE_KEY } from "@/lib/utils/listingStorage";
import { TRADE_LOOKUP_STORAGE_KEY } from "@/lib/utils/tradeLookupStorage";
import { renderWithQueryClient } from "@/test/renderWithQueryClient";

import type { AptTradesResponse } from "@/lib/types/aptTrade";

function resultCard() {
  return screen.getByRole("region", { name: "계산 결과" });
}

/** 결과 카드에서 라벨(dt) 옆의 값(첫 dd) */
function rowValue(label: string): string {
  const term = within(resultCard()).getByText(label, { selector: "dt" });
  return term.parentElement?.querySelector("dd")?.textContent ?? "";
}

function summaryBar() {
  return screen.getByRole("region", { name: "계산 요약" });
}

/** 고정 요약 바에서 라벨(dt) 옆의 값. 결과 카드와 요약 바 모두 "—"일 수 있어 영역별로 조회한다. */
function summaryValue(label: string): string {
  const term = within(summaryBar()).getByText(label, { selector: "dt" });
  return term.parentElement?.querySelector("dd")?.textContent ?? "";
}

async function retype(
  user: ReturnType<typeof userEvent.setup>,
  element: HTMLElement,
  text: string,
) {
  await user.clear(element);
  await user.type(element, text);
}

const BORROWER_RADIO_NAMES = [
  "무주택",
  "무주택·생애최초",
  "무주택·서민실수요자",
  "1주택 처분조건부",
  "1주택 미처분(추가구입)",
];
const UNVERIFIED_REQUIREMENTS = "소득·무주택세대주 요건은 확인하지 않았습니다";

const GANGNAM_TRADES: AptTradesResponse = {
  lawdCd: "11680",
  months: ["202610", "202609", "202608"],
  items: [
    {
      aptName: "래미안OO",
      umdName: "대치동",
      exclusiveArea: 84.97,
      floor: 12,
      dealAmount: 115000,
      dealDate: "2026-10-03",
    },
    {
      aptName: "은마",
      umdName: "대치동",
      exclusiveArea: 76.79,
      floor: null,
      dealAmount: 98000,
      dealDate: "2026-09-21",
    },
  ],
  source: {
    name: "국토교통부 아파트 매매 실거래가",
    url: "https://www.data.go.kr/data/15126469/openapi.do",
  },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

/** 가짜 fetch가 받은 요청 URL들의 쿼리 */
function requestedQueries(fetchMock: { mock: { calls: unknown[][] } }) {
  return fetchMock.mock.calls.map(([url]) => {
    const parsed = new URL(String(url), "http://localhost");
    expect(parsed.pathname).toBe("/api/apt-trades");
    return Object.fromEntries(parsed.searchParams);
  });
}

// 실제 OCR 엔진(wasm·Worker)은 jsdom에서 돌리지 않는다. 시트는 이 모킹 세션으로 인식 결과를 받는다.
const ocr = vi.hoisted(() => ({ recognize: vi.fn(), terminate: vi.fn() }));
vi.mock("@/lib/utils/ocrSession", () => ({ createOcrSession: () => ocr }));

describe("계산 화면 (통합)", () => {
  // draft가 localStorage에 남으므로 테스트마다 빈 저장소와 계산 화면에서 시작한다.
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = PATHS.calculator;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("#1 매매가에 0을 입력하고 blur하면 그 필드 아래에 오류가 뜨고 저장 시트가 열리지 않는다 (AC-8b)", async () => {
    const user = userEvent.setup();
    // AC-8c: 정규 경로가 아닌 계산 주소로 들어오면 계산 화면을 보이고 주소를 #/calculator로 replace한다(이력이 늘지 않는다).
    window.location.hash = "#/calculator?a=1";
    const historyLength = window.history.length;
    renderWithQueryClient(<AppRoutes />);
    await waitFor(() => expect(window.location.hash).toBe("#/calculator"));
    expect(window.history.length).toBe(historyLength);

    const salePrice = screen.getByLabelText("매매가");
    const kbPrice = screen.getByLabelText("KB시세");

    expect(salePrice).toHaveAttribute("inputmode", "numeric");
    expect(kbPrice).toHaveAttribute("inputmode", "numeric");

    // 한글 금액은 aria-describedby로 연결되고 입력 즉시 갱신된다.
    await user.type(kbPrice, "125000");
    expect(kbPrice).toHaveValue("125,000");
    expect(kbPrice).toHaveAccessibleDescription("12억 5,000만원");

    // 대조군: 두 금액이 유효하면 저장 버튼이 활성이고 누르면 저장 시트가 열린다.
    await user.type(salePrice, "125000");
    const barSaveButton = screen.getByRole("button", { name: "저장" });
    await user.click(barSaveButton);
    let sheet = screen.getByRole("dialog");
    // 시트가 열린 동안 뒤 화면은 inert다.
    expect(salePrice.closest("[inert]")).not.toBeNull();
    expect(barSaveButton.closest("[inert]")).not.toBeNull();
    expect(sheet.closest("[inert]")).toBeNull();

    // 이름 없이 제출하면 저장하지 않고 포커스를 이름 필드(첫 오류 필드)로 옮긴다.
    const nameInput = within(sheet).getByRole("textbox", { name: "매물 이름" });
    const submitButton = within(sheet).getByRole("button", { name: "저장" });
    await user.click(submitButton);
    expect(within(sheet).getByText("매물 이름을 입력하세요")).toBeInTheDocument();
    expect(localStorage.getItem(LISTINGS_STORAGE_KEY)).toBeNull();
    expect(nameInput).toHaveFocus();
    expect(nameInput).toHaveAttribute("aria-invalid", "true");

    // Esc는 취소다. 시트가 닫히고 포커스가 저장 버튼으로 돌아온다.
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(barSaveButton).toHaveFocus();
    expect(salePrice.closest("[inert]")).toBeNull();

    await user.click(barSaveButton);
    sheet = screen.getByRole("dialog");
    await user.click(within(sheet).getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(barSaveButton).toHaveFocus();

    await user.clear(salePrice);
    await user.type(salePrice, "0");
    // 오류는 입력 중이 아니라 blur 시점에 뜬다.
    expect(screen.queryByText("0보다 큰 금액을 입력하세요")).not.toBeInTheDocument();

    await user.tab();
    const error = screen.getByText("0보다 큰 금액을 입력하세요");
    expect(salePrice).toHaveAttribute("aria-invalid", "true");
    expect(salePrice).toHaveAccessibleDescription(expect.stringContaining(error.textContent ?? ""));
    // 오류는 매매가 칸에만 붙는다.
    expect(salePrice.closest("div")?.parentElement).toContainElement(error);
    expect(kbPrice).toHaveAttribute("aria-invalid", "false");
    expect(kbPrice).not.toHaveAccessibleDescription(expect.stringContaining("0보다 큰"));

    // 유효하지 않은 금액이 있으면 결과 카드는 빈 상태이고 저장할 수 없다.
    expect(within(resultCard()).getByText("매매가와 KB시세를 입력하세요")).toBeInTheDocument();
    const saveButton = screen.getByRole("button", { name: "저장" });
    expect(saveButton).toBeDisabled();
    await user.click(saveButton);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "매물 이름" })).not.toBeInTheDocument();
  });

  it("#3 처음 열면 규제지역·무주택이 선택돼 있고, 보유 상태 라디오 5개가 순서대로 각각 대응하는 borrower로 계산되며, 서민·실수요자는 요건 안내와 요건 미충족(ineligible)을 보인다 (1차 AC-2, 2차 AC-1c)", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<AppRoutes />);

    expect(screen.getByRole("radio", { name: "규제지역" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "무주택" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "70%" })).toBeChecked();
    // 넷째는 추가 비용 분류(기본 인테리어, ADR-024)
    expect(screen.getAllByRole("radio", { checked: true })).toHaveLength(4);

    // 보유 상태 라디오는 5개이고 화면 순서가 스펙과 같다.
    const borrowerRadios = within(screen.getByRole("group", { name: "보유 상태" })).getAllByRole(
      "radio",
    );
    expect(borrowerRadios).toHaveLength(BORROWER_RADIO_NAMES.length);
    BORROWER_RADIO_NAMES.forEach((name, index) => {
      expect(borrowerRadios[index]).toHaveAccessibleName(name);
    });
    // 요건 안내는 서민·실수요자를 고를 때만 보인다.
    expect(screen.queryByText("주택가격 8억원 이하")).not.toBeInTheDocument();

    // 시나리오 1: 매매가 12억 5,000만, KB시세 12억 → 담보 기준 12억, 상한 6억(15억 이하 구간)
    await user.type(screen.getByLabelText("매매가"), "125000");
    await user.type(screen.getByLabelText("KB시세"), "120000");

    // 기본값은 LTV 70% 칩이다(ADR-022). 보유 상태별 규제 LTV를 보려고 [규제대로]를 고른다.
    await user.click(screen.getByRole("radio", { name: "규제대로(40%)" }));

    // 규제지역·무주택 40%로 계산된다. 자기자금 = 매매가 − 한도 + 취득세 등·중개보수 4,875
    expect(within(resultCard()).getByRole("heading")).toHaveTextContent("규제지역 · 무주택");
    expect(rowValue("적용 LTV")).toBe("40%");
    expect(rowValue("예상 한도")).toBe("4억 8,000만원");
    expect(rowValue("필요한 자기자금")).toBe("8억 1,875만원");

    const cases = [
      // 라디오 이름, 조건 요약, 적용 LTV, LTV 금액, 예상 한도, 자기자금
      [
        "무주택·생애최초",
        "규제지역 · 무주택·생애최초",
        "70%",
        "8억 4,000만원",
        "6억원",
        "6억 9,875만원",
      ],
      [
        "1주택 처분조건부",
        "규제지역 · 1주택 처분조건부",
        "40%",
        "4억 8,000만원",
        "4억 8,000만원",
        "8억 1,875만원",
      ],
      [
        "1주택 미처분(추가구입)",
        "규제지역 · 1주택 미처분(추가구입)",
        "LTV 0% · 주택구입 목적 주담대 불가",
        "0만원",
        "0만원",
        // 조정대상지역 2주택 중과 8%: 부대비용 11,250
        "13억 6,250만원",
      ],
      ["무주택", "규제지역 · 무주택", "40%", "4억 8,000만원", "4억 8,000만원", "8억 1,875만원"],
    ];

    for (const [radio, condition, ltv, ltvAmount, loanLimit, ownFunds] of cases) {
      await user.click(screen.getByRole("radio", { name: radio }));
      expect(screen.getByRole("radio", { name: radio })).toBeChecked();
      expect(within(resultCard()).getByRole("heading")).toHaveTextContent(condition);
      expect(rowValue("적용 LTV")).toBe(ltv);
      expect(rowValue("LTV 금액")).toBe(ltvAmount);
      expect(rowValue("예상 한도")).toBe(loanLimit);
      expect(rowValue("필요한 자기자금")).toBe(ownFunds);
    }

    // 소재지 선택도 계산에 전달된다: 비수도권·생애최초 80%, 상한 없음
    await user.click(screen.getByRole("radio", { name: "무주택·생애최초" }));
    await user.click(screen.getByRole("radio", { name: "비수도권" }));
    expect(within(resultCard()).getByRole("heading")).toHaveTextContent(
      "비수도권 · 무주택·생애최초",
    );
    expect(rowValue("적용 LTV")).toBe("80%");
    expect(rowValue("한도 상한")).toBe("적용 안 함");
    expect(rowValue("예상 한도")).toBe("9억 6,000만원");
    expect(rowValue("필요한 자기자금")).toBe("3억 3,875만원");

    // 서민·실수요자(시나리오 1): 규제지역 7억 → 요건 안내 3줄, LTV 60%, 결과 카드의 "확인 안 함" 문구
    await user.click(screen.getByRole("radio", { name: "규제지역" }));
    await retype(user, screen.getByLabelText("매매가"), "70000");
    await retype(user, screen.getByLabelText("KB시세"), "70000");
    await user.click(screen.getByRole("radio", { name: "무주택·서민실수요자" }));
    expect(screen.getByRole("radio", { name: "무주택·서민실수요자" })).toBeChecked();
    expect(screen.getByText("부부합산 연소득 9,000만원 이하")).toBeInTheDocument();
    expect(screen.getByText("주택가격 8억원 이하")).toBeInTheDocument();
    expect(screen.getByText("무주택세대주")).toBeInTheDocument();
    expect(within(resultCard()).getByRole("heading")).toHaveTextContent(
      "규제지역 · 무주택·서민실수요자",
    );
    expect(within(resultCard()).getByText(UNVERIFIED_REQUIREMENTS)).toBeInTheDocument();
    expect(rowValue("적용 LTV")).toBe("60%");
    expect(rowValue("예상 한도")).toBe("4억 2,000만원");
    expect(rowValue("필요한 자기자금")).toBe("2억 9,566만원");
    expect(within(summaryBar()).queryByText("요건 미충족")).not.toBeInTheDocument();

    // 시나리오 2: 85000/84000 → 판정가 8억 5,000만원(매매가) 초과로 ineligible. 한도·자기자금은 정확히 "—"
    await retype(user, screen.getByLabelText("매매가"), "85000");
    await retype(user, screen.getByLabelText("KB시세"), "84000");
    expect(rowValue("적용 LTV")).toBe("요건 미충족");
    expect(rowValue("예상 한도")).toBe("—");
    expect(rowValue("필요한 자기자금")).toBe("—");
    expect(within(resultCard()).getByText(/주택가격 8억 5,000만원\(매매가\)/)).toBeInTheDocument();
    expect(within(resultCard()).getByText(UNVERIFIED_REQUIREMENTS)).toBeInTheDocument();
    expect(within(summaryBar()).getByText("요건 미충족")).toBeInTheDocument();
    expect(summaryValue("예상 한도")).toBe("—");
    expect(summaryValue("필요한 자기자금")).toBe("—");
    // 요건 미충족이어도 금액이 유효하면 저장할 수 있다.
    expect(screen.getByRole("button", { name: "저장" })).toBeEnabled();

    // 보유 상태를 "무주택"으로 바꾸면 다시 계산되고 안내·태그가 사라진다(84000 × 40%).
    await user.click(screen.getByRole("radio", { name: "무주택" }));
    expect(rowValue("적용 LTV")).toBe("40%");
    expect(rowValue("예상 한도")).toBe("3억 3,600만원");
    expect(summaryValue("예상 한도")).toBe("3억 3,600만원");
    expect(within(summaryBar()).queryByText("요건 미충족")).not.toBeInTheDocument();
    expect(screen.queryByText("주택가격 8억원 이하")).not.toBeInTheDocument();
    expect(within(resultCard()).queryByText(UNVERIFIED_REQUIREMENTS)).not.toBeInTheDocument();
  });

  it("#6 LTV 직접 입력: 70이면 사용자 지정 LTV 70%와 규제 기준 40%를 함께 보이고, 켠 채 비우면 즉시 안내하며 저장할 수 없다. 0이면 한도 0만원, 새 계산은 직접 입력을 기본 70으로 되돌린다 (AC-2d, ADR-022)", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<AppRoutes />);
    const salePrice = screen.getByLabelText("매매가");
    const kbPrice = screen.getByLabelText("KB시세");
    await user.type(salePrice, "100000");
    await user.type(kbPrice, "100000");

    // 기본값: 70% 칩(ADR-022). [직접 입력]을 고르면 그 값을 이어받은 % 칸이 나타난다.
    expect(screen.getByRole("radio", { name: "70%" })).toBeChecked();
    expect(screen.queryByLabelText("사용자 지정 LTV")).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "직접 입력" }));
    const ltvInput = screen.getByLabelText("사용자 지정 LTV");
    expect(ltvInput).toHaveValue("70");

    // 켠 채 비어 있으면: 입력 칸 아래 즉시 안내(blur 전), 결과 카드 빈 상태, 저장 비활성
    await user.clear(ltvInput);
    expect(ltvInput).toHaveValue("");
    expect(ltvInput).toHaveAttribute("inputmode", "numeric");
    expect(ltvInput).toHaveAccessibleDescription("값을 입력하거나 다른 LTV를 고르세요");
    expect(
      within(resultCard()).getByText("LTV를 입력하거나 다른 LTV를 고르세요"),
    ).toBeInTheDocument();
    expect(within(resultCard()).queryByRole("heading")).not.toBeInTheDocument();
    expect(summaryValue("예상 한도")).toBe("—");
    const saveButton = screen.getByRole("button", { name: "저장" });
    expect(saveButton).toBeDisabled();
    await user.click(saveButton);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // 70: 결과 카드·조건 요약·요약 바에 "사용자 지정 LTV 70%", 규제 기준 40% 병기, 상한 유지(7억 → 6억), 초과 경고
    await user.type(ltvInput, "70");
    expect(ltvInput).not.toHaveAccessibleDescription(expect.stringContaining("값을 입력하거나"));
    expect(rowValue("적용 LTV")).toContain("사용자 지정 LTV 70%");
    expect(within(resultCard()).getByText("규제 기준 40%")).toBeInTheDocument();
    expect(within(resultCard()).getByText("한도 상한은 규제대로 적용")).toBeInTheDocument();
    expect(
      within(resultCard()).getByText("실제 대출은 규제 기준(40%)으로 나올 수 있습니다"),
    ).toBeInTheDocument();
    expect(within(resultCard()).getByRole("heading")).toHaveTextContent(
      "규제지역 · 무주택 · 사용자 지정 LTV 70%",
    );
    expect(rowValue("LTV 금액")).toBe("7억원");
    expect(rowValue("예상 한도")).toBe("6억원");
    expect(within(summaryBar()).getByText("사용자 지정 LTV 70%")).toBeInTheDocument();
    expect(summaryValue("예상 한도")).toBe("6억원");
    expect(screen.getByRole("button", { name: "저장" })).toBeEnabled();

    // 규제와 같은 값(40)이면 경고가 없다.
    await retype(user, ltvInput, "40");
    expect(within(resultCard()).getByText("규제 기준 40%")).toBeInTheDocument();
    expect(within(resultCard()).queryByText(/실제 대출은 규제 기준/)).not.toBeInTheDocument();

    // 0: 한도는 "—"가 아니라 0만원, 자기자금은 매매가 전액 + 부대비용 3,800
    await retype(user, ltvInput, "0");
    expect(rowValue("예상 한도")).toBe("0만원");
    expect(rowValue("필요한 자기자금")).toBe("10억 3,800만원");
    expect(summaryValue("예상 한도")).toBe("0만원");
    expect(within(summaryBar()).getByText("사용자 지정 LTV 0%")).toBeInTheDocument();

    // 오류는 blur 시점에 입력 칸 아래에 뜨고, 결과 카드는 빈 상태다.
    await retype(user, ltvInput, "70.5");
    await user.tab();
    expect(ltvInput).toHaveAttribute("aria-invalid", "true");
    expect(ltvInput).toHaveAccessibleDescription("정수(%)로 입력하세요");
    expect(
      within(resultCard()).getByText("LTV를 입력하거나 다른 LTV를 고르세요"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();

    // 서민·실수요자 + 90000/90000 + 60: 사용자 지정이 우선하고 규제 기준은 요건 미충족
    await retype(user, salePrice, "90000");
    await retype(user, kbPrice, "90000");
    await user.click(screen.getByRole("radio", { name: "무주택·서민실수요자" }));
    await retype(user, ltvInput, "60");
    expect(rowValue("적용 LTV")).toContain("사용자 지정 LTV 60%");
    expect(
      within(resultCard()).getByText("규제 기준: 서민·실수요자 요건 미충족"),
    ).toBeInTheDocument();
    expect(rowValue("예상 한도")).toBe("5억 4,000만원");
    expect(within(summaryBar()).getByText("사용자 지정 LTV 60%")).toBeInTheDocument();
    expect(within(summaryBar()).queryByText("요건 미충족")).not.toBeInTheDocument();

    // 상한 없는 지역(비수도권)이면 "한도 상한은 규제대로 적용"이 없다.
    await user.click(screen.getByRole("radio", { name: "무주택" }));
    await user.click(screen.getByRole("radio", { name: "비수도권" }));
    expect(within(resultCard()).getByText("규제 기준 70%")).toBeInTheDocument();
    expect(within(resultCard()).queryByText("한도 상한은 규제대로 적용")).not.toBeInTheDocument();
    expect(rowValue("예상 한도")).toBe("5억 4,000만원");

    // [규제대로]면 규제 LTV로 돌아가고, 다시 [직접 입력]을 고르면 기본 70이 채워진다.
    await user.click(screen.getByRole("radio", { name: "규제대로(70%)" }));
    expect(screen.queryByLabelText("사용자 지정 LTV")).not.toBeInTheDocument();
    expect(rowValue("적용 LTV")).toBe("70%");
    expect(within(summaryBar()).queryByText(/사용자 지정 LTV/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "직접 입력" }));
    expect(screen.getByLabelText("사용자 지정 LTV")).toHaveValue("70");

    // "새 계산"은 LTV를 기본 70% 칩으로 되돌린다(소재지·보유 상태는 유지).
    await retype(user, screen.getByLabelText("사용자 지정 LTV"), "55");
    expect(within(summaryBar()).getByText("사용자 지정 LTV 55%")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "초기화" }));
    expect(screen.getByRole("radio", { name: "70%" })).toBeChecked();
    expect(screen.queryByLabelText("사용자 지정 LTV")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "비수도권" })).toBeChecked();
    await user.type(screen.getByLabelText("매매가"), "100000");
    await user.type(screen.getByLabelText("KB시세"), "100000");
    expect(rowValue("적용 LTV")).toContain("사용자 지정 LTV 70%");
    expect(within(summaryBar()).getByText("사용자 지정 LTV 70%")).toBeInTheDocument();
  });

  it("#7 실거래가 시트: 시도·시군구를 고르면 lawdCd·months=3으로 조회해 행을 보이고, 설정 오류는 다시 시도 없이 안내하며, 닫았다 열면 캐시에서 뜨고 새 계산은 단지명만 비운다 (AC-5a, AC-5b)", async () => {
    const user = userEvent.setup();
    let resolveGangnam: (response: Response) => void = () => {};
    const fetchMock = vi.fn((url: string) => {
      const lawdCd = new URL(url, "http://localhost").searchParams.get("lawdCd");
      if (lawdCd === "11680") {
        return new Promise<Response>((resolve) => {
          resolveGangnam = resolve;
        });
      }
      return Promise.resolve(
        jsonResponse({ error: "notConfigured", message: "MOLIT_SERVICE_KEY" }, 503),
      );
    });
    // 앱 시작 때의 로그인 확인(/api/me)은 실거래가 요청 기록에 넣지 않는다.
    vi.stubGlobal("fetch", (url: string) =>
      url === "/api/me" ? Promise.resolve(jsonResponse({ user: null })) : fetchMock(url),
    );
    renderWithQueryClient(<AppRoutes />);

    const openButton = screen.getByRole("button", { name: "이 지역 실거래가 보기" });
    await user.click(openButton);
    let sheet = screen.getByRole("dialog", { name: "이 지역 실거래가" });
    const sigunguOf = () => within(sheet).getByLabelText<HTMLSelectElement>("시군구");
    expect(sigunguOf()).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();

    // 시도를 고르면 그 시도의 시군구만 나온다.
    await user.selectOptions(within(sheet).getByLabelText("시도"), "서울특별시");
    const seoulCodes = LAWD_CODES.filter((entry) => entry.sido === "서울특별시").map(
      (entry) => entry.code,
    );
    const optionValues = [...sigunguOf().options].map((option) => option.value).filter(Boolean);
    expect(optionValues).toEqual(seoulCodes);

    // 설정 오류(503 notConfigured): 문구가 결과 자리에 뜨고 다시 시도 버튼은 없다.
    await user.selectOptions(sigunguOf(), "11110");
    expect(
      await within(sheet).findByText("서버 설정이 끝나지 않았습니다(서비스키 미등록)"),
    ).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
    expect(requestedQueries(fetchMock)).toEqual([{ lawdCd: "11110", months: "3" }]);

    // 시도를 바꾸면 시군구는 "선택" 초기값으로 돌아간다.
    await user.selectOptions(within(sheet).getByLabelText("시도"), "경기도");
    expect(sigunguOf()).toHaveValue("");

    // 시군구를 고르면 즉시 기억하고 조회한다. 로딩 표시 뒤에 행이 만원 금액으로 나온다.
    await user.selectOptions(within(sheet).getByLabelText("시도"), "서울특별시");
    await user.selectOptions(sigunguOf(), "11680");
    expect(JSON.parse(localStorage.getItem(TRADE_LOOKUP_STORAGE_KEY) ?? "null")).toEqual({
      lawdCd: "11680",
    });
    expect(
      within(sheet).getByRole("status", { name: "실거래가를 불러오는 중" }),
    ).toBeInTheDocument();
    resolveGangnam(jsonResponse(GANGNAM_TRADES));
    const rows = await within(sheet).findAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("래미안OO")).toBeInTheDocument();
    expect(within(rows[0]).getByText("11억 5,000만원")).toBeInTheDocument();
    expect(within(rows[1]).getByText("9억 8,000만원")).toBeInTheDocument();
    expect(within(sheet).getByText(/최근 3개월 · 2건/)).toBeInTheDocument();
    expect(within(sheet).getByText("참고용이며 계산에 반영하지 않습니다")).toBeInTheDocument();
    expect(requestedQueries(fetchMock).at(-1)).toEqual({ lawdCd: "11680", months: "3" });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // 닫았다 열면 같은 시군구가 선택돼 있고 재조회 없이 캐시에서 뜬다.
    await user.click(within(sheet).getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(openButton).toHaveFocus();
    await user.click(openButton);
    sheet = screen.getByRole("dialog", { name: "이 지역 실거래가" });
    expect(sigunguOf()).toHaveValue("11680");
    expect(within(sheet).getAllByRole("listitem")).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // 단지명을 타이핑하는 동안은 요청이 나가지 않고, "조회"를 누를 때 나간다.
    const aptNameInput = within(sheet).getByLabelText("단지명(선택)");
    await user.type(aptNameInput, " 래미안 ");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    resolveGangnam = () => {};
    await user.click(within(sheet).getByRole("button", { name: "조회" }));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(requestedQueries(fetchMock).at(-1)).toEqual({
      lawdCd: "11680",
      months: "3",
      aptName: "래미안",
    });

    // 새 계산 뒤: 단지명은 비고 시군구 기억은 남는다. 단지명 없는 조회는 캐시에 있어 재조회하지 않는다.
    await user.click(within(sheet).getByRole("button", { name: "닫기" }));
    await user.click(screen.getByRole("button", { name: "초기화" }));
    await user.click(openButton);
    sheet = screen.getByRole("dialog", { name: "이 지역 실거래가" });
    expect(within(sheet).getByLabelText("단지명(선택)")).toHaveValue("");
    expect(sigunguOf()).toHaveValue("11680");
    expect(within(sheet).getAllByRole("listitem")).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("#8 스크린샷: 이미지를 고르면 인식 중 진행과 취소가 보이고, 끝나면 미리보기에 매매가·단지·면적과 적용 안내가 보이며, 적용 전에는 입력이 그대로다. 적용하면 매매가를 채우고 KB시세를 비워 포커스하고 매물 연결을 풀고 LTV를 기본 70으로 되돌리며 저장 이름을 제안한다. 전세 화면이면 적용할 수 없고, 시트를 닫으면 인식을 멈춘다 (AC-2, AC-3)", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<AppRoutes />);
    await user.type(screen.getByLabelText("매매가"), "100000");
    await user.type(screen.getByLabelText("KB시세"), "98000");
    // 저장하면 새 계산으로 비워지므로, 목록에서 그 매물을 "수정"으로 열어 편집 중으로 만든다.
    await user.click(screen.getByRole("button", { name: "저장" }));
    await user.type(screen.getByRole("textbox", { name: "매물 이름" }), "이전 매물");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "저장" }));
    expect(screen.getByLabelText("매매가")).toHaveValue("");
    await user.click(screen.getByRole("link", { name: "매물" }));
    // 목록은 한 줄씩이라 줄을 펼친 뒤 [수정]을 누른다.
    await user.click(await screen.findByRole("button", { name: /^이전 매물/, expanded: false }));
    await user.click(screen.getByRole("link", { name: "이전 매물 수정" }));
    const salePrice = await screen.findByLabelText("매매가");
    const kbPrice = screen.getByLabelText("KB시세");
    await user.click(screen.getByRole("radio", { name: "직접 입력" }));
    await retype(user, screen.getByLabelText("사용자 지정 LTV"), "55");

    let finishRecognition: (text: string) => void = () => {};
    ocr.recognize.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          finishRecognition = resolve;
        }),
    );
    const openButton = screen.getByRole("button", { name: "스크린샷으로 채우기" });
    await user.click(openButton);
    let sheet = screen.getByRole("dialog", { name: "스크린샷으로 채우기" });
    expect(
      within(sheet).getByText("이미지는 이 기기 안에서만 읽고 어디에도 보내지 않습니다"),
    ).toBeInTheDocument();
    const screenshot = new File(["png"], "detail.png", { type: "image/png" });
    await user.upload(within(sheet).getByLabelText("스크린샷 파일"), screenshot);
    expect(ocr.recognize).toHaveBeenCalledWith(screenshot, expect.any(Function));
    expect(
      within(sheet).getByText("인식 준비 중…(처음 한 번 약 6MB 내려받음)"),
    ).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "취소" })).toBeInTheDocument();

    await act(async () => finishRecognition(DETAIL_SCREEN_TEXT));
    const factValue = (label: string) =>
      within(sheet).getByText(label, { selector: "dt" }).parentElement?.querySelector("dd")
        ?.textContent;
    expect(factValue("매매가")).toBe("12억 5,000만원");
    expect(factValue("단지(추정)")).toBe("래미안OO");
    expect(factValue("면적")).toBe("84.97㎡");
    expect(within(sheet).getByText("KB시세는 비워집니다")).toBeInTheDocument();
    expect(
      within(sheet).getByText("불러온 매물에 덮어쓰지 않고 새 매물로 계산합니다"),
    ).toBeInTheDocument();
    expect(within(sheet).getByText("LTV는 기본 70%로 돌아갑니다")).toBeInTheDocument();
    // 적용 전에는 뒤 화면 입력이 바뀌지 않는다.
    expect(salePrice).toHaveValue("100,000");
    expect(kbPrice).toHaveValue("98,000");

    await user.click(within(sheet).getByRole("button", { name: "적용" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // 적용은 입력부를 다시 그리므로 칸을 새로 찾는다.
    expect(screen.getByLabelText("매매가")).toHaveValue("125,000");
    const appliedKbPrice = screen.getByLabelText("KB시세");
    expect(appliedKbPrice).toHaveValue("");
    expect(appliedKbPrice).toHaveFocus();
    expect(screen.getByRole("radio", { name: "70%" })).toBeChecked();
    expect(screen.queryByLabelText("사용자 지정 LTV")).not.toBeInTheDocument();

    // KB시세를 채우고 저장 시트를 열면 덮어쓰기가 아닌 새 저장이고, 이름 칸에 제안 이름이 들어 있다.
    await user.type(appliedKbPrice, "120000");
    await user.click(screen.getByRole("button", { name: "저장" }));
    const saveSheet = screen.getByRole("dialog", { name: "매물 저장" });
    expect(within(saveSheet).getByRole("textbox", { name: "매물 이름" })).toHaveValue(
      "래미안OO 84.97㎡",
    );
    await user.click(within(saveSheet).getByRole("button", { name: "취소" }));

    // 전세 화면: 실패 이유를 보이고 적용할 수 없다. 입력은 그대로다.
    ocr.recognize.mockResolvedValueOnce(JEONSE_SCREEN_TEXT);
    await user.click(openButton);
    sheet = screen.getByRole("dialog", { name: "스크린샷으로 채우기" });
    await user.upload(within(sheet).getByLabelText("스크린샷 파일"), screenshot);
    expect(
      await within(sheet).findByText("매매 매물이 아닌 것 같습니다(전세·월세)"),
    ).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "적용" })).toBeDisabled();
    expect(screen.getByLabelText("매매가")).toHaveValue("125,000");

    // 시트를 닫으면 워커를 닫는다.
    ocr.terminate.mockClear();
    await user.click(within(sheet).getByRole("button", { name: "닫기" }));
    expect(ocr.terminate).toHaveBeenCalledTimes(1);
  });
});
