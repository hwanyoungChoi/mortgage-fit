import ImageUp from "lucide-react/icons/image-up";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useDraft } from "@/hooks/useDraft";
import { useListingSource } from "@/hooks/useListingSource";
import { useOpenSheet } from "@/hooks/useOpenSheet";
import { DEFAULT_CUSTOM_LTV } from "@/lib/constants/draft";
import { calculateLoan } from "@/lib/utils/calculateLoan";
import { summarizeExtraCostRows, toExtraCosts } from "@/lib/utils/extraCosts";
import { findDraftListing } from "@/lib/utils/listingDraft";
import { toLoanInput } from "@/lib/utils/toLoanInput";

import styles from "./MortgageCalculator.module.css";
import { applyListingText } from "./applyListingText";
import EditingBanner from "./components/EditingBanner";
import EmptyResultCard from "./components/EmptyResultCard";
import ExtraCostsSection from "./components/ExtraCostsSection";
import LoanInputs, { KB_PRICE_INPUT_ID, SALE_PRICE_INPUT_ID } from "./components/LoanInputs";
import ResultCard from "./components/ResultCard";
import SaveSheet, { type SaveAction } from "./components/SaveSheet";
import ScreenshotSheet from "./components/ScreenshotSheet";
import SummaryBar from "./components/SummaryBar";
import TradesSheet from "./components/TradesSheet";
import { describeEmptyResult } from "./emptyResultMessage";
import { ltvChoiceOf } from "./ltvChoice";
import { toNewCalculationDraft } from "./newCalculationDraft";
import { pickSuggestedName } from "./pickSuggestedName";
import { getSaveButtonState, selectSaveStatus } from "./saveButtonState";
import { describeSummaryTag } from "./summaryTag";

import type { AccountImport } from "@/hooks/useAccountImport";
import type { DraftStore } from "@/lib/types/draft";
import type { ListingInput, ListingSourceWriteResult, ListingStore } from "@/lib/types/listing";
import type { Regulations } from "@/lib/types/regulation";
import type { SessionHintStore } from "@/lib/types/sessionHint";
import type { TradeLookupStore } from "@/lib/types/tradeLookup";
import type { ParsedListingText } from "@/lib/utils/parseListingText";

type MortgageCalculatorProps = {
  /** 로그아웃 상태의 목록 원본 */
  listingStore: ListingStore;
  sessionHintStore: SessionHintStore;
  accountImport: AccountImport;
  draftStore: DraftStore;
  tradeLookupStore: TradeLookupStore;
  regulations: Regulations;
  /** 저장 시트 이름 제안(스크린샷·매물 복사). 목록 화면의 복사가 채우므로 화면 밖에서 받는다. 새로고침하면 사라져도 되는 값이라 draft에 넣지 않는다. */
  suggestedName: string;
  onSuggestedNameChange: (name: string) => void;
};

/** 계산 화면의 시트. 한 번에 하나만 열린다(ADR-017). */
type SheetName = "save" | "screenshot" | "trades";

/** 저장 알림이 보이는 시간 */
const SAVED_NOTICE_MS = 3000;

