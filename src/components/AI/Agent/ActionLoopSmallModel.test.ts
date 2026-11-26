import { describe, expect, it } from 'vitest';
import {
  buildArchetypeSkeleton,
  buildDeclarationRecoveryGuidance,
  generationGuidanceForRequest,
  isBoardGameRequest,
  isClockAppRequest,
  isKnownInteractiveAppRequest,
  isLightweightAgentModel,
  isMidTierAgentModel,
  isNewAppGenerationRequest,
  isNotesAppRequest,
  isTodoAppRequest,
  resolveActionLoopSessionPolicy,
  restrictLowerModelActions,
  restrictMidTierContextReadyActions,
  shouldRegenerateFailedInteractiveSource,
  shouldSalvageGeneratedInteractiveSource,
  validateModularGenerationFiles,
} from './ActionLoopSmallModel';

describe('ActionLoopSmallModel', () => {
  it('classifies model tiers and request archetypes', () => {
    expect(isLightweightAgentModel('Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC')).toBe(true);
    expect(isLightweightAgentModel('Qwen3.5-0.8B-q4f16_1-MLC')).toBe(true);
    expect(isLightweightAgentModel('Qwen3.5-4B-q4f16_1-MLC')).toBe(false);
    expect(isMidTierAgentModel('Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC')).toBe(true);
    expect(isMidTierAgentModel('Qwen3.5-9B-q4f16_1-MLC')).toBe(false);

    expect(isNewAppGenerationRequest('build a todo app')).toBe(true);
    expect(isNewAppGenerationRequest('update this existing app')).toBe(false);

    expect(isTodoAppRequest('build a task planner')).toBe(true);
    expect(isClockAppRequest('create a stopwatch')).toBe(true);
    expect(isNotesAppRequest('build a todo list')).toBe(false);
    expect(isNotesAppRequest('build a notebook app')).toBe(true);
    expect(isNotesAppRequest('list_files in workspace')).toBe(false);
    expect(isNotesAppRequest('make a simple list')).toBe(true);
    expect(isNotesAppRequest('make a list app')).toBe(true);
    expect(isNotesAppRequest('make a list of files')).toBe(false);
    expect(isBoardGameRequest('create tic tac toe')).toBe(true);
    expect(isKnownInteractiveAppRequest('create a timer')).toBe(true);
    expect(shouldSalvageGeneratedInteractiveSource('create a timer app', false)).toBe(true);
    expect(shouldSalvageGeneratedInteractiveSource('create a timer', false)).toBe(false);
    expect(shouldSalvageGeneratedInteractiveSource('create a timer', true)).toBe(true);
    expect(shouldSalvageGeneratedInteractiveSource('improve existing todo', true)).toBe(true);
  });

  it('restricts actions and builds recovery guidance', () => {
    expect(restrictLowerModelActions(['read_file', 'replace_file_content', 'write_file'])).toEqual([
      'read_file',
      'write_file',
    ]);
    expect(restrictLowerModelActions(['replace_file_content'])).toEqual(['write_file', 'finish']);
    expect(restrictMidTierContextReadyActions(['read_file', 'write_file', 'finish'])).toEqual([
      'write_file',
      'finish',
    ]);
    expect(restrictMidTierContextReadyActions(['read_file'])).toEqual([
      'write_file',
      'delete_file',
      'finish',
    ]);

    expect(
      buildDeclarationRecoveryGuidance('src/App.jsx', 'undeclared event handlers (also: handleX)'),
    ).toContain('Regenerate the complete src/App.jsx');
    expect(
      buildDeclarationRecoveryGuidance(
        'src/App.tsx',
        "references undeclared event handler 'handleClick'",
      ),
    ).toContain('handleClick');
    expect(
      buildDeclarationRecoveryGuidance('src/App.jsx', "calls undeclared function 'formatTime'"),
    ).toContain('formatTime');
    expect(buildDeclarationRecoveryGuidance('src/App.jsx', 'syntax error')).toBe('');

    expect(
      shouldRegenerateFailedInteractiveSource(
        'build a dashboard app',
        true,
        'references undeclared event handler',
      ),
    ).toBe(true);
  });

  it('builds skeletons, guidance, and validates modular generation bundles', () => {
    expect(buildArchetypeSkeleton('explain code')).toBeNull();
    expect(buildArchetypeSkeleton('build a notes app', 'src/my-view.jsx')).toContain(
      'export default function App()',
    );
    expect(
      generationGuidanceForRequest('build a todo clock chess app', {
        interactiveContract: true,
        lightweight: true,
        modularGeneration: false,
      }).length,
    ).toBe(5);
    expect(
      generationGuidanceForRequest('build a clock notes chess app', {
        interactiveContract: true,
        lightweight: true,
        modularGeneration: false,
      }).length,
    ).toBe(5);

    const missingIssues = validateModularGenerationFiles('build a todo app', 'src/App.jsx', [
      { path: 'src/App.css', content: 'body {}' },
    ]);
    expect(missingIssues).toContain('src/App.jsx');
    expect(missingIssues).toContain('src/App.module.css');
    expect(missingIssues).toContain('src/App.css');
    expect(missingIssues).toContain('at least one component under src/components/');
    expect(missingIssues).toContain('src/components/TodoForm.jsx or .tsx');
    expect(missingIssues).toContain('src/components/TodoList.jsx or .tsx');

    const tooManyIssues = validateModularGenerationFiles('build a dashboard app', 'src/App.jsx', [
      {
        path: 'src/App.jsx',
        content:
          "import styles from './App.module.css'; export default function App(){ return <div className={styles.missing} />; }",
      },
      { path: 'src/App.module.css', content: '.app {}' },
      { path: 'src/components/A.jsx', content: 'export default function A(){ return null; }' },
      { path: 'src/components/B.jsx', content: 'export default function B(){ return null; }' },
      { path: 'src/components/C.jsx', content: 'export default function C(){ return null; }' },
    ]);
    expect(tooManyIssues).toContain('no more than two subcomponents');
    expect(tooManyIssues).toContain('src/components/A.module.css');

    const validIssues = validateModularGenerationFiles('build a todo app', 'src/App.jsx', [
      {
        path: 'src/App.jsx',
        content:
          "import styles from './App.module.css'; import TodoForm from './components/TodoForm'; import TodoList from './components/TodoList'; export default function App(){ return <main className={styles.app}><TodoForm /><TodoList /></main>; }",
      },
      { path: 'src/App.module.css', content: '.app { display: grid; }' },
      {
        path: 'src/components/TodoForm.jsx',
        content:
          "import styles from './TodoForm.module.css'; export default function TodoForm(){ return <form className={styles.form} />; }",
      },
      { path: 'src/components/TodoForm.module.css', content: '.form { display: flex; }' },
      {
        path: 'src/components/TodoList.jsx',
        content:
          "import styles from './TodoList.module.css'; export default function TodoList(){ return <ul className={styles['list']} />; }",
      },
      { path: 'src/components/TodoList.module.css', content: '.list { margin: 0; }' },
    ]);
    expect(validIssues).toEqual([]);
  });

  it('resolves session policy across lightweight, mid-tier, and full models', () => {
    const modular = resolveActionLoopSessionPolicy({
      request: 'create a notes app',
      model: 'Qwen3.5-0.8B-q4f16_1-MLC',
      priorContext: 'context',
      allowedActions: ['read_file', 'replace_file_content', 'write_file', 'finish'],
      systemPrompt: 'BASE',
    });
    expect(modular.modularGeneration).toBe(true);
    expect(modular.agentSystemPrompt).toContain('path=src/App.jsx');

    const lightweightEdit = resolveActionLoopSessionPolicy({
      request: 'update existing header',
      model: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
      priorContext: 'context',
      allowedActions: ['replace_file_content', 'write_file', 'finish'],
      systemPrompt: 'BASE',
    });
    expect(lightweightEdit.hostAssistedWrite).toBe(true);
    expect(lightweightEdit.agentSystemPrompt).toContain('Workspace context is already supplied');

    const midTier = resolveActionLoopSessionPolicy({
      request: 'build a todo app',
      model: 'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC',
      priorContext: '',
      allowedActions: ['read_file', 'write_file', 'finish'],
      systemPrompt: 'BASE',
    });
    expect(midTier.midTierAssisted).toBe(true);
    expect(midTier.effectiveAllowedActions).toEqual(['write_file', 'finish']);

    const fullRole = resolveActionLoopSessionPolicy({
      request: 'build a todo app',
      model: 'Qwen3.5-9B-q4f16_1-MLC',
      agentRole: 'reviewer',
      allowedActions: ['read_file', 'write_file', 'finish'],
      systemPrompt: 'BASE',
    });
    expect(fullRole.agentSystemPrompt).toBe('BASE');
  });
});
