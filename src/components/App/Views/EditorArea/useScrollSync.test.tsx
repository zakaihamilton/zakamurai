import { fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';
import useScrollSync from './useScrollSync';

function ScrollSyncHarness({ content = 'test' }) {
  const containerRef = useRef(null);
  const textareaRef = useRef(null);
  useScrollSync(containerRef, textareaRef, content);

  return (
    <div>
      <div ref={containerRef} data-testid="container" style={{ overflow: 'auto', width: 200 }}>
        <div style={{ width: 1000 }}>wide content</div>
      </div>
      <textarea ref={textareaRef} data-testid="textarea" style={{ width: 200 }} defaultValue="" />
    </div>
  );
}

describe('useScrollSync', () => {
  it('syncs container scroll to textarea', () => {
    const { getByTestId } = render(<ScrollSyncHarness />);
    const container = getByTestId('container');
    const textarea = getByTestId('textarea');

    Object.defineProperty(container, 'scrollLeft', {
      value: 0,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(textarea, 'scrollLeft', { value: 0, writable: true, configurable: true });

    container.scrollLeft = 50;
    fireEvent.scroll(container);

    expect(textarea.scrollLeft).toBe(50);
  });

  it('syncs textarea scroll to container', () => {
    const { getByTestId } = render(<ScrollSyncHarness />);
    const container = getByTestId('container');
    const textarea = getByTestId('textarea');

    Object.defineProperty(container, 'scrollLeft', {
      value: 0,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(textarea, 'scrollLeft', { value: 0, writable: true, configurable: true });

    textarea.scrollLeft = 75;
    fireEvent.scroll(textarea);

    expect(container.scrollLeft).toBe(75);
  });
});
