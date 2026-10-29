'use client';

import ModelManager from '@/components/AI/Models/ModelManager';
import { computeDiff } from '@/components/AI/Processor/utils/DiffEngine';
import { RECOMMENDED_WEB_LLM_MODEL } from '@/components/AI/WebLLMModels';
import { AppState } from '@/components/App/AppState';
import { AgentSessionState, createAgentSession } from '@/components/App/Panes/Prompt/AgentSessions';
import PromptComposer from '@/components/App/Panes/Prompt/Composer/Composer';
import ReasoningPanel from '@/components/App/Panes/Prompt/Reasoning/Reasoning';
import SessionManager from '@/components/App/Panes/Prompt/Session/SessionManager';
import { SidebarState } from '@/components/App/Panes/Sidebar/Sidebar';
import SidebarContent from '@/components/App/Panes/Sidebar/SidebarContent';
import SidebarTree from '@/components/App/Panes/Sidebar/Tree/Tree';
import TabBar, { TabState } from '@/components/App/Panes/TabBar/TabBar';
import ActionButtons from '@/components/App/Panes/TopBar/ActionButtons/ActionButtons';
import Breadcrumb from '@/components/App/Panes/TopBar/Breadcrumb/Breadcrumb';
import { PreviewState } from '@/components/App/PreviewState';
import CodeEditor from '@/components/App/Views/EditorArea/CodeEditor';
import EditorHeader from '@/components/App/Views/EditorArea/EditorHeader';
import SideBySideEditorView from '@/components/App/Views/EditorArea/SideBySideEditorView';
import { highlightCodeSync } from '@/components/App/Views/EditorArea/highlightClient';
import type { HighlightEditorState } from '@/components/App/Views/EditorArea/types';
import {
  PreviewErrorState,
  PreviewUnavailableState,
} from '@/components/App/Views/PreviewArea/PreviewEmptyState';
import PreviewToolbar from '@/components/App/Views/PreviewArea/Toolbar/Toolbar';
import DownloadConfirmation from '@/components/App/Views/Welcome/Prompt/DownloadConfirmation';
import { storageFailureMessage } from '@/components/Storage/StorageHealth';
import { Notification, NotificationState } from '@/components/ui/Notification/Notification';
import { useState } from 'react';
import styles from './preview.module.css';

export type Scenario = 'populated' | 'empty' | 'error';
const original = 'export default function App() {\n  return <h1>Hello, world!</h1>;\n}\n';
const modified = 'export default function App() {\n  return <h1>Welcome to our app!</h1>;\n}\n';
const noop = () => {};

export function DiffFixture({ scenario }: { scenario: Scenario }) {
  const [content, setContent] = useState(scenario === 'empty' ? original : modified);
  const [pending, setPending] = useState(scenario !== 'empty');
  const [sideBySide, setSideBySide] = useState(true);
  const [readOnly, setReadOnly] = useState(false);
  const [showFind, setShowFind] = useState(false);
  const filePath = 'src/App.tsx';
  const diffData = computeDiff(original, content);
  const highlightState: HighlightEditorState = {
    pendingDiffs: pending
      ? {
          [filePath]: {
            originalContent: original,
            modifiedContent: content,
            diffs: diffData.diffs,
          },
        }
      : {},
  };
  const highlight = (value: string, isOriginal = false) =>
    highlightCodeSync(
      value,
      filePath,
      highlightState,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      isOriginal,
    );
  const highlightedCode = highlight(content);
  const originalHighlightedCode = highlight(original, true);
  return (
    <div className={styles.fixtureColumn}>
      <EditorHeader
        filePath="src/App.tsx"
        onSelectView={noop}
        showFind={showFind}
        setShowFind={setShowFind}
        hasDiff={pending}
        handleApprove={() => setPending(false)}
        handleUndo={() => {
          setContent(original);
          setPending(false);
        }}
        showSideBySide={sideBySide}
        setShowSideBySide={setSideBySide}
        handleFormat={noop}
        onCopy={noop}
        isReadOnly={readOnly}
        setIsReadOnly={setReadOnly}
      />
      {pending && sideBySide ? (
        <SideBySideEditorView
          diffData={{
            originalContent: original,
            modifiedContent: content,
            diffs: diffData.diffs,
          }}
          isReadOnly={readOnly}
          navigationLinksEnabled={false}
          filePath={filePath}
          handleNavigateToAssociated={noop}
          fileContents={{}}
          handleJumpToTarget={noop}
          linesCount={4}
          selectedLines={[]}
          diffActions={{}}
          localContent={content}
          highlightedCode={highlightedCode}
          originalHighlightedCode={originalHighlightedCode}
          handleChange={(e) => setContent(e.target.value)}
        />
      ) : (
        <CodeEditor
          localContent={content}
          highlightedCode={highlightedCode}
          handleChange={(e) => setContent(e.target.value)}
          readOnly={readOnly}
          filePath="src/App.tsx"
        />
      )}
    </div>
  );
}

