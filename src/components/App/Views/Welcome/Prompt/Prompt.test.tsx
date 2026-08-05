import { getCachedWebLLMModelIds } from '@/components/AI/WebLLMAPI';
import { RECOMMENDED_WEB_LLM_MODEL } from '@/components/AI/WebLLMModels';
import { WebLLMState } from '@/components/AI/WebLLMState';
import { PromptUiState } from '@/components/App/Panes/Prompt/PromptState';
import { LogState } from '@/components/App/Views/LogArea';
import { requireElement } from '@/test-utils/domMocks';
import { makeLogState, makePromptUiState, makeWebLLMState } from '@/test-utils/stateMocks';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ChangeEvent, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WelcomePrompt from './Prompt';

vi.mock('@/components/AI/WebLLMAPI', () => ({
  getCachedWebLLMModelIds: vi.fn(),
}));

vi.mock('@/components/AI/WebLLMState', () => ({
  WebLLMState: {
    useState: vi.fn(() => ({ cachedModelIds: [] })),
  },
}));

vi.mock('@/components/App/Panes/Prompt/PromptState', () => ({
  PromptUiState: {
    usePassiveState: vi.fn(),
  },
}));

vi.mock('@/components/App/Views/LogArea', () => ({
  LogState: {
    useState: vi.fn(() => makeLogState({ isAIProcessing: false })),
  },
}));

vi.mock('@/components/ui/Dialog', () => ({
  default: ({
    isOpen,
    title,
    message,
    onConfirm,
    onCancel,
    confirmText,
    cancelText,
  }: {
    isOpen?: boolean;
    title?: ReactNode;
    message?: ReactNode;
    onConfirm?: () => void;
    onCancel?: () => void;
    confirmText?: ReactNode;
    cancelText?: ReactNode;
  }) => {
    if (!isOpen) return null;
    return (
      <div data-testid="download-dialog">
        <h3>{title}</h3>
        <p>{message}</p>
        <button type="button" onClick={onCancel}>
          {cancelText}
        </button>
        <button type="button" onClick={onConfirm}>
          {confirmText}
        </button>
      </div>
    );
  },
}));

vi.mock('@/components/ui/Select', () => ({
  default: ({
    value,
    options,
    onChange,
    disabled,
    ariaLabel,
  }: {
    value: string;
    options: Array<{ value: string; label: string; badges?: string[] }>;
    onChange: (value: string) => void;
    disabled?: boolean;
    ariaLabel?: string;
  }) => (
    <select
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
          {option.badges?.length ? ` (${option.badges.join(', ')})` : ''}
        </option>
      ))}
    </select>
  ),
}));

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    Send: () => <span data-testid="send-icon" />,
    Close: () => <span data-testid="close-icon" />,
  },
}));

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ content, children }: { content: ReactNode; children: ReactNode }) => (
    <span data-tooltip={content}>{children}</span>
  ),
}));

