import styles from "./HomeEmpty.module.css";

type HomeEmptyProps = {
  onCreate: (button: HTMLButtonElement) => void;
};

/** 계획이 없을 때(AC-1). 매물 카드에서 만드는 길도 함께 알린다. */
function HomeEmpty({ onCreate }: HomeEmptyProps) {
  return (
    <section className={styles.empty}>
      <p className={styles.description}>계약한 집의 인테리어 예산·견적·지급을 정리합니다</p>
      <button
        type="button"
        className={styles.createButton}
        aria-haspopup="dialog"
        onClick={(event) => onCreate(event.currentTarget)}
      >
        계획 만들기
      </button>
      <p className={styles.note}>저장 목록의 매물 카드에서도 만들 수 있어요</p>
    </section>
  );
}

export default HomeEmpty;
