import { TabState } from '@/components/App/Panes';
import WelcomeActions from './Actions';
import WelcomeFooter from './Footer';
import WelcomeHero from './Hero';
import WelcomePrompt from './Prompt';
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

  const handleShowReadiness = () => {
    if (!tabState) return;
    const exists = tabState.openTabs.some((t) => t.id === 'readiness');
    if (!exists) {
      tabState.openTabs = [
        ...tabState.openTabs,
        {
          id: 'readiness',
          type: 'readiness',
          label: 'Readiness',
        },
      ];
    }
    tabState.activeTabId = 'readiness';
  };

  return (
    <div className={styles.welcome}>
      <div className={styles.hero}>
        <WelcomeHero />
        <WelcomePrompt />
        <WelcomeActions
          onShowInfo={handleShowInfo}
          onShowInstructions={handleShowInstructions}
          onShowReadiness={handleShowReadiness}
        />
        <WelcomeFooter />
      </div>
    </div>
  );
}
