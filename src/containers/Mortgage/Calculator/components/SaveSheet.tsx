import { useRef, useState, type FormEvent } from "react";

import Sheet from "@/components/Sheet";
import {
  countChars,
  LISTING_NAME_MAX_LENGTH,
  validateListingName,
} from "@/lib/utils/validateListingName";

import styles from "./SaveSheet.module.css";

import type { ListingSourceWriteFailure, ListingSourceWriteResult } from "@/lib/types/listing";

/** add: 새 매물로 저장, overwrite: 불러온 매물(draft.listingId)에 덮어쓰기 */
export type SaveAction = "add" | "overwrite";

type SaveSheetProps = {
  /** 불러온 매물을 고치는 중이면 그 이름, 아니면 빈 문자열 */
  initialName: string;
  isEditing: boolean;
  /** 입력이 불러온 저장본과 다른지(`selectSaveStatus`). 덮어쓰기가 무엇을 바꾸는지 알린다 */
  hasInputChanges: boolean;
  /** 성공하면 부르는 쪽이 시트를 닫는다. 실패하면 시트와 이름을 그대로 두고 이유를 보인다. */
  onSave: (action: SaveAction, name: string) => Promise<ListingSourceWriteResult>;
  onCancel: () => void;
};

const WRITE_FAILURE_MESSAGES: Record<ListingSourceWriteFailure["reason"], string> = {
  unavailable: "저장하지 못했습니다. 이 브라우저에서 저장소를 사용할 수 없습니다",
  corrupt: "저장된 목록이 손상되어 저장할 수 없습니다(목록 화면에서 초기화)",
  notFound: "덮어쓸 매물이 목록에 없습니다. 새로 저장하세요",
  notReady: "계정 상태를 확인한 뒤 다시 시도해 주세요",
  unauthorized: "로그인이 끝났습니다. 다시 로그인해 주세요",
  // 목록을 다시 받아 편집 연결이 풀리므로 기본 버튼이 새로 저장이 된다.
  deletedElsewhere: "다른 기기에서 삭제된 매물입니다. 새로 저장할 수 있습니다",
  deletedInHousehold: "함께 쓰는 사람이나 다른 기기에서 삭제된 매물입니다. 새로 저장할 수 있습니다",
  limit: "계정에는 매물을 500개까지 저장할 수 있습니다",
  network: "저장하지 못했습니다. 연결을 확인하고 다시 시도해 주세요",
};

const NAME_INPUT_ID = "listing-name";
const NAME_COUNT_ID = "listing-name-count";
const NAME_ERROR_ID = "listing-name-error";

function nameErrorOf(raw: string): string | null {
  const validation = validateListingName(raw);
  return validation.ok ? null : validation.message;
}

/** 저장 시트. 취소·닫기 버튼과 Esc로 닫는다. */
/** 덮어쓰기가 바꾸는 것. "이름 바꾸기"로 열면 입력이 같으므로 이름만 바뀐다는 것을 보여 준다(ADR-022 D7). */
function describeOverwrite(hasInputChanges: boolean): string {
  return hasInputChanges
    ? "덮어쓰면 바꾼 입력값과 이름이 함께 저장됩니다"
    : "입력값은 저장본과 같습니다. 덮어쓰면 이름만 바뀝니다";
}

function SaveSheet({ initialName, isEditing, hasInputChanges, onSave, onCancel }: SaveSheetProps) {
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  // 두 번 눌러 두 벌 저장되지 않게 저장 중에는 저장 버튼을 막는다.
  const [isSaving, setIsSaving] = useState(false);

  const primaryAction: SaveAction = isEditing ? "overwrite" : "add";

  const handleNameChange = (raw: string) => {
    setName(raw);
    if (nameErrorOf(raw) === null) setNameError(null);
  };

  const submit = async (action: SaveAction) => {
    if (isSaving) return;
    const validation = validateListingName(name);
    if (!validation.ok) {
      setNameError(validation.message);
      // 버튼을 눌러 제출하면 포커스가 버튼에 있다. 고칠 곳(첫 오류 필드)으로 옮긴다.
      nameInputRef.current?.focus();
      return;
    }
    setIsSaving(true);
    const result = await onSave(action, validation.name);
    setIsSaving(false);
    setWriteError(result.ok ? null : WRITE_FAILURE_MESSAGES[result.reason]);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit(primaryAction);
  };

  const describedBy = nameError === null ? NAME_COUNT_ID : `${NAME_COUNT_ID} ${NAME_ERROR_ID}`;

  return (
    <Sheet title={isEditing ? "매물 저장(수정 중)" : "매물 저장"} onClose={onCancel}>
      <form className={styles.form} noValidate onSubmit={handleSubmit}>
        <div className={styles.field}>
          <div className={styles.labelRow}>
            <label className={styles.label} htmlFor={NAME_INPUT_ID}>
              매물 이름
            </label>
            <span id={NAME_COUNT_ID} className={styles.count}>
              {countChars(name.trim())}/{LISTING_NAME_MAX_LENGTH}
            </span>
          </div>
          <input
            ref={nameInputRef}
            id={NAME_INPUT_ID}
            className={styles.input}
            type="text"
            autoComplete="off"
            enterKeyHint="done"
            placeholder="예: 래미안 101동"
            autoFocus
            value={name}
            aria-invalid={nameError !== null}
            aria-describedby={describedBy}
            onChange={(event) => handleNameChange(event.target.value)}
            onBlur={() => setNameError(nameErrorOf(name))}
          />
          {nameError !== null && (
            <p id={NAME_ERROR_ID} className={styles.error}>
              {nameError}
            </p>
          )}
        </div>
        {isEditing && <p className={styles.overwriteNote}>{describeOverwrite(hasInputChanges)}</p>}
        {writeError !== null && (
          <p role="alert" className={styles.writeError}>
            {writeError}
          </p>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.secondaryButton} onClick={onCancel}>
            취소
          </button>
          {isEditing && (
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={isSaving}
              onClick={() => void submit("add")}
            >
              새로 저장
            </button>
          )}
          <button type="submit" className={styles.primaryButton} disabled={isSaving}>
            {isEditing ? "덮어쓰기" : "저장"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

export default SaveSheet;
