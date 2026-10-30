import styles from "./AppHeader.module.css";

type AppHeaderProps = {
  /** 글자 크기 시트를 연다. 시트를 닫으면 포커스를 이 버튼으로 돌려준다. */
  onTextSizeOpen: (button: HTMLButtonElement) => void;
};

/**
 * 모든 화면 맨 위의 머리 줄(고정하지 않아 스크롤과 함께 올라간다, ADR-031 D3).
 * 왼쪽은 서비스 이름(제목이 아닌 글자, 화면 제목은 각 화면의 h1), 오른쪽 [가가]는 글자 크기 시트를 연다.
 * 화면 안에도 `<header>`가 있어 이름으로 구분한다(`banner "모기지핏"`).
 */
function AppHeader({ onTextSizeOpen }: AppHeaderProps) {
  return (
    <header className={styles.header} aria-label="모기지핏">
      <div className={styles.bar}>
        <span className={styles.brand}>
          <img className={styles.logo} src="/favicon.svg" alt="" width={22} height={22} />
          모기지핏
        </span>
        <button
          type="button"
          className={styles.textSizeButton}
          aria-label="글자 크기"
          aria-haspopup="dialog"
          onClick={(event) => onTextSizeOpen(event.currentTarget)}
        >
          <span className={styles.smallGlyph} aria-hidden="true">
            가
          </span>
          <span aria-hidden="true">가</span>
        </button>
      </div>
    </header>
  );
}

export default AppHeader;
