import { useState, type FormEvent } from "react";
import { flushSync } from "react-dom";

import Sheet from "@/components/Sheet";
import { INTERIOR_SPACE_MAX_COUNT } from "@/lib/constants/interiorPlan";
import { createRandomId } from "@/lib/utils/createRandomId";
import { countSpaceItems } from "@/lib/utils/interiorSpaces";
import { interiorSpaceNameError } from "@/lib/utils/interiorTextErrors";

import styles from "./SheetForm.module.css";
import spaceStyles from "./SpacesSheet.module.css";
import { planWriteFailureMessage } from "../planWriteFailure";

import type { InteriorPlanWithItems, InteriorSpace } from "@/lib/types/interiorPlan";
import type { InteriorPlanWriteResult } from "@/lib/types/interiorPlanStore";

type SpacesSheetProps = {
  plan: InteriorPlanWithItems;
  /** 공간 목록을 통째로 저장한다(서버 PATCH `{ spaces }`와 같다). 성공하면 부르는 쪽이 닫는다. */
  onSave: (spaces: InteriorSpace[]) => Promise<InteriorPlanWriteResult>;
  onClose: () => void;
};

const DISCARD_CONFIRM_MESSAGE = "고친 공간을 버리고 닫을까요?";

const spaceInputId = (spaceId: string) => `interior-space-${spaceId}`;

/**
 * 공간 편집: 이름 바꾸기·추가·삭제, 순서 = 화면 순서. 항목이 있는 공간은 지우지 못하고 그 줄에 이유를 보인다(AC-5).
 * 이름 오류는 칸을 벗어난 뒤에, 저장을 누르면 모두 보이고 첫 오류 칸으로 간다.
 */
function SpacesSheet({ plan, onSave, onClose }: SpacesSheetProps) {
  const [spaces, setSpaces] = useState(plan.spaces);
  const [blurredIds, setBlurredIds] = useState<Set<string>>(() => new Set());
  // 지우려다 막힌 공간과 그 이유(항목 수). 이름을 바꾸거나 다른 줄을 지우면 그대로 둔다.
  const [blockedDelete, setBlockedDelete] = useState<{ spaceId: string; count: number } | null>(
    null,
  );
  const [writeError, setWriteError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isChanged = JSON.stringify(spaces) !== JSON.stringify(plan.spaces);
  const isFull = spaces.length >= INTERIOR_SPACE_MAX_COUNT;

  const errorOf = (space: InteriorSpace) =>
    blurredIds.has(space.id) ? interiorSpaceNameError(space.name) : null;

  const markBlurred = (spaceId: string) => setBlurredIds((prev) => new Set(prev).add(spaceId));

  const handleClose = () => {
    if (!isChanged || window.confirm(DISCARD_CONFIRM_MESSAGE)) onClose();
  };

  const handleRename = (spaceId: string, name: string) => {
    setSpaces((prev) => prev.map((space) => (space.id === spaceId ? { ...space, name } : space)));
  };

  const handleAdd = () => {
    const space: InteriorSpace = { id: createRandomId(), name: "" };
    flushSync(() => setSpaces((prev) => [...prev, space]));
    document.getElementById(spaceInputId(space.id))?.focus();
  };

  const handleDelete = (space: InteriorSpace) => {
    const count = countSpaceItems(plan.items, space.id);
    if (count > 0) {
      setBlockedDelete({ spaceId: space.id, count });
      return;
    }
    setBlockedDelete(null);
    setSpaces((prev) => prev.filter((candidate) => candidate.id !== space.id));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;
    setBlurredIds(new Set(spaces.map((space) => space.id)));
    const firstInvalid = spaces.find((space) => interiorSpaceNameError(space.name) !== null);
    if (firstInvalid !== undefined) {
      document.getElementById(spaceInputId(firstInvalid.id))?.focus();
      return;
    }
    setIsSaving(true);
    const result = await onSave(spaces.map((space) => ({ ...space, name: space.name.trim() })));
    setIsSaving(false);
    setWriteError(result.ok ? null : planWriteFailureMessage(result.reason));
  };

  return (
    <Sheet title="공간 편집" onClose={handleClose}>
      <form className={styles.form} noValidate onSubmit={handleSubmit}>
        <ul className={spaceStyles.rows}>
          {spaces.map((space) => {
            const inputId = spaceInputId(space.id);
            const errorId = `${inputId}-error`;
            const error = errorOf(space);
            const blockedCount = blockedDelete?.spaceId === space.id ? blockedDelete.count : null;
            const label = space.name.trim() === "" ? "새 공간" : space.name.trim();
            return (
              <li key={space.id} className={styles.field}>
                <div className={spaceStyles.row}>
                  <input
                    id={inputId}
                    className={styles.input}
                    type="text"
                    autoComplete="off"
                    enterKeyHint="next"
                    placeholder="공간 이름"
                    aria-label={`${label} 이름`}
                    value={space.name}
                    aria-invalid={error !== null}
                    aria-describedby={error === null ? undefined : errorId}
                    onChange={(event) => handleRename(space.id, event.target.value)}
                    onBlur={() => markBlurred(space.id)}
                  />
                  <button
                    type="button"
                    className={styles.rowDeleteButton}
                    aria-label={`${label} 삭제`}
                    disabled={spaces.length <= 1}
                    onClick={() => handleDelete(space)}
                  >
                    삭제
                  </button>
                </div>
                {error !== null && (
                  <p id={errorId} className={styles.error}>
                    {error}
                  </p>
                )}
                {blockedCount !== null && (
                  <p role="alert" className={styles.error}>
                    이 공간의 항목 {blockedCount}개를 먼저 옮기거나 지우세요
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        <button type="button" className={styles.addButton} disabled={isFull} onClick={handleAdd}>
          공간 추가
        </button>
        {isFull && (
          <p className={styles.limitNote}>공간은 {INTERIOR_SPACE_MAX_COUNT}개까지 둘 수 있습니다</p>
        )}
        {writeError !== null && (
          <p role="alert" className={styles.error}>
            {writeError}
          </p>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.secondaryButton} onClick={handleClose}>
            취소
          </button>
          <button type="submit" className={styles.primaryButton} disabled={!isChanged || isSaving}>
            저장
          </button>
        </div>
      </form>
    </Sheet>
  );
}

export default SpacesSheet;