/** 계산 화면은 항상 draft만 본다(ADR-004). */
function MortgageCalculator({
  listingStore,
  sessionHintStore,
  accountImport,
  draftStore,
  tradeLookupStore,
  regulations,
  suggestedName,
  onSuggestedNameChange: setSuggestedName,
}: MortgageCalculatorProps) {
  const draft = useDraft(draftStore);
  // 로그인 사용자가 서버 매물을 연 채 새로고침해도 편집 배너가 맞게 뜨도록 계산 화면도 출처를 기다린다.
  const source = useListingSource({ listingStore, sessionHintStore, accountImport });
  // 바꾸면 입력부를 새로 그려 금액·LTV 칸의 오류 표시를 걷는다.
  const [inputsKey, setInputsKey] = useState(0);
  const sheet = useOpenSheet<SheetName>();
  // 실거래가 단지명 필터. 시트를 닫았다 열어도 같은 조회가 캐시에서 뜨게 여기 둔다. 매물 열기는 이 화면을 새로 그려 비운다.
  const [tradeAptName, setTradeAptName] = useState("");
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const screenshotButtonRef = useRef<HTMLButtonElement>(null);
  const tradesButtonRef = useRef<HTMLButtonElement>(null);
  const renameButtonRef = useRef<HTMLButtonElement>(null);

  // 목록에서 카드나 탭으로 넘어오면 목록의 스크롤 위치가 남아 화면 중간에서 시작한다. 입력부터 보이게 맨 위로 올린다.
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (savedNotice === null) return;
    const timer = window.setTimeout(() => setSavedNotice(null), SAVED_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [savedNotice]);

  /** 새 계산 상태로 비운다. 저장에 성공한 뒤에도 부른다. */
  const resetToNewCalculation = () => {
    draftStore.update(toNewCalculationDraft(draftStore.getSnapshot()));
    setInputsKey((key) => key + 1);
    setTradeAptName("");
    setSuggestedName("");
  };

  /**
   * 스크린샷 적용은 새 매물 계산이다(ADR-017). LTV와 85㎡ 초과는 기본값으로 돌린다. 이전 매물의 단지명 필터가 남지 않게 읽은 단지명으로 바꾼다(못 읽었으면 비운다).
   * KB시세는 비워졌으니 바로 입력하도록 그 칸으로 포커스를 옮긴다.
   */
  const handleScreenshotApply = (parsed: ParsedListingText) => {
    draftStore.update(applyListingText(draft, parsed));
    setInputsKey((key) => key + 1);
    setSuggestedName(parsed.suggestedName);
    setTradeAptName(parsed.complexName ?? "");
    sheet.close();
    document.getElementById(KB_PRICE_INPUT_ID)?.focus();
  };

  const loanInput = toLoanInput(draft);
  const result = loanInput === null ? null : calculateLoan(loanInput, regulations);
  const summaryTag = describeSummaryTag(result);
  const extraCosts = toExtraCosts(draft.extraCosts);
  const editingListing = findDraftListing(source.list, draft.listingId);
  const saveInput = { listingsStatus: source.list.status, loanInput, extraCosts, editingListing };
  const saveButton = getSaveButtonState(saveInput);
  const hasInputChanges = selectSaveStatus(saveInput) !== "saved";
  // 저장 시트·[이름 바꾸기]·저장 버튼이 같은 저장 값을 본다. 금액이나 추가 비용 줄 하나라도 틀리면 null이다(ADR-024 C2).
  const listingValues =
    loanInput === null || extraCosts === null ? null : { ...loanInput, extraCosts };

  /**
   * [초기화]는 추가 비용 줄도 비운다(스펙 U6). 저장하지 않은 줄이 있으면 한 번 묻는다.
   * 불러온 매물 그대로("저장됨")면 줄은 저장본에 있으므로 묻지 않는다.
   */
  const handleNewCalculation = () => {
    const extraCostCount = draft.extraCosts.length;
    const isConfirmed =
      extraCostCount === 0 ||
      !hasInputChanges ||
      window.confirm(`추가 비용 ${extraCostCount}줄도 함께 비워집니다. 초기화할까요?`);
    if (isConfirmed) resetToNewCalculation();
  };

  /**
   * 저장·덮어쓰기에 성공하면 "새 계산"과 같은 상태로 비우고 알린 뒤, 다음 매물을 바로 입력하게 매매가로 포커스를 옮긴다.
   * 저장을 기다리는 동안 입력이 바뀌었으면 비우지 않고 알리기만 한다(고친 입력이 지워지지 않게).
   */
  const saveListing = async (
    action: SaveAction,
    input: ListingInput,
  ): Promise<ListingSourceWriteResult> => {
    const submittedDraft = draftStore.getSnapshot();
    const saved =
      action === "add"
        ? await source.add(input)
        : editingListing === null
          ? ({ ok: false, reason: "notFound" } as const)
          : await source.update(editingListing.id, input);
    if (!saved.ok) return saved;
    const isDraftUnchanged = draftStore.getSnapshot() === submittedDraft;
    if (isDraftUnchanged) resetToNewCalculation();
    setSavedNotice(`'${input.name}' 저장했습니다`);
    sheet.close();
    if (isDraftUnchanged) document.getElementById(SALE_PRICE_INPUT_ID)?.focus();
    return { ok: true };
  };

  // 시트가 열린 동안 뒤 화면은 inert로 키보드·보조기기에서 빼낸다(aria-modal이 약속하는 동작).
  return (
    <>
      <div
        className={
          saveButton.message === null && summaryTag === null ? styles.page : styles.pageWithTallBar
        }
        inert={sheet.isOpen}
      >
        <div className={styles.header}>
          <h1 className={styles.title}>
            대출 계산
            <span className={styles.subtitle}>주담대 한도·자기자금 계산기</span>
          </h1>
          <button type="button" className={styles.newButton} onClick={handleNewCalculation}>
            초기화
          </button>
        </div>
        {editingListing !== null && (
          <EditingBanner
            name={editingListing.name}
            isRenameDisabled={listingValues === null}
            renameButtonRef={renameButtonRef}
            onRename={() => sheet.open("save", renameButtonRef.current)}
          />
        )}
        <button
          ref={screenshotButtonRef}
          type="button"
          className={styles.secondaryAction}
          onClick={() => sheet.open("screenshot", screenshotButtonRef.current)}
        >
          <ImageUp size={18} aria-hidden="true" />
          스크린샷으로 채우기
        </button>
        <LoanInputs
          key={inputsKey}
          draft={draft}
          regulations={regulations}
          onChange={draftStore.update}
          onOpenTrades={(button) => sheet.open("trades", button)}
        />
        {loanInput === null ? (
          <EmptyResultCard message={describeEmptyResult(draft)} />
        ) : (
          <ResultCard
            input={loanInput}
            regulations={regulations}
            extraCosts={summarizeExtraCostRows(draft.extraCosts)}
          />
        )}
        <ExtraCostsSection
          // 입력부와 같이 새로 그려 줄 오류 표시와 고른 분류를 걷는다. 형제와 key가 겹치지 않게 접두를 붙인다.
          key={`extra-costs-${inputsKey}`}
          rows={draft.extraCosts}
          onChange={(rows) => draftStore.update({ extraCosts: rows })}
        />
        <button
          ref={tradesButtonRef}
          type="button"
          className={styles.secondaryAction}
          onClick={() => sheet.open("trades", tradesButtonRef.current)}
        >
          이 지역 실거래가 보기
        </button>
        <SummaryBar
          result={result}
          tag={summaryTag}
          save={saveButton}
          saveButtonRef={saveButtonRef}
          onSave={() => sheet.open("save", saveButtonRef.current)}
        />
      </div>
      <div role="status" className={styles.noticeRegion}>
        {savedNotice !== null && <p className={styles.notice}>{savedNotice}</p>}
      </div>
      {sheet.openSheet === "save" && listingValues !== null && (
        <SaveSheet
          initialName={pickSuggestedName(
            editingListing?.name ?? "",
            draft.listingId,
            suggestedName,
          )}
          isEditing={editingListing !== null}
          hasInputChanges={hasInputChanges}
          onSave={(action, name) => saveListing(action, { ...listingValues, name })}
          onCancel={sheet.close}
        />
      )}
      {sheet.openSheet === "screenshot" && (
        <ScreenshotSheet
          currentSalePrice={draft.salePrice}
          isEditing={editingListing !== null}
          isLtvDefault={ltvChoiceOf(draft) === DEFAULT_CUSTOM_LTV}
          extraCostCount={draft.extraCosts.length}
          onApply={handleScreenshotApply}
          onClose={sheet.close}
        />
      )}
      {sheet.openSheet === "trades" && (
        <TradesSheet
          lookupStore={tradeLookupStore}
          aptName={tradeAptName}
          onAptNameSubmit={setTradeAptName}
          onClose={sheet.close}
        />
      )}
    </>
  );
}

export default MortgageCalculator;
