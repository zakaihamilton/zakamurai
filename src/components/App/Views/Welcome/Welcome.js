import { TabState } from '@/components/App/Panes';
import WelcomeActions from './Actions';
import WelcomeFooter from './Footer';
import WelcomeHero from './Hero';
import styles from './Welcome.module.css';

export default function Welcome() {
  const tabState = TabState.usePassiveState();

  const handleShowInfo = () => {
    if (!tabState) return;
    const exists = tabState.openTabs.some((t) => t.id === 'project-info');
    if (!exists) {
      tabState.openTabs = [
        ...tabState.openTabs,
        {
          id: 'project-info',
          type: 'project-info',
          label: 'Project Info',
        },
      ];
    }
    tabState.activeTabId = 'project-info';
  };

  const handleShowInstructions = () => {
    if (!tabState) return;
    const exists = tabState.openTabs.some((t) => t.id === 'instructions');
    if (!exists) {
      tabState.openTabs = [
        ...tabState.openTabs,
        {
          id: 'instructions',
          type: 'instructions',
          label: 'Instructions',
        },
      ];
    }
    tabState.activeTabId = 'instructions';
  };

  return (
    <div className={styles.welcome}>
      <div className={styles.hero}>
        <WelcomeHero />
        <WelcomeActions onShowInfo={handleShowInfo} onShowInstructions={handleShowInstructions} />
        <WelcomeFooter />
      </div>
    </div>
  );
}
