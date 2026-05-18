import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import ModelManager from './ModelManager';

// Mock Dialog widget to keep tests focused
vi.mock('@/components/Widgets/Dialog/Dialog', () => ({
  default: ({ children, isOpen, title, onCancel }) => {
    if (!isOpen) return null;
    return (
      <div data-testid="dialog">
        <button type="button" onClick={onCancel}>
          Close Dialog
        </button>
        <h3>{title}</h3>
        {children}
      </div>
    );
  },
}));

describe('ModelManager', () => {
  const styles = {
    modelDialog: 'modelDialog',
    modelManager: 'modelManager',
    modelManagerItem: 'modelManagerItem',
    modelManagerInfo: 'modelManagerInfo',
    modelManagerTitleRow: 'modelManagerTitleRow',
    modelManagerBadges: 'modelManagerBadges',
    modelManagerDetails: 'modelManagerDetails',
    modelManagerDetail: 'modelManagerDetail',
    modelManagerActions: 'modelManagerActions',
    modelManagerButtonGroup: 'modelManagerButtonGroup',
    modelCacheToggle: 'modelCacheToggle',
    modelCacheToggleOn: 'modelCacheToggleOn',
    modelCacheToggleTrack: 'modelCacheToggleTrack',
    modelCacheToggleThumb: 'modelCacheToggleThumb',
    modelManagerStatus: 'modelManagerStatus',
    modelManagerError: 'modelManagerError',
  };

  it('renders nothing when closed', () => {
    const { container } = render(
      <ModelManager
        isOpen={false}
        selectedModelId="Llama-3-8B-Instruct-q4f16_1"
        onCancel={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders models list with appropriate badges', () => {
    render(
      <ModelManager
        isOpen={true}
        selectedModelId="Qwen3-4B-q4f16_1-MLC"
        cachedModelIds={['Qwen3-4B-q4f16_1-MLC']}
        onCancel={vi.fn()}
        styles={styles}
      />,
    );

    expect(screen.getByText('AI Models')).toBeDefined();
    // Qwen model should have "Selected" and "Cached" badges
    expect(screen.getAllByText('Selected')).toBeDefined();
    expect(screen.getAllByText('Cached')).toBeDefined();
  });

  it('triggers onModelCacheAction when cache/uncache button clicked', () => {
    const onModelCacheAction = vi.fn();
    render(
      <ModelManager
        isOpen={true}
        selectedModelId="Qwen3-4B-q4f16_1-MLC"
        cachedModelIds={[]}
        onModelCacheAction={onModelCacheAction}
        onCancel={vi.fn()}
        styles={styles}
      />,
    );

    const cacheButtons = screen.getAllByRole('button', { name: /Cache/ });
    fireEvent.click(cacheButtons[0]);
    expect(onModelCacheAction).toHaveBeenCalled();
  });

  it('displays progress or error status message', () => {
    render(
      <ModelManager
        isOpen={true}
        selectedModelId="Qwen3-4B-q4f16_1-MLC"
        cachedModelIds={[]}
        onCancel={vi.fn()}
        modelCacheProgress="Downloading: 50%"
        styles={styles}
      />,
    );

    expect(screen.getByText('Downloading: 50%')).toBeDefined();
  });
});
