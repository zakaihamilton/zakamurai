import { requireElement } from '@/test-utils/domMocks';
import {
  createDefaultCodeEditorProps,
  createMockNavigationTarget,
  createMockSourceLocation,
  mockDomRect,
} from '@/test-utils/editorMocks';
import { findNavigationTargets } from '@/utils/navigation';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import CodeEditor from './CodeEditor';

vi.mock('@/utils/navigation', () => ({
  findNavigationTargets: vi.fn(() => []),
}));

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children, content }: { children: ReactNode; content: string }) => (
    <div data-testid="tooltip" data-content={content}>
      {children}
    </div>
  ),
}));

describe('CodeEditor', () => {
  const defaultProps = createDefaultCodeEditorProps();

  const withLoc = (line: number, col = 1) => createMockSourceLocation({ line, col, index: 0 });

  it('renders pre element with code and links when in readOnly mode', () => {
    const mockTargets = [
      createMockNavigationTarget({
        type: 'export',
        name: 'MyComponent',
        start: 7,
        end: 18,
        targets: [{ filePath: 'src/App.js', fileName: 'App.js', loc: withLoc(1) }],
      }),
    ];
    vi.mocked(findNavigationTargets).mockReturnValue(mockTargets);

    const highlightedHtml =
      'export <span class="navLink" data-nav-target="true" data-nav-idx="0">MyComponent</span>';

    render(<CodeEditor {...defaultProps} highlightedCode={highlightedHtml} />);

    const link = screen.getByText('MyComponent');
    expect(link).toBeDefined();
    expect(link.getAttribute('data-nav-target')).toBe('true');
    expect(link.getAttribute('data-nav-idx')).toBe('0');
  });

  it('shows correct popup header for export type targets on click', () => {
    const mockTargets = [
      createMockNavigationTarget({
        type: 'export',
        name: 'MyComponent',
        start: 7,
        end: 18,
        targets: [
          { filePath: 'src/components/Other.js', fileName: 'Other.js', loc: withLoc(5) },
          { filePath: 'src/components/Another.js', fileName: 'Another.js', loc: withLoc(10) },
        ],
      }),
    ];
    vi.mocked(findNavigationTargets).mockReturnValue(mockTargets);

    const highlightedHtml =
      'export <span class="navLink" data-nav-target="true" data-nav-idx="0">MyComponent</span>';

    const { container } = render(
      <CodeEditor {...defaultProps} highlightedCode={highlightedHtml} />,
    );

    const link = screen.getByText('MyComponent');
    link.getBoundingClientRect = () => mockDomRect({ left: 100, top: 150, width: 80, height: 20 });

    const textarea = requireElement(container.querySelector('textarea'));
    textarea.getBoundingClientRect = () =>
      mockDomRect({ left: 50, top: 100, width: 500, height: 400 });

    fireEvent.click(link);

    expect(screen.getByText('Referenced in')).toBeDefined();
    expect(screen.getByText('Other.js')).toBeDefined();
    expect(screen.getByText(':5')).toBeDefined();
    expect(screen.getByText('Another.js')).toBeDefined();
    expect(screen.getByText(':10')).toBeDefined();
  });

  it('shows correct popup header for import type targets on click', () => {
    const mockTargets = [
      createMockNavigationTarget({
        type: 'import',
        name: './Button',
        start: 7,
        end: 18,
        targets: [
          { filePath: 'src/components/Button.js', fileName: 'Button.js', loc: withLoc(1) },
          { filePath: 'src/components/Button.css', fileName: 'Button.css', loc: withLoc(1) },
        ],
      }),
    ];
    vi.mocked(findNavigationTargets).mockReturnValue(mockTargets);

    const highlightedHtml =
      'import <span class="navLink" data-nav-target="true" data-nav-idx="0">./Button</span>';

    const { container } = render(
      <CodeEditor {...defaultProps} highlightedCode={highlightedHtml} />,
    );

    const link = screen.getByText('./Button');
    link.getBoundingClientRect = () => mockDomRect({ left: 100, top: 150, width: 80, height: 20 });
    const textarea = requireElement(container.querySelector('textarea'));
    textarea.getBoundingClientRect = () =>
      mockDomRect({ left: 50, top: 100, width: 500, height: 400 });

    fireEvent.click(link);

    expect(screen.getByText('Open Import')).toBeDefined();
    expect(screen.getByText('Button.js')).toBeDefined();
    expect(screen.getByText('Button.css')).toBeDefined();
  });

  it('shows correct popup header for component type targets on click', () => {
    const mockTargets = [
      createMockNavigationTarget({
        type: 'component',
        name: 'Button',
        start: 7,
        end: 18,
        targets: [
          { filePath: 'src/components/Button.js', fileName: 'Button.js', loc: withLoc(2) },
          { filePath: 'src/components/Button.tsx', fileName: 'Button.tsx', loc: withLoc(2) },
        ],
      }),
    ];
    vi.mocked(findNavigationTargets).mockReturnValue(mockTargets);

    const highlightedHtml =
      '<span class="navLink" data-nav-target="true" data-nav-idx="0">Button</span>';

    const { container } = render(
      <CodeEditor {...defaultProps} highlightedCode={highlightedHtml} />,
    );

    const link = screen.getByText('Button');
    link.getBoundingClientRect = () => mockDomRect({ left: 100, top: 150, width: 80, height: 20 });
    const textarea = requireElement(container.querySelector('textarea'));
    textarea.getBoundingClientRect = () =>
      mockDomRect({ left: 50, top: 100, width: 500, height: 400 });

    fireEvent.click(link);

    expect(screen.getByText('Component Definition')).toBeDefined();
    expect(screen.getByText('Button.js')).toBeDefined();
    expect(screen.getByText('Button.tsx')).toBeDefined();
  });

  it('calls onJumpToTarget when popup target item is clicked', () => {
    const onJumpToTarget = vi.fn();
    const mockTargets = [
      createMockNavigationTarget({
        type: 'export',
        name: 'MyComponent',
        start: 7,
        end: 18,
        targets: [
          { filePath: 'src/components/Other.js', fileName: 'Other.js', loc: withLoc(5, 2) },
          { filePath: 'src/components/Extra.js', fileName: 'Extra.js', loc: withLoc(15, 2) },
        ],
      }),
    ];
    vi.mocked(findNavigationTargets).mockReturnValue(mockTargets);

    const highlightedHtml =
      'export <span class="navLink" data-nav-target="true" data-nav-idx="0">MyComponent</span>';

    const { container } = render(
      <CodeEditor
        {...defaultProps}
        highlightedCode={highlightedHtml}
        onJumpToTarget={onJumpToTarget}
      />,
    );

    const link = screen.getByText('MyComponent');
    link.getBoundingClientRect = () => mockDomRect({ left: 100, top: 150, width: 80, height: 20 });
    const textarea = requireElement(container.querySelector('textarea'));
    textarea.getBoundingClientRect = () =>
      mockDomRect({ left: 50, top: 100, width: 500, height: 400 });

    fireEvent.click(link);

    const popupItem = screen.getByText('Other.js');
    fireEvent.click(popupItem);

    expect(onJumpToTarget).toHaveBeenCalledWith('src/components/Other.js', withLoc(5, 2));
  });

  it('jumps directly to target on click if there is only one target (bypassing popup)', () => {
    const onJumpToTarget = vi.fn();
    const mockTargets = [
      createMockNavigationTarget({
        type: 'export',
        name: 'MyComponent',
        start: 7,
        end: 18,
        targets: [
          { filePath: 'src/components/Other.js', fileName: 'Other.js', loc: withLoc(5, 2) },
        ],
      }),
    ];
    vi.mocked(findNavigationTargets).mockReturnValue(mockTargets);

    const highlightedHtml =
      'export <span class="navLink" data-nav-target="true" data-nav-idx="0">MyComponent</span>';

    const { container } = render(
      <CodeEditor
        {...defaultProps}
        highlightedCode={highlightedHtml}
        onJumpToTarget={onJumpToTarget}
      />,
    );

    const link = screen.getByText('MyComponent');
    link.getBoundingClientRect = () => mockDomRect({ left: 100, top: 150, width: 80, height: 20 });
    const textarea = requireElement(container.querySelector('textarea'));
    textarea.getBoundingClientRect = () =>
      mockDomRect({ left: 50, top: 100, width: 500, height: 400 });

    fireEvent.click(link);

    expect(screen.queryByText('Referenced in')).toBeNull();
    expect(onJumpToTarget).toHaveBeenCalledWith('src/components/Other.js', withLoc(5, 2));
  });

  it('activates nav links in edit mode when Command is held', () => {
    const onJumpToTarget = vi.fn();
    const mockTargets = [
      createMockNavigationTarget({
        type: 'export',
        name: 'MyComponent',
        start: 7,
        end: 18,
        targets: [
          { filePath: 'src/components/Other.js', fileName: 'Other.js', loc: withLoc(5, 2) },
        ],
      }),
    ];
    vi.mocked(findNavigationTargets).mockReturnValue(mockTargets);

    const highlightedHtml =
      'export <span class="navLink" data-nav-target="true" data-nav-idx="0">MyComponent</span>';

    render(
      <CodeEditor
        {...defaultProps}
        isReadOnly={false}
        navigationLinksEnabled={true}
        highlightedCode={highlightedHtml}
        onJumpToTarget={onJumpToTarget}
      />,
    );

    fireEvent.click(screen.getByText('MyComponent'), { metaKey: true });

    expect(onJumpToTarget).toHaveBeenCalledWith('src/components/Other.js', withLoc(5, 2));
  });

  it('does not activate nav links in edit mode without the Command key', () => {
    const onJumpToTarget = vi.fn();
    const mockTargets = [
      createMockNavigationTarget({
        type: 'export',
        name: 'MyComponent',
        start: 7,
        end: 18,
        targets: [
          { filePath: 'src/components/Other.js', fileName: 'Other.js', loc: withLoc(5, 2) },
        ],
      }),
    ];
    vi.mocked(findNavigationTargets).mockReturnValue(mockTargets);

    const highlightedHtml =
      'export <span class="navLink" data-nav-target="true" data-nav-idx="0">MyComponent</span>';

    render(
      <CodeEditor
        {...defaultProps}
        isReadOnly={false}
        navigationLinksEnabled={true}
        highlightedCode={highlightedHtml}
        onJumpToTarget={onJumpToTarget}
      />,
    );

    fireEvent.click(screen.getByText('MyComponent'));

    expect(onJumpToTarget).not.toHaveBeenCalled();
    expect(screen.queryByText('Referenced in')).toBeNull();
  });

  it('uses expanded text when copying from a folded projection', () => {
    const onCopySelection = vi.fn(() => 'full folded text');
    const setData = vi.fn();

    render(
      <CodeEditor
        {...defaultProps}
        isReadOnly={false}
        localContent="visible folded text"
        highlightedCode="visible folded text"
        onCopySelection={onCopySelection}
      />,
    );

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.setSelectionRange(0, textarea.value.length);
    fireEvent.copy(textarea, {
      clipboardData: { setData },
    });

    expect(onCopySelection).toHaveBeenCalledWith('visible folded text', 0, 19);
    expect(setData).toHaveBeenCalledWith('text/plain', 'full folded text');
  });

  it('reports the selection when a shortcut emits a synthetic change event', () => {
    const onCursorUpdate = vi.fn();
    render(
      <CodeEditor
        {...defaultProps}
        isReadOnly={false}
        navigationLinksEnabled={false}
        onCursorUpdate={onCursorUpdate}
      />,
    );

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.setSelectionRange(4, 4);

    fireEvent.keyDown(textarea, { key: 'Tab' });

    expect(onCursorUpdate).toHaveBeenCalledWith({ line: 1, col: 5, index: 4 });
  });

  it('shows variable definition popup headers and toggles closed on repeat click', () => {
    const mockTargets = [
      createMockNavigationTarget({
        type: 'variable',
        name: 'messages',
        start: 0,
        end: 8,
        className: 'variable:messages',
        targets: [
          { filePath: 'src/test.js', fileName: 'test.js', loc: withLoc(1) },
          { filePath: 'src/other.js', fileName: 'other.js', loc: withLoc(4) },
        ],
      }),
    ];
    vi.mocked(findNavigationTargets).mockReturnValue(mockTargets);

    const highlightedHtml =
      '<span class="navLink" data-nav-target="true" data-nav-idx="0">messages</span>';
    const { container } = render(
      <CodeEditor {...defaultProps} highlightedCode={highlightedHtml} navigationLinksEnabled />,
    );

    const link = screen.getByText('messages');
    link.getBoundingClientRect = () => mockDomRect({ left: 100, top: 150, width: 80, height: 20 });
    const textarea = requireElement(container.querySelector('textarea'));
    textarea.getBoundingClientRect = () =>
      mockDomRect({ left: 50, top: 100, width: 500, height: 400 });

    fireEvent.click(link);
    expect(screen.getByText('Defined in CSS')).toBeDefined();
    expect(screen.getByText('test.js')).toBeDefined();
  });
});
