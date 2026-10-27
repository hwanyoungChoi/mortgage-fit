import styles from "./ChoiceGroup.module.css";

import type { ReactNode } from "react";

/** label은 줄바꿈 위치(`<wbr />`)를 넣을 수 있게 ReactNode다. 접근성 이름은 글자만으로 정해진다. */
type ChoiceOption<T extends string> = { value: T; label: ReactNode };

type ChoiceGroupProps<T extends string> = {
  name: string;
  legend: string;
  options: ChoiceOption<T>[];
  value: T;
  /** 한 줄에 놓을 선택지 수 */
  columns: number;
  /** 흰 카드가 아니라 화면 바탕 위에 놓인다(칸 채움을 한 단계 진하게) */
  isOnBackground?: boolean;
  onChange: (value: T) => void;
};

/** 네이티브 라디오 그룹. 칩 모양이지만 화살표 키 이동과 스크린리더 동작은 라디오 그대로다. */
function ChoiceGroup<T extends string>({
  name,
  legend,
  options,
  value,
  columns,
  isOnBackground = false,
  onChange,
}: ChoiceGroupProps<T>) {
  return (
    <fieldset className={isOnBackground ? styles.groupOnBackground : styles.group}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.options} style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {options.map((option) => (
          <label key={option.value} className={styles.option}>
            <input
              className={styles.input}
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            <span className={styles.label}>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default ChoiceGroup;
