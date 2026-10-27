import styles from "./MaskedValue.module.css";

import type { ReactNode } from "react";

type MaskedValueProps = {
  isMasked: boolean;
  children: ReactNode;
};

/**
 * 가리기 모드의 금액·메모 자리. 가리면 실제 값은 DOM에 두지 않고 `•••`만 그리며, 보조기기는 "가려짐"으로 읽는다.
 */
function MaskedValue({ isMasked, children }: MaskedValueProps) {
  if (!isMasked) return children;
  return (
    <>
      <span aria-hidden="true">•••</span>
      <span className={styles.screenReaderOnly}>가려짐</span>
    </>
  );
}

export default MaskedValue;
