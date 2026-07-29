import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Icons } from './Icons';

describe('Icons', () => {
  it('renders every icon component with its supported display props', () => {
    const entries = Object.entries(Icons);
    const { container } = render(
      <div>
        {entries.map(([name, Icon]) => (
          <span data-icon={name} key={name}>
            <Icon size={20} open />
          </span>
        ))}
      </div>,
    );

    expect(entries.length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-icon]')).toHaveLength(entries.length);
    expect(container.querySelectorAll('svg')).toHaveLength(entries.length - 1);
  });

  it('renders closed folders and default-sized file icons', () => {
    const { container } = render(
      <>
        <Icons.Folder open={false} />
        <Icons.File />
      </>,
    );

    expect(container.querySelectorAll('svg')).toHaveLength(2);
    expect(container.querySelector('svg')).toHaveAttribute('stroke', 'currentColor');
  });
});
