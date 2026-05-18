import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import ReasoningPanel from './ReasoningPanel';

// Mock clipboard API
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn(),
  },
  writable: true,
});

describe('ReasoningPanel', () => {
  const styles = {
    reasoningWrapper: 'reasoningWrapper',
    reasoningVisible: 'reasoningVisible',
    reasoningContainer: 'reasoningContainer',
    reasoningHeader: 'reasoningHeader',
    reasoningTitle: 'reasoningTitle',
    reasoningActions: 'reasoningActions',
    iconButton: 'iconButton',
    copySuccess: 'copySuccess',
    reasoningContent: 'reasoningContent',
    reasoningLink: 'reasoningLink',
  };

  it('renders reasoning title and text correctly', () => {
    render(
      <ReasoningPanel
        reasoning="This is some **Markdown** content"
        isReasoningVisible={true}
        styles={styles}
      />,
    );

    expect(screen.getByText('Progress & Reasoning')).toBeDefined();
    expect(screen.getByText('Markdown')).toBeDefined();
  });

  it('copies reasoning to clipboard when copy button is clicked', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();

    render(
      <ReasoningPanel reasoning="Copied content text" isReasoningVisible={true} styles={styles} />,
    );

    const copyButton = screen.getByRole('button');
    fireEvent.click(copyButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Copied content text');

    // Wait for copied state feedback
    await waitFor(() => {
      expect(copyButton.className).toContain('copySuccess');
    });
  });
});
