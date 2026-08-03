import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProjectCompatibility from './Compatibility';

const editorStore = Object.assign(vi.fn(), { fileContents: {} });

vi.mock('@/components/App/Views/EditorArea', () => ({
  EditorState: { useState: vi.fn(() => editorStore) },
}));

describe('ProjectCompatibility', () => {
  it('shows a clear ready state for plain browser files', () => {
    editorStore.fileContents = { 'index.html': '<h1>Hello</h1>' };
    render(<ProjectCompatibility />);
    expect(screen.getByText('Ready for browser build')).toBeDefined();
    expect(screen.getByText('No compatibility warnings detected.')).toBeDefined();
  });

  it('shows runtime warnings and native dependency guidance', () => {
    editorStore.fileContents = {
      'package.json': JSON.stringify({
        dependencies: { sharp: '^1.0.0' },
        scripts: { build: 'next build' },
      }),
      'index.html': '<div />',
    };
    render(<ProjectCompatibility />);
    expect(screen.getByText('Build may need attention')).toBeDefined();
    expect(screen.getByText(/Review these dependencies: sharp/)).toBeDefined();
    expect(screen.getAllByText('warning').length).toBeGreaterThan(0);
  });

  it('shows blocked state for malformed manifests', () => {
    editorStore.fileContents = { 'package.json': '{' };
    render(<ProjectCompatibility />);
    expect(screen.getByText('Fix project errors first')).toBeDefined();
    expect(screen.getByText(/package.json cannot be parsed/)).toBeDefined();
  });
});
