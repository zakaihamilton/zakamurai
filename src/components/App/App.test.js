import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

// Mock scrollIntoView
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// Mock dependencies that might be tricky
vi.mock('./Sidebar/Sidebar', () => ({ default: () => <div data-testid="sidebar">Sidebar</div> }));
vi.mock('./TopBar/TopBar', () => ({ default: () => <div data-testid="topbar">TopBar</div> }));
vi.mock('./TabBar/TabBar', () => ({ default: () => <div data-testid="tabbar">TabBar</div> }));
vi.mock('./EditorArea/EditorArea', () => ({
  default: () => <div data-testid="editor">Editor</div>,
}));
vi.mock('./LogArea/LogArea', () => ({ default: () => <div data-testid="logs">Logs</div> }));
vi.mock('./PromptFooter/PromptFooter', () => ({
  default: () => <div data-testid="footer">Footer</div>,
}));

describe('App', () => {
  it('renders all main components', () => {
    render(<App />);
    expect(screen.getByTestId('sidebar')).toBeDefined();
    expect(screen.getByTestId('topbar')).toBeDefined();
    expect(screen.getByTestId('tabbar')).toBeDefined();
    expect(screen.getByTestId('footer')).toBeDefined();
  });
});
