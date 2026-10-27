import styles from "./EmptyItems.module.css";

/** 항목 0개일 때 목록(공간별·공종별)과 표 자리의 안내. 문구는 보기마다 다르다 */
function EmptyItems({ message }: { message: string }) {
  return <p className={styles.emptyItems}>{message}</p>;
}

export default EmptyItems;
