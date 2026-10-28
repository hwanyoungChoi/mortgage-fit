import { TEXT_SIZE_LABELS, TEXT_SIZES } from "@/lib/constants/textSize";

import Sheet from "./Sheet";
import styles from "./TextSizeSheet.module.css";

import type { TextSize } from "@/lib/types/textSize";

type TextSizeSheetProps = {
  value: TextSize;
  onSelect: (size: TextSize) => void;
  onClose: () => void;
};

/** 크게·기본·더 작게 고르기. 고르면 바로 적용하고 시트는 열어 둔다(바뀐 크기를 보며 다시 고를 수 있게). */
function TextSizeSheet({ value, onSelect, onClose }: TextSizeSheetProps) {
  return (
    <Sheet title="글자 크기" onClose={onClose}>
      <div className={styles.options}>
        {TEXT_SIZES.map((size) => {
          const isCurrent = size === value;
          return (
            <button
              key={size}
              type="button"
              className={styles.option}
              aria-pressed={isCurrent}
              onClick={() => onSelect(size)}
            >
              {TEXT_SIZE_LABELS[size]}
              {isCurrent && <span className={styles.current}>지금 크기</span>}
            </button>
          );
        })}
      </div>
      <p className={styles.note}>이 기기에만 적용됩니다. 입력칸 글자는 그대로입니다</p>
    </Sheet>
  );
}

export default TextSizeSheet;
