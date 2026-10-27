import styles from "./MortgageHub.module.css";

/** 홈(허브, `#/`). 첫 화면이다(ADR-031 D1). */
function MortgageHub() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>홈</h1>
    </div>
  );
}

export default MortgageHub;
