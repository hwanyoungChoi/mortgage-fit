import styles from "./Skeleton.module.css";

type SkeletonProps = {
  /** CSS 길이(예: "6em", "100%") */
  width: string;
  /** CSS 길이. 글자 자리는 1em 안팎, 버튼·줄 자리는 그 높이 */
  height: string;
  /** CSS 길이. 기본은 칩 모서리 */
  radius?: string;
  /** 회색 바탕 위에 놓인다(흰 면 위가 기본) */
  isOnBackground?: boolean;
};

/**
 * 받아 올 내용 자리의 회색 막대(ADR-041). 크기와 모서리만 받는다. 자리는 첫 그림부터 차지하고, 300ms 동안 투명했다가
 * 은은한 밝기 맥박으로 보인다(줄어든 움직임이면 멈춘 막대). 보조기기에는 읽히지 않는다: 로딩 영역이 `aria-busy`와
 * `SkeletonLabel` 문구 하나로 알린다.
 */
function Skeleton({ width, height, radius, isOnBackground = false }: SkeletonProps) {
  return (
    <span
      className={isOnBackground ? styles.barOnBackground : styles.bar}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

type SkeletonLabelProps = {
  /** 지금 쓰는 로딩 문구(예: "불러오는 중") */
  children: string;
};

/** 로딩 영역의 문구. 화면에는 막대만 보이고 보조기기는 이 문구를 읽는다. */
export function SkeletonLabel({ children }: SkeletonLabelProps) {
  return <span className={styles.visuallyHidden}>{children}</span>;
}

export default Skeleton;
