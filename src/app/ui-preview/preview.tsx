'use client';

import { WebLLMState } from '@/components/AI/WebLLMState';
import CodeEditor from '@/components/App/Views/EditorArea/CodeEditor';
import { highlightCodeSync } from '@/components/App/Views/EditorArea/highlightClient';
import Instructions from '@/components/App/Views/Instructions';
import LogArea, { LogState } from '@/components/App/Views/LogArea';
import Welcome from '@/components/App/Views/Welcome';
import { useEffect, useState } from 'react';
import { StateRoot } from 'triactor';
import {
  AgentFixture,
  DiffFixture,
  DownloadFixture,
  ModelsFixture,
  PreviewFixture,
  StorageFixture,
  WorkspaceFixture,
} from './fixtures';
import styles from './preview.module.css';

const screens = [
  'welcome',
  'workspace',
  'editor',
  'diff',
  'agent',
  'preview',
  'logs',
  'instructions',
  'models',
  'download',
  'storage',
] as const;
type Screen = (typeof screens)[number];
const scenarios = ['populated', 'empty', 'error'] as const;
type Scenario = (typeof scenarios)[number];
const example = 'export default function App() {\n  return <h1>Hello, world!</h1>;\n}\n';

function Fixture({
  screen,
  scenario,
  theme,
}: { screen: Screen; scenario: Scenario; theme: string }) {
  const [content, setContent] = useState(scenario === 'empty' ? '' : example);
  LogState.useState(null, {
    logs:
      scenario === 'empty'
        ? []
        : [
            { id: 1, role: 'system', timestamp: '10:00:00', text: 'Building project...' },
            {
              id: 2,
              role: 'system',
              timestamp: '10:00:01',
              text:
                scenario === 'error'
                  ? 'Compilation error: Unable to resolve example module.'
                  : 'Preview ready.',
            },
          ],
    isSystemProcessing: false,
    isAIProcessing: false,
  });
  WebLLMState.useState(null, {
    cachedModelIds: [],
    engines: {},
    activeModelId: null,
    capabilityReport: null,
  });
  if (screen === 'welcome') return <Welcome />;
  if (screen === 'workspace') return <WorkspaceFixture scenario={scenario} theme={theme} />;
  if (screen === 'diff') return <DiffFixture scenario={scenario} />;
  if (screen === 'agent') return <AgentFixture scenario={scenario} />;
  if (screen === 'preview') return <PreviewFixture scenario={scenario} />;
  if (screen === 'models') return <ModelsFixture scenario={scenario} />;
  if (screen === 'download') return <DownloadFixture />;
  if (screen === 'storage') return <StorageFixture scenario={scenario} />;
  if (screen === 'instructions') return <Instructions />;
  if (screen === 'logs') return <LogArea />;
  return (
    <div className={styles.editor}>
      <div className={styles.fileName}>src/App.tsx · synthetic file</div>
      <CodeEditor
        localContent={content}
        highlightedCode={highlightCodeSync(content, 'src/App.tsx', {})}
        handleChange={(event) => setContent(event.target.value)}
        filePath="src/App.tsx"
      />
    </div>
  );
}

function initialValue<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  const value = new URLSearchParams(window.location.search).get(key);
  return allowed.find((item) => item === value) ?? fallback;
}

export default function Preview() {
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>('welcome');
  const [scenario, setScenario] = useState<Scenario>('populated');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  useEffect(() => {
    setScreen(initialValue('screen', screens, 'welcome'));
    setScenario(initialValue('scenario', scenarios, 'populated'));
    setTheme(initialValue('theme', ['dark', 'light'] as const, 'dark'));
    setReady(true);
  }, []);
  useEffect(() => {
    const hadLightTheme = document.body.classList.contains('light');
    document.body.classList.toggle('light', theme === 'light');
    return () => {
      document.body.classList.toggle('light', hadLightTheme);
    };
  }, [theme]);
  const update = (nextScreen: Screen, nextScenario: Scenario, nextTheme: 'dark' | 'light') => {
    setScreen(nextScreen);
    setScenario(nextScenario);
    setTheme(nextTheme);
    const params = new URLSearchParams({
      screen: nextScreen,
      scenario: nextScenario,
      theme: nextTheme,
    });
    window.history.replaceState(null, '', `?${params}`);
  };
  return (
    <main
      data-preview-ready={ready}
      className={`${styles.page} ${theme === 'light' ? 'light' : ''}`}
    >
      <header className={styles.controls}>
        <div>
          <strong>UI preview · synthetic data</strong>
          <p>Changes stay in memory. AI submission is disabled.</p>
        </div>
        <label>
          Screen
          <select
            value={screen}
            onChange={(e) => update(e.target.value as Screen, scenario, theme)}
          >
            {screens.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Scenario
          <select
            value={scenario}
            onChange={(e) => update(screen, e.target.value as Scenario, theme)}
          >
            {scenarios.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Theme
          <select
            value={theme}
            onChange={(e) => update(screen, scenario, e.target.value as 'dark' | 'light')}
          >
            <option>dark</option>
            <option>light</option>
          </select>
        </label>
      </header>
      <section
        onClickCapture={(event) => {
          if (event.target instanceof Element && event.target.closest('a')) event.preventDefault();
        }}
        onAuxClickCapture={(event) => {
          if (event.target instanceof Element && event.target.closest('a')) event.preventDefault();
        }}
        className={styles.stage}
        aria-label="Preview screen"
        onSubmitCapture={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <StateRoot key={`${screen}-${scenario}`}>
          <Fixture screen={screen} scenario={scenario} theme={theme} />
        </StateRoot>
      </section>
    </main>
  );
}
