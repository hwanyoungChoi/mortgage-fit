import styles from "./HubSummaryPair.module.css";

import type { ReactNode } from "react";

type HubSummaryPairProps = {
  /** 첫 줄 왼쪽(흐린 글자): 무엇의 숫자인지 */
  label: ReactNode;
  /** 라벨과 숫자 사이 구분 기호(예: "·"). 화면에서는 줄바꿈이 대신하고 보조기기 설명에는 그대로 읽힌다 */
  mark?: string;
  /**
   * 둘째 줄: 카드의 답이 되는 숫자. 감싸지 않고 이 줄 요소의 글자로 둔다(글자로 줄을 찾는 테스트가 줄 전체를 얻는다).
   * 안에 요소가 섞이면(가리기) 부르는 쪽이 `<span>` 하나로 감싼다. grid에서 한 칸이어야 한다.
   */
  figure: ReactNode;
  /** 숫자 뒤에 붙는 덧말(예: "· 미정 1건"). 화면에서는 첫 줄 오른쪽에 놓인다 */
  tail?: string;
};

/**
 * 홈 카드의 내 현황 두 줄: "라벨(흐림) … 덧말(흐림)" / "숫자(크게)". 글자와 순서(DOM)는 한 줄 문구 그대로라 카드 링크의
 * 설명(aria-describedby)이 바뀌지 않는다. 배치만 CSS grid로 나눈다.
 * 띄어쓰기는 요소 밖 글자 노드로 둔다: 설명 계산은 요소 안 앞뒤 공백을 지우고, grid는 공백뿐인 글자 노드를 그리지 않는다.
 */
function HubSummaryPair({ label, mark, figure, tail }: HubSummaryPairProps) {
  return (
    <span className={styles.pair}>
      <span className={styles.label}>{label}</span>{" "}
      {mark !== undefined && <span className={styles.mark}>{mark}</span>}
      {mark !== undefined && " "}
      {figure}
      {tail !== undefined && " "}
      {tail !== undefined && <span className={styles.tail}>{tail}</span>}
    </span>
  );
}

export default HubSummaryPair;
