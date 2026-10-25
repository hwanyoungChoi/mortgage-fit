import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import {
  countChars,
  LISTING_NAME_MAX_LENGTH,
  validateListingName,
} from "@/lib/utils/validateListingName";

import styles from "./ListingNameEditor.module.css";

import type { ListingSourceWriteFailure, ListingSourceWriteResult } from "@/lib/types/listing";

type ListingNameEditorProps = {
  /** 저장본의 이름. 입력칸의 처음 값으로만 쓴다: 창 포커스 재조회로 바뀌어도 입력 중인 문자열은 덮지 않는다. */
  initialName: string;
  onSave: (name: string) => Promise<ListingSourceWriteResult>;
  /** 저장했거나 취소했다. 포커스 복귀는 여는 쪽(카드의 이름 버튼)이 맡는다. */
  onClose: () => void;
};

/** 상한(limit)은 이름 저장에서 생기지 않는다. */
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

const DISCARD_CONFIRM_MESSAGE = "고친 이름을 버리고 닫을까요?";

function nameErrorOf(raw: string): string | null {
  const validation = validateListingName(raw);
  return validation.ok ? null : validation.message;
}

/**
 * 카드 머리(이름 자리)에서 이름만 고치는 입력칸. Enter·[이름 저장]은 저장, Esc·[취소]는 취소이고 고친 내용이 있으면 확인한 뒤에만 닫는다.
 * 규칙은 저장 시트와 같다(`validateListingName`, 1~40자). 저장하지 못하면 입력을 그대로 두고 이유를 한 줄로 보인다.
 */
function ListingNameEditor({ initialName, onSave, onClose }: ListingNameEditorProps) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isUnchanged = name.trim() === initialName;
  const countId = `${id}-count`;
  const errorId = `${id}-error`;

  // 커서는 기존 이름 끝에 둔다(이어 쓰거나 지우기 쉽게). 라벨부터 버튼까지 칸 전체를 화면에 들인다.
  useEffect(() => {
    const input = inputRef.current;
    if (input === null) return;
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
    formRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  const handleChange = (raw: string) => {
    setName(raw);
    if (nameErrorOf(raw) === null) setError(null);
  };

  const handleCancel = () => {
    if (isSaving) return;
    if (isUnchanged || window.confirm(DISCARD_CONFIRM_MESSAGE)) onClose();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    handleCancel();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving || isUnchanged) return;
    const validation = validateListingName(name);
    if (!validation.ok) {
      setError(validation.message);
      inputRef.current?.focus();
      return;
    }
    setIsSaving(true);
    setWriteError(null);
    const result = await onSave(validation.name);
    setIsSaving(false);
    if (result.ok) onClose();
    else setWriteError(WRITE_FAILURE_MESSAGES[result.reason]);
  };

  return (
    <form ref={formRef} className={styles.form} noValidate onSubmit={handleSubmit}>
      <div className={styles.labelRow}>
        <label className={styles.label} htmlFor={id}>
          매물 이름
        </label>
        <span id={countId} className={styles.count}>
          {countChars(name.trim())}/{LISTING_NAME_MAX_LENGTH}
        </span>
      </div>
      <input
        ref={inputRef}
        id={id}
        className={styles.input}
        type="text"
        autoComplete="off"
        enterKeyHint="done"
        value={name}
        readOnly={isSaving}
        aria-invalid={error !== null}
        aria-describedby={error === null ? countId : `${countId} ${errorId}`}
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => setError(nameErrorOf(name))}
      />
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={isSaving}
          onClick={handleCancel}
        >
          취소
        </button>
        <button type="submit" className={styles.primaryButton} disabled={isUnchanged || isSaving}>
          이름 저장
        </button>
      </div>
      {/* 안내는 버튼 아래에 둔다. 입력칸을 떠나며(blur) 안내가 생겨도 누르려던 버튼이 밀리지 않는다. */}
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
    </form>
  );
}

export default ListingNameEditor;
