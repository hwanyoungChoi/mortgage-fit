import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type SyntheticEvent,
} from "react";

import { formatThousands } from "@/lib/utils/amount";
import { LISTING_MEMO_MAX_LENGTH, validateListingMemo } from "@/lib/utils/validateListingMemo";
import { countChars } from "@/lib/utils/validateListingName";

import styles from "./MemoEditor.module.css";
import { useVisibleViewport } from "../hooks/useVisibleViewport";

import type { ListingSourceWriteFailure, ListingSourceWriteResult } from "@/lib/types/listing";

type MemoEditorProps = {
  listingName: string;
  /** 저장본의 메모. 입력칸의 처음 값으로만 쓴다: 창 포커스 재조회로 바뀌어도 입력 중인 문자열은 덮지 않는다. */
  initialMemo: string;
  onSave: (memo: string) => Promise<ListingSourceWriteResult>;
  /** 저장했거나 취소했다. 포커스 복귀는 여는 쪽("메모" 버튼)이 맡는다. */
  onClose: () => void;
};

/** 상한(limit)은 메모 저장에서 생기지 않는다. */
const WRITE_FAILURE_MESSAGES: Record<ListingSourceWriteFailure["reason"], string> = {
  unavailable: "저장하지 못했습니다. 이 브라우저에서 저장소를 사용할 수 없습니다",
  corrupt: "저장된 목록이 손상되어 저장할 수 없습니다",
  notFound: "이 매물이 목록에 없습니다(다른 탭에서 삭제됨)",
  notReady: "계정 상태를 확인한 뒤 다시 시도해 주세요",
  unauthorized: "로그인이 끝났습니다. 다시 로그인해 주세요",
  deletedElsewhere: "다른 기기에서 삭제된 매물입니다",
  deletedInHousehold: "함께 쓰는 사람이나 다른 기기에서 삭제된 매물입니다",
  limit: "저장하지 못했습니다. 다시 시도해 주세요",
  network: "저장하지 못했습니다. 연결을 확인하고 다시 시도해 주세요",
};

const DISCARD_CONFIRM_MESSAGE = "쓰던 메모를 버리고 닫을까요?";

/** 편집기 위로 남길 틈(px). 어두운 막이 조금 보여야 화면이 덮였음을 안다. */
const VIEWPORT_TOP_GAP = 16;

function memoErrorOf(raw: string): string | null {
  const validation = validateListingMemo(raw);
  return validation.ok ? null : validation.message;
}

/**
 * 메모 편집. 화면 나머지를 어둡게 덮는 모달(`<dialog>`)로 보이는 영역 맨 아래(키보드 바로 위)에 띄워 메모만 보이게 한다.
 * 취소·Esc·어두운 막 누르기는 같은 취소이고, 고친 내용이 있으면 확인한 뒤에만 닫는다. 비우고 저장하면 메모를 지운다.
 */
function MemoEditor({ listingName, initialMemo, onSave, onClose }: MemoEditorProps) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const visibleViewport = useVisibleViewport();
  const [memo, setMemo] = useState(initialMemo);
  const [error, setError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isUnchanged = memo.trim() === initialMemo;
  const labelId = `${id}-label`;
  const countId = `${id}-count`;
  const errorId = `${id}-error`;

  // 모달로 열어 뒤 화면을 inert로 만든다(포커스 가두기). 커서는 기존 메모 끝에 둔다(autoFocus는 맨 앞에 둬서 이어 쓰기 불편하다).
  // StrictMode의 두 번째 실행에서 다시 열지 않는다. 닫기는 이 컴포넌트를 내리는 것으로 한다(내려가면 모달도 풀린다).
  useEffect(() => {
    const dialog = dialogRef.current;
    const textarea = textareaRef.current;
    if (dialog === null || textarea === null) return;
    if (!dialog.open) dialog.showModal();
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, []);

  const handleChange = (raw: string) => {
    setMemo(raw);
    if (memoErrorOf(raw) === null) setError(null);
  };

  const handleCancel = () => {
    if (isUnchanged || window.confirm(DISCARD_CONFIRM_MESSAGE)) onClose();
  };

  // Esc는 keydown에서 막는다. 그래야 브라우저가 확인 없이 대화상자를 닫지 않는다.
  const handleKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    handleCancel();
  };

  // Android 뒤로 가기처럼 keydown 없이 오는 닫기 요청도 같은 취소로 받는다.
  const handleDialogCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    handleCancel();
  };

  // 대화상자가 화면 전체라 편집기 밖(어두운 막)을 누르면 대화상자 자신이 눌린다.
  const handleDialogClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) handleCancel();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;
    const validation = validateListingMemo(memo);
    if (!validation.ok) {
      setError(validation.message);
      textareaRef.current?.focus();
      return;
    }
    setIsSaving(true);
    const result = await onSave(validation.memo);
    setIsSaving(false);
    if (result.ok) onClose();
    else setWriteError(WRITE_FAILURE_MESSAGES[result.reason]);
  };

  const panelStyle =
    visibleViewport === null
      ? undefined
      : { bottom: visibleViewport.bottom, maxHeight: visibleViewport.height - VIEWPORT_TOP_GAP };

  // 브라우저가 대화상자를 스스로 닫은 경우(onClose)에도 화면 상태를 맞춘다.
  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={labelId}
      onKeyDown={handleKeyDown}
      onCancel={handleDialogCancel}
      onClose={onClose}
      onClick={handleDialogClick}
    >
      <form className={styles.form} style={panelStyle} noValidate onSubmit={handleSubmit}>
        <div className={styles.labelRow}>
          <label id={labelId} className={styles.label} htmlFor={id}>
            {listingName} 메모
          </label>
          <span id={countId} className={styles.count}>
            {formatThousands(countChars(memo.trim()))}/{formatThousands(LISTING_MEMO_MAX_LENGTH)}
          </span>
        </div>
        <textarea
          ref={textareaRef}
          id={id}
          className={styles.textarea}
          rows={4}
          value={memo}
          aria-invalid={error !== null}
          aria-describedby={error === null ? countId : `${countId} ${errorId}`}
          onChange={(event) => handleChange(event.target.value)}
          onBlur={() => setError(memoErrorOf(memo))}
        />
        {error !== null && (
          <p id={errorId} className={styles.error}>
            {error}
          </p>
        )}
        {writeError !== null && (
          <p role="alert" className={styles.error}>
            {writeError}
          </p>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.secondaryButton} onClick={handleCancel}>
            취소
          </button>
          <button type="submit" className={styles.primaryButton} disabled={isUnchanged || isSaving}>
            메모 저장
          </button>
        </div>
      </form>
    </dialog>
  );
}

export default MemoEditor;