describe('WelcomePrompt', () => {
  let promptUiState: ReturnType<typeof makePromptUiState>;

  beforeEach(() => {
    vi.clearAllMocks();
    promptUiState = makePromptUiState({ selectedModel: RECOMMENDED_WEB_LLM_MODEL.id });
    vi.mocked(PromptUiState.usePassiveState).mockReturnValue(promptUiState);
    vi.mocked(LogState.useState).mockReturnValue(makeLogState({ isAIProcessing: false }));
    vi.mocked(WebLLMState.useState).mockReturnValue(makeWebLLMState());
    vi.mocked(getCachedWebLLMModelIds).mockResolvedValue([]);
  });

  it('renders the composer and disables build until there is input', () => {
    render(<WelcomePrompt />);

    expect(screen.getByLabelText('Describe what you want to build')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Start building with AI' })).toBeDisabled();
    expect(screen.getByText(/Runs locally in your browser/)).toBeDefined();
  });

  it('restores the remembered welcome prompt draft', () => {
    promptUiState = makePromptUiState({
      selectedModel: RECOMMENDED_WEB_LLM_MODEL.id,
      welcomePrompt: 'build a tic tac toe game',
    });
    vi.mocked(PromptUiState.usePassiveState).mockReturnValue(promptUiState);

    render(<WelcomePrompt />);

    expect(screen.getByLabelText('Describe what you want to build')).toHaveValue(
      'build a tic tac toe game',
    );
  });

  it('clears the welcome prompt with the clear button and shows its tooltip label', () => {
    promptUiState = makePromptUiState({
      selectedModel: RECOMMENDED_WEB_LLM_MODEL.id,
      welcomePrompt: 'draft prompt',
    });
    vi.mocked(PromptUiState.usePassiveState).mockReturnValue(promptUiState);

    render(<WelcomePrompt />);

    const clearButton = screen.getByRole('button', { name: 'Clear prompt' });
    expect(clearButton.parentElement).toHaveAttribute('data-tooltip', 'Clear prompt');

    fireEvent.click(clearButton);

    expect(screen.getByLabelText('Describe what you want to build')).toHaveValue('');
    expect(promptUiState.welcomePrompt).toBe('');
  });

  it('starts a request immediately when the selected model is cached', async () => {
    vi.mocked(getCachedWebLLMModelIds).mockResolvedValue([RECOMMENDED_WEB_LLM_MODEL.id]);

    render(<WelcomePrompt />);

    fireEvent.change(screen.getByLabelText('Describe what you want to build'), {
      target: { value: '  build a todo app  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start building with AI' }));

    await waitFor(() => {
      expect(promptUiState).toHaveBeenCalled();
    });

    expect(promptUiState.welcomeRequest).toEqual({
      text: 'build a todo app',
      scope: 'project',
    });
    expect(promptUiState.welcomePrompt).toBe('build a todo app');
    expect(screen.getByLabelText('Describe what you want to build')).toHaveValue('');
    expect(screen.queryByTestId('download-dialog')).toBeNull();
  });

  it('asks to download when the selected model is not cached, then starts on confirm', async () => {
    vi.mocked(getCachedWebLLMModelIds).mockResolvedValue([]);

    render(<WelcomePrompt />);

    fireEvent.change(screen.getByLabelText('Describe what you want to build'), {
      target: { value: 'new project' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start building with AI' }));

    await waitFor(() => {
      expect(screen.getByTestId('download-dialog')).toBeDefined();
    });
    expect(screen.getByRole('heading', { name: 'Download local AI model?' })).toBeDefined();
    expect(promptUiState.welcomeRequest).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Download and build' }));

    await waitFor(() => {
      expect(promptUiState.welcomeRequest).toEqual({
        text: 'new project',
        scope: 'project',
      });
    });
    expect(screen.queryByTestId('download-dialog')).toBeNull();
  });

  it('cancels the download confirmation without starting a request', async () => {
    render(<WelcomePrompt />);

    fireEvent.change(screen.getByLabelText('Describe what you want to build'), {
      target: { value: 'cancel me' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start building with AI' }));

    await waitFor(() => {
      expect(screen.getByTestId('download-dialog')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByTestId('download-dialog')).toBeNull();
    expect(promptUiState.welcomeRequest).toBeNull();
  });

  it('falls back to cachedModelIds when cache inspection fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(WebLLMState.useState).mockReturnValue(
      makeWebLLMState({ cachedModelIds: [RECOMMENDED_WEB_LLM_MODEL.id] }),
    );
    vi.mocked(getCachedWebLLMModelIds).mockRejectedValue(new Error('cache unavailable'));

    render(<WelcomePrompt />);

    fireEvent.change(screen.getByLabelText('Describe what you want to build'), {
      target: { value: 'fallback cache' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start building with AI' }));

    await waitFor(() => {
      expect(promptUiState.welcomeRequest).toEqual({
        text: 'fallback cache',
        scope: 'project',
      });
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('submits on Enter without Shift and ignores Shift+Enter', async () => {
    vi.mocked(getCachedWebLLMModelIds).mockResolvedValue([RECOMMENDED_WEB_LLM_MODEL.id]);

    render(<WelcomePrompt />);
    const input = screen.getByLabelText('Describe what you want to build');

    fireEvent.change(input, { target: { value: 'enter submit' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(getCachedWebLLMModelIds).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(promptUiState.welcomeRequest).toEqual({
        text: 'enter submit',
        scope: 'project',
      });
    });
  });

  it('updates the selected model from the selector', () => {
    render(<WelcomePrompt />);

    fireEvent.change(screen.getByLabelText('Choose local AI model'), {
      target: { value: 'Qwen3.5-2B-q4f16_1-MLC' },
    });

    expect(promptUiState.selectedModel).toBe('Qwen3.5-2B-q4f16_1-MLC');
  });

  it('does not submit blank requests', () => {
    render(<WelcomePrompt />);
    const input = screen.getByLabelText('Describe what you want to build');
    const form = input.closest('form');
    expect(form).not.toBeNull();

    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.submit(requireElement(form));
    expect(getCachedWebLLMModelIds).not.toHaveBeenCalled();
  });

  it('does not submit while AI is processing', () => {
    vi.mocked(LogState.useState).mockReturnValue(makeLogState({ isAIProcessing: true }));

    render(<WelcomePrompt />);

    const input = screen.getByLabelText('Describe what you want to build');
    const form = input.closest('form');
    expect(form).not.toBeNull();
    expect(input).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Start building with AI' })).toBeDisabled();
    fireEvent.submit(requireElement(form));
    expect(getCachedWebLLMModelIds).not.toHaveBeenCalled();
  });

  it('skips starting when prompt state is unavailable', async () => {
    vi.mocked(PromptUiState.usePassiveState).mockReturnValue(
      undefined as ReturnType<typeof PromptUiState.usePassiveState>,
    );
    vi.mocked(getCachedWebLLMModelIds).mockResolvedValue([RECOMMENDED_WEB_LLM_MODEL.id]);

    render(<WelcomePrompt />);

    fireEvent.change(screen.getByLabelText('Describe what you want to build'), {
      target: { value: 'no state' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start building with AI' }));

    await waitFor(() => {
      expect(getCachedWebLLMModelIds).toHaveBeenCalled();
    });
  });
});
