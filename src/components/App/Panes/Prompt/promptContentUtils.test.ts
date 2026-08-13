import type { AgentSession } from '@/types/domain-types';
import { describe, expect, it } from 'vitest';
import { getAgentPaneContent } from './promptContentUtils';

describe('getAgentPaneContent', () => {
  it('combines transcript, download status, and reasoning for the header copy action', () => {
    const activeSession = {
      messages: [{ timestamp: '10:00', role: 'user', text: 'Build the app' }],
      reasoningEvents: [{ text: 'Planning the requested changes' }],
      showStepIO: false,
    } as AgentSession;

    expect(
      getAgentPaneContent({
        activeSession,
        sessionReasoning: '',
        selectedModelInfo: { id: 'model', name: 'Local Model' },
        isModelDownloading: true,
        modelDownloadProgress: '50%',
      }),
    ).toBe(
      '--- Transcript ---\n[10:00] user: Build the app\n\n--- Reasoning ---\nDownloading Local Model — 50%\n\nPlanning the requested changes',
    );
  });

  it('returns a useful empty state when no session output exists', () => {
    expect(
      getAgentPaneContent({
        activeSession: null,
        sessionReasoning: '',
        selectedModelInfo: { id: 'model' },
        isModelDownloading: false,
        modelDownloadProgress: '',
      }),
    ).toBe('Start a conversation with the AI Manager.');
  });
});