export function AgentFixture({ scenario }: { scenario: Scenario }) {
  const session = {
    ...createAgentSession({ name: 'Example conversation' }),
    id: 'fixture-session',
    createdAt: 1,
    updatedAt: 1,
    reasoning:
      scenario === 'empty' ? '' : 'I inspected the project and prepared a small change for review.',
    messages:
      scenario === 'empty'
        ? []
        : [
            { id: 1, role: 'user', text: 'Update the welcome heading.', timestamp: '10:00:00' },
            {
              id: 2,
              role: 'ai',
              text:
                scenario === 'error'
                  ? 'AI Manager error: The local model stopped responding.'
                  : 'The proposed heading is ready to review.',
              timestamp: '10:00:01',
            },
          ],
    status: scenario === 'error' ? ('error' as const) : ('idle' as const),
  };
  AgentSessionState.useState(null, {
    sessions: { [session.id]: session },
    activeSessionId: session.id,
  });
  const [value, setValue] = useState('');
  return (
    <div className={styles.agent}>
      <SessionManager activeSession={session} onOpenTree={noop} />
      <ReasoningPanel />
      <PromptComposer
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={noop}
        onSubmit={(event) => event.preventDefault()}
        onStop={noop}
        isAIProcessing={false}
        isButtonActive={!!value}
        isOpen
        selectedModelInfo={RECOMMENDED_WEB_LLM_MODEL}
        modelOptions={[
          { value: RECOMMENDED_WEB_LLM_MODEL.id, label: RECOMMENDED_WEB_LLM_MODEL.name },
        ]}
      />
    </div>
  );
}

