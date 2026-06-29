import { findNavigationTargets } from '@/utils/navigation';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CodeEditor from './CodeEditor';

vi.mock('@/utils/navigation', () => ({
  findNavigationTargets: vi.fn(() => []),
}));

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children, content }) => (
    <div data-testid="tooltip" data-content={content}>
      {children}
    </div>
  ),
}));

describe('CodeEditor', () => {
  const defaultProps = {
    localContent: 'const a = 1;',
    handleChange: vi.fn(),
    highlightedCode: 'const a = 1;',
    readOnly: false,
    onCursorUpdate: vi.fn(),
    cursorPos: {},
    scrollContainerRef: { current: null },
    filePath: 'src/App.js',
    isReadOnly: true,
    fileContents: {},
    onJumpToTarget: vi.fn(),
  };

  it('renders pre element with code and links when in readOnly mode', () => {
    const mockTargets = [
      {
        type: 'export',
        name: 'MyComponent',
        start: 7,
        end: 18,
        targets: [{ filePath: 'src/App.js', fileName: 'App.js', loc: { line: 1, col: 1 } }],
      },
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
      {
        type: 'export',
        name: 'MyComponent',
        start: 7,
        end: 18,
        targets: [
          { filePath: 'src/components/Other.js', fileName: 'Other.js', loc: { line: 5, col: 1 } },
          {
            filePath: 'src/components/Another.js',
            fileName: 'Another.js',
            loc: { line: 10, col: 1 },
          },
        ],
      },
    ];
    vi.mocked(findNavigationTargets).mockReturnValue(mockTargets);

    const highlightedHtml =
      'export <span class="navLink" data-nav-target="true" data-nav-idx="0">MyComponent</span>';

    const { container } = render(
      <CodeEditor {...defaultProps} highlightedCode={highlightedHtml} />,
    );

    const link = screen.getByText('MyComponent');

    // Mock client rect functions for positioning calculation
    link.getBoundingClientRect = () => ({
      left: 100,
      top: 150,
      width: 80,
      height: 20,
    });

    const textarea = container.querySelector('textarea');
    textarea.getBoundingClientRect = () => ({
      left: 50,
      top: 100,
      width: 500,
      height: 400,
    });

    // Inspect mode activates nav links directly
    fireEvent.click(link);

    // Verify popup content
    expect(screen.getByText('Referenced in')).toBeDefined();
    expect(screen.getByText('Other.js')).toBeDefined();
    expect(screen.getByText(':5')).toBeDefined();
    expect(screen.getByText('Another.js')).toBeDefined();
    expect(screen.getByText(':10')).toBeDefined();
  });

  it('shows correct popup header for import type targets on click', () => {
    const mockTargets = [
      {
        type: 'import',
        name: './Button',
        start: 7,
        end: 18,
        targets: [
          { filePath: 'src/components/Button.js', fileName: 'Button.js', loc: { line: 1, col: 1 } },
          {
            filePath: 'src/components/Button.css',
            fileName: 'Button.css',
            loc: { line: 1, col: 1 },
          },
        ],
      },
    ];
    vi.mocked(findNavigationTargets).mockReturnValue(mockTargets);

    const highlightedHtml =
      'import <span class="navLink" data-nav-target="true" data-nav-idx="0">./Button</span>';

    const { container } = render(
      <CodeEditor {...defaultProps} highlightedCode={highlightedHtml} />,
    );

    const link = screen.getByText('./Button');
    link.getBoundingClientRect = () => ({ left: 100, top: 150, width: 80, height: 20 });
    const textarea = container.querySelector('textarea');
    textarea.getBoundingClientRect = () => ({ left: 50, top: 100, width: 500, height: 400 });

    fireEvent.click(link);

    expect(screen.getByText('Open Import')).toBeDefined();
    expect(screen.getByText('Button.js')).toBeDefined();
    expect(screen.getByText('Button.css')).toBeDefined();
  });

  it('shows correct popup header for component type targets on click', () => {
    const mockTargets = [
      {
        type: 'component',
        name: 'Button',
        start: 7,
        end: 18,
        targets: [
          { filePath: 'src/components/Button.js', fileName: 'Button.js', loc: { line: 2, col: 1 } },
          {
            filePath: 'src/components/Button.tsx',
            fileName: 'Button.tsx',
            loc: { line: 2, col: 1 },
          },
        ],
      },
    ];
    vi.mocked(findNavigationTargets).mockReturnValue(mockTargets);

    const highlightedHtml =
      '<span class="navLink" data-nav-target="true" data-nav-idx="0">Button</span>';

    const { container } = render(
      <CodeEditor {...defaultProps} highlightedCode={highlightedHtml} />,
    );

    const link = screen.getByText('Button');
    link.getBoundingClientRect = () => ({ left: 100, top: 150, width: 80, height: 20 });
    const textarea = container.querySelector('textarea');
    textarea.getBoundingClientRect = () => ({ left: 50, top: 100, width: 500, height: 400 });

    fireEvent.click(link);

    expect(screen.getByText('Component Definition')).toBeDefined();
    expect(screen.getByText('Button.js')).toBeDefined();
    expect(screen.getByText('Button.tsx')).toBeDefined();
  });

  it('calls onJumpToTarget when popup target item is clicked', () => {
    const onJumpToTarget = vi.fn();
    const mockTargets = [
      {
        type: 'export',
        name: 'MyComponent',
        start: 7,
        end: 18,
        targets: [
          { filePath: 'src/components/Other.js', fileName: 'Other.js', loc: { line: 5, col: 2 } },
          { filePath: 'src/components/Extra.js', fileName: 'Extra.js', loc: { line: 15, col: 2 } },
        ],
      },
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
    link.getBoundingClientRect = () => ({ left: 100, top: 150, width: 80, height: 20 });
    const textarea = container.querySelector('textarea');
    textarea.getBoundingClientRect = () => ({ left: 50, top: 100, width: 500, height: 400 });

    fireEvent.click(link);

    const popupItem = screen.getByText('Other.js');
    fireEvent.click(popupItem);

    expect(onJumpToTarget).toHaveBeenCalledWith('src/components/Other.js', { line: 5, col: 2 });
  });

  it('jumps directly to target on click if there is only one target (bypassing popup)', () => {
    const onJumpToTarget = vi.fn();
    const mockTargets = [
      {
        type: 'export',
        name: 'MyComponent',
        start: 7,
        end: 18,
        targets: [
          { filePath: 'src/components/Other.js', fileName: 'Other.js', loc: { line: 5, col: 2 } },
        ],
      },
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
    link.getBoundingClientRect = () => ({ left: 100, top: 150, width: 80, height: 20 });
    const textarea = container.querySelector('textarea');
    textarea.getBoundingClientRect = () => ({ left: 50, top: 100, width: 500, height: 400 });

    fireEvent.click(link);

    // Verify popup is NOT visible
    expect(screen.queryByText('Referenced in')).toBeNull();

    // Verify it jumped immediately
    expect(onJumpToTarget).toHaveBeenCalledWith('src/components/Other.js', { line: 5, col: 2 });
  });

  it('activates nav links in edit mode when Command is held', () => {
    const onJumpToTarget = vi.fn();
    const mockTargets = [
      {
        type: 'export',
        name: 'MyComponent',
        start: 7,
        end: 18,
        targets: [
          { filePath: 'src/components/Other.js', fileName: 'Other.js', loc: { line: 5, col: 2 } },
        ],
      },
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

    expect(onJumpToTarget).toHaveBeenCalledWith('src/components/Other.js', { line: 5, col: 2 });
  });

  it('does not activate nav links in edit mode without the Command key', () => {
    const onJumpToTarget = vi.fn();
    const mockTargets = [
      {
        type: 'export',
        name: 'MyComponent',
        start: 7,
        end: 18,
        targets: [
          { filePath: 'src/components/Other.js', fileName: 'Other.js', loc: { line: 5, col: 2 } },
        ],
      },
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

    const textarea = screen.getByRole('textbox');
    textarea.setSelectionRange(0, textarea.value.length);
    fireEvent.copy(textarea, {
      clipboardData: { setData },
    });

    expect(onCopySelection).toHaveBeenCalledWith('visible folded text', 0, 19);
    expect(setData).toHaveBeenCalledWith('text/plain', 'full folded text');
  });
});
