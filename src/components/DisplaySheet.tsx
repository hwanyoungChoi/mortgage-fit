import { TEXT_SIZE_LABELS, TEXT_SIZES } from "@/lib/constants/textSize";
import { THEME_LABELS, THEMES } from "@/lib/constants/theme";

import styles from "./DisplaySheet.module.css";
import Sheet from "./Sheet";

import type { TextSize } from "@/lib/types/textSize";
import type { Theme } from "@/lib/types/theme";

type DisplaySheetProps = {
  theme: Theme;
  onThemeSelect: (theme: Theme) => void;
  textSize: TextSize;
  onTextSizeSelect: (size: TextSize) => void;
  onClose: () => void;
};

/** 고르기 한 묶음(제목 + 넓은 줄 버튼). 고른 줄은 `aria-pressed`와 오른쪽 "지금 설정" */
function OptionGroup<T extends string>({
  title,
  options,
  labels,
  value,
  onSelect,
}: {
  title: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onSelect: (value: T) => void;
}) {
  return (
    <section className={styles.group} aria-label={title}>
      <h3 className={styles.groupTitle}>{title}</h3>
      <div className={styles.options}>
        {options.map((option) => {
          const isCurrent = option === value;
          return (
            <button
              key={option}
              type="button"
              className={styles.option}
              aria-pressed={isCurrent}
              onClick={() => onSelect(option)}
            >
              {labels[option]}
              {isCurrent && <span className={styles.current}>지금 설정</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * 머리 줄 [가가]로 여는 화면 설정: 화면 모드(기기 설정·라이트·다크)와 글자 크기(크게·기본·더 작게).
 * 고르면 바로 적용하고 시트는 열어 둔다(바뀐 화면을 보며 다시 고를 수 있게). 둘 다 이 기기에만 저장한다.
 */
function DisplaySheet({
  theme,
  onThemeSelect,
  textSize,
  onTextSizeSelect,
  onClose,
}: DisplaySheetProps) {
  return (
    <Sheet title="화면 설정" onClose={onClose}>
      <OptionGroup
        title="화면 모드"
        options={THEMES}
        labels={THEME_LABELS}
        value={theme}
        onSelect={onThemeSelect}
      />
      <OptionGroup
        title="글자 크기"
        options={TEXT_SIZES}
        labels={TEXT_SIZE_LABELS}
        value={textSize}
        onSelect={onTextSizeSelect}
      />
      <p className={styles.note}>이 기기에만 적용됩니다. 입력칸 글자 크기는 그대로입니다</p>
    </Sheet>
  );
}

export default DisplaySheet;
