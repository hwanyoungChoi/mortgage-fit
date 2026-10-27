import { PATHS } from "@/lib/constants/paths";

import styles from "./MortgageHub.module.css";
import HubCard from "./components/HubCard";

type MortgageHubProps = {
  /** [매물 모으기]로 가기 직전에 부른다(저장 목록 스크롤을 맨 위로). */
  onListingsNavigate: () => void;
};

/**
 * 홈(허브, `#/`). 첫 화면이다(ADR-031 D1). 기능 카드 3개를 단계 없이 보인다: 대출 계산(가장 크게) → 매물 모으기 →
 * 우리 집 인테리어. 홈은 저장소에 쓰지 않는다.
 */
function MortgageHub({ onListingsNavigate }: MortgageHubProps) {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>홈</h1>
      <ul className={styles.cards}>
        <li>
          <HubCard
            title="대출 계산"
            href={PATHS.calculator}
            description="매매가와 KB시세로 예상 한도와 필요한 자기자금을 계산합니다"
            isPrimary
          />
        </li>
        <li>
          <HubCard
            title="매물 모으기"
            href={PATHS.listings()}
            description="본 매물을 저장해 자기자금·추가 비용을 비교합니다"
            onClick={onListingsNavigate}
          />
        </li>
        <li>
          <HubCard
            title="우리 집 인테리어"
            href={PATHS.home()}
            description="계약한 집의 인테리어 예산·견적·지급을 정리합니다"
          />
        </li>
      </ul>
    </div>
  );
}

export default MortgageHub;
