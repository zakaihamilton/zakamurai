import { useCallback } from 'react';
import { AppState } from '@/components/App/AppState';
import { TabState } from '@/components/App/Panes';
import { LogState } from '@/components/App/Views/LogArea';
import { getProjectTemplates } from '@/components/Storage/InitialData';
import { Icons } from '@/components/ui/Icons';
import styles from './StartOptions.module.css';

export default function StartOptions() {
  const appState = AppState.usePassiveState();
  const tabState = TabState.usePassiveState();
  const logState = LogState.useState(['isSystemProcessing', 'isAIProcessing']);
  const isProcessing = Boolean(logState?.isSystemProcessing || logState?.isAIProcessing);
  const templates = getProjectTemplates();

  const startWithTemplate = useCallback(
    (templateId: string) => {
      appState?.((draft) => {
        draft.projectActionRequest = {
          id: Date.now(),
          type: 'template',
          templateId,
        };
      });
    },
    [appState],
  );

  const openProjectLibrary = useCallback(() => {
    appState?.((draft) => {
      draft.projectActionRequest = { id: Date.now(), type: 'library' };
    });
  }, [appState]);

  const returnToWelcome = useCallback(() => {
    tabState?.((draft) => {
      draft.openTabs = draft.openTabs.filter((tab) => tab.id !== 'start-options');
      draft.activeTabId = null;
    });
  }, [tabState]);

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <button type="button" className={styles.backButton} onClick={returnToWelcome}>
          <Icons.ChevronLeft size={16} />
          <span>Back to Welcome</span>
        </button>
        <section className={styles.startOptions} aria-labelledby="start-options-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Start without a prompt</p>
              <h1 id="start-options-title">Choose a starting point</h1>
            </div>
            <button
              type="button"
              className={styles.libraryButton}
              onClick={openProjectLibrary}
              disabled={isProcessing}
            >
              Open saved project
            </button>
          </div>
          <div className={styles.templateGrid}>
            {templates.map((template, index) => (
              <article className={styles.templateCard} key={template.id}>
                <span className={styles.templateNumber}>{String(index + 1).padStart(2, '0')}</span>
                <h2>{template.name}</h2>
                <p>{template.description}</p>
                <button
                  type="button"
                  onClick={() => startWithTemplate(template.id)}
                  disabled={isProcessing}
                >
                  Use this template <span aria-hidden="true">→</span>
                </button>
              </article>
            ))}
          </div>
          <p className={styles.noAiNote}>
            Edit and build without AI. Projects stay in this browser; export a source ZIP to move
            one or open a local folder. Local AI is optional and downloads only when you choose to
            use it.
          </p>
        </section>
      </div>
    </div>
  );
}
