'use client';

import { computeDiff } from '@/components/AI/Processor/utils/DiffEngine';
import { markPerformance } from '@/components/Performance';
import { useFileSystem } from '@/components/Storage';
import {
  DEFAULT_CONTENTS,
  DEFAULT_FILES,
  SCRATCH_CONTENTS,
  SCRATCH_FILES,
} from '@/components/Storage/InitialData';
import Settings from '@/components/Storage/Settings';
import type { PendingDiff } from '@/components/state/domain-types';
import { useEffect, useState } from 'react';
import styles from './App.module.css';
import { normalizeAgentSessions } from './Panes/Prompt/AgentSessions';

import AppBackgroundServices from './Layout/AppBackgroundServices';
import AppContent from './Layout/AppContent';
import AppLoading from './Layout/AppLoading';

import { buildTreeFromPaths } from '@/components/App/Panes/Sidebar/TreeUtils';
import type { InitialAppValues } from './types';
import useAppStores from './useAppStores';

function buildInitialValues(): InitialAppValues {
  const recoveryCheckpoint = Settings.getRecoveryCheckpoint?.();
  const template = Settings.getTemplate();
  const isScratch = template === 'scratch';
  const defaultFiles = isScratch ? SCRATCH_FILES : DEFAULT_FILES;
  const defaultContents = isScratch ? SCRATCH_CONTENTS : DEFAULT_CONTENTS;
  const storedContents = Settings.getFileContents() || recoveryCheckpoint?.fileContents;
  const pendingDiffs = Object.fromEntries(
    Object.entries(Settings.getPendingDiffs()).map(([path, diff]) => {
      const pending = diff as PendingDiff;
      return [
        path,
        {
          ...pending,
          diffs: computeDiff(pending.originalContent, pending.modifiedContent).diffs,
        },
      ];
    }),
  ) as Record<string, PendingDiff>;
  const restoredContents = {
    ...(storedContents && Object.keys(storedContents).length > 0
      ? storedContents
      : defaultContents),
    ...Object.fromEntries(
      Object.entries(pendingDiffs).map(([path, diff]) => [path, diff.modifiedContent]),
    ),
  };
  const initialFiles =
    restoredContents && Object.keys(restoredContents).length > 0
      ? buildTreeFromPaths(Object.keys(restoredContents))
      : (defaultFiles as InitialAppValues['files']);
  const savedTabs = (Settings.getOpenTabs() ||
    recoveryCheckpoint?.openTabs ||
    []) as InitialAppValues['tabs'];
  const removedSectionTabIds = new Set(['ai-section:context', 'ai-section:transcript']);
  const restoredTabs = savedTabs.filter((tab) => !removedSectionTabIds.has(tab.id));
  const restoredActiveTabId = Settings.getActiveTabId() || recoveryCheckpoint?.activeTabId || null;

  return {
    projectName: Settings.getProjectName(recoveryCheckpoint?.projectName || 'My App') || 'My App',
    files: initialFiles as InitialAppValues['files'],
    contents: restoredContents,
    theme: Settings.getTheme() || 'dark',
    tabs: restoredTabs,
    activeTabId: removedSectionTabIds.has(restoredActiveTabId || '')
      ? restoredTabs.at(-1)?.id || null
      : restoredActiveTabId,
    lastCodeTabId: Settings.getLastCodeTabId() || null,
    aiLogs: Settings.getAILogs() || [],
    sidebarWidth: Settings.getSidebarWidth(),
    promptWidth: Settings.getPromptWidth(),
    isSidebarOpen: Settings.getIsSidebarOpen(),
    showAIInput: Settings.getShowAIInput(),
    expandedFolders: Settings.getExpandedFolders(),
    aiCompletionEnabled: Settings.getAICompletionEnabled(),
    isReadOnly: Settings.getEditorReadOnly(false),
    promptHistory: Settings.getPromptHistory() || [],
    previewHtml: Settings.getPreviewHtml(),
    pendingDiffs: (Object.keys(pendingDiffs).length
      ? pendingDiffs
      : recoveryCheckpoint?.pendingDiffs || {}) as Record<string, PendingDiff>,
    agentSessions: (() => {
      const stored = Settings.getAgentSessions();
      const activeId = Settings.getActiveAgentSessionId();
      return normalizeAgentSessions(
        stored ? { ...stored, activeSessionId: stored.activeSessionId || activeId } : null,
      );
    })(),
    workspaceProfile: Settings.getWorkspaceProfile?.() || {},
    changeSets: Settings.getChangeSets?.() || { activeId: null, items: [] },
  };
}

type AppReadyProps = {
  initialValues: InitialAppValues;
};

function AppReady({ initialValues }: AppReadyProps) {
  const fs = useFileSystem({ bootstrap: true });
  useAppStores(initialValues, fs);
  if (!fs.isReady) {
    return <AppLoading />;
  }

  return (
    <div className={styles.root}>
      <AppBackgroundServices />
      <AppContent />
    </div>
  );
}

export default function App() {
  const [initialValues, setInitialValues] = useState<InitialAppValues | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      markPerformance('app-hydration-start');
      await Settings.hydrate();
      if (cancelled) return;
      setInitialValues(buildInitialValues());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!initialValues) {
    return <AppLoading />;
  }

  return <AppReady initialValues={initialValues} />;
}