export function PreviewFixture({ scenario }: { scenario: Scenario }) {
  const [scale, setScale] = useState(1);
  return (
    <div className={styles.fixtureColumn}>
      <PreviewToolbar
        previewHostLabel="preview.example.test"
        isLoading={false}
        scale={scale}
        isMaximized={false}
        onZoomIn={() => setScale((value) => Math.min(2, value + 0.1))}
        onZoomOut={() => setScale((value) => Math.max(0.5, value - 0.1))}
        onZoomReset={() => setScale(1)}
        onRefresh={noop}
        onOpenExternal={noop}
        onToggleMaximize={noop}
      />
      {scenario === 'empty' ? (
        <PreviewUnavailableState />
      ) : scenario === 'error' ? (
        <PreviewErrorState
          title="Preview error"
          message="The example project could not be built."
        />
      ) : (
        <div className={styles.previewCanvas}>
          <div className={styles.examplePage}>
            <h1>Welcome to our app</h1>
            <p>This is a static example preview.</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function StorageFixture({ scenario }: { scenario: Scenario }) {
  NotificationState.useState(null, {
    notifications:
      scenario === 'empty'
        ? []
        : [
            {
              id: 1,
              type: scenario === 'error' ? 'error' : 'info',
              message:
                scenario === 'error'
                  ? storageFailureMessage('localStorage')
                  : 'Browser storage is running low. Export a ZIP to keep a backup of this workspace.',
              action: { label: 'Export ZIP', onClick: noop },
            },
          ],
  });
  return (
    <div className={styles.fixtureNotice}>
      <h2>Storage status</h2>
      <p>
        {scenario === 'empty'
          ? 'No storage notification.'
          : 'The production notification is displayed as a toast. Export is simulated.'}
      </p>
      <Notification />
    </div>
  );
}

export function ModelsFixture({ scenario }: { scenario: Scenario }) {
  const [open, setOpen] = useState(true);
  return (
    <div className={styles.fixtureNotice}>
      <button type="button" onClick={() => setOpen(true)}>
        Open AI Models
      </button>
      <ModelManager
        isOpen={open}
        capabilityOverride={{
          tier: scenario === 'error' ? 'no-ai' : 'compact-ai',
          browser: 'Example browser',
          isMobile: false,
          hasWorker: true,
          hasWebGPU: scenario !== 'error',
          deviceMemoryGB: 8,
          hardwareConcurrency: 8,
          storageUsageMB: 0,
          storageQuotaMB: 4096,
          recommendedModelId: scenario === 'error' ? null : RECOMMENDED_WEB_LLM_MODEL.id,
          reasons: ['Synthetic device report'],
          checkedAt: 0,
        }}
        selectedModelId={RECOMMENDED_WEB_LLM_MODEL.id}
        cachedModelIds={scenario === 'populated' ? [RECOMMENDED_WEB_LLM_MODEL.id] : []}
        onCancel={() => setOpen(false)}
        onModelCacheAction={noop}
        modelCacheWork={null}
        modelCacheProgress=""
        modelCacheError={scenario === 'error' ? 'Example: model download failed.' : ''}
      />
    </div>
  );
}

export function DownloadFixture() {
  const [open, setOpen] = useState(true);
  return (
    <div className={styles.fixtureNotice}>
      <button type="button" onClick={() => setOpen(true)}>
        Open download confirmation
      </button>
      <DownloadConfirmation
        isOpen={open}
        model={RECOMMENDED_WEB_LLM_MODEL}
        onConfirm={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}

export function WorkspaceFixture({ scenario, theme }: { scenario: Scenario; theme: string }) {
  const [expanded, setExpanded] = useState(true);
  PreviewState.useState(null, {
    htmlContent: null,
    isCompilerReady: false,
    previewAddress: '/preview/dist/index.html',
    previewSessionId: null,
    containerStatus: 'idle',
    compileStatus: 'idle',
    compilePhase: null,
    lastCompileAt: null,
    containerError: null,
  });
  AppState.useState(null, {
    theme,
    projectName: 'Example project',
    showShortcuts: false,
    showCompletionDebug: false,
    isResizing: false,
    isMobile: false,
    compileRequest: 0,
    silentCompileRequest: 0,
  });
  SidebarState.useState(null, {
    isSidebarOpen: true,
    showAIInput: false,
    isSidebarPopupOpen: false,
    isAIInputPopupOpen: false,
    folderTree: [],
    sidebarWidth: 260,
    expandedFolders: {},
  });
  TabState.useState(null, {
    openTabs: [
      {
        id: 'src/App.tsx',
        type: 'file',
        label: 'App.tsx',
        file: { name: 'App.tsx', path: ['src', 'App.tsx'] },
      },
    ],
    activeTabId: 'src/App.tsx',
    lastCodeTabId: 'src/App.tsx',
  });
  const rows =
    scenario === 'empty'
      ? []
      : [
          {
            item: { name: 'src', type: 'folder' as const, path: ['src'], children: [] },
            level: 0,
            path: ['src'],
            pathStr: 'src',
            key: 'src',
          },
          {
            item: { name: 'App.tsx', type: 'file' as const, path: ['src', 'App.tsx'] },
            level: 1,
            path: ['src', 'App.tsx'],
            pathStr: 'src/App.tsx',
            key: 'src/App.tsx',
          },
        ];
  return (
    <div className={styles.workspaceShell}>
      <header className={styles.workspaceHeader}>
        <Breadcrumb
          breadcrumb={['Zakamurai', 'Example project', 'src', 'App.tsx']}
          onBreadcrumbClick={noop}
        />
        <ActionButtons
          onCompile={noop}
          onRebuild={noop}
          onOpenLog={noop}
          onOpenPreview={noop}
          onToggleAIInput={noop}
        />
      </header>
      <div className={styles.workspace}>
        <SidebarContent isMobile={false} isOpen desktopWidth="260px">
          <SidebarTree
            rows={expanded ? rows : rows.filter((row) => row.level === 0)}
            activeTabId="src/App.tsx"
            filterText=""
            expandedFolders={{ src: expanded }}
            loadingPaths={{}}
            draggedPath={null}
            dropTargetPath={null}
            isOpen
            hasFileSystem
            onToggle={() => setExpanded((value) => !value)}
            onOpenFile={noop}
            onRename={() => false}
            onCreate={async () => false}
            onStartCreate={noop}
            onCancelCreate={noop}
            onDelete={noop}
            onDragStart={noop}
            onDragOver={noop}
            onDragEnter={noop}
            onDragLeave={noop}
            onDrop={noop}
            onDragEnd={noop}
          />
        </SidebarContent>
        <div className={styles.fixtureColumn}>
          <TabBar />
          <DiffFixture scenario="empty" />
        </div>
      </div>
    </div>
  );
}
