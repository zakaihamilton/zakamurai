import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PreviewHostPage from './page';

vi.mock('@/components/App/PreviewHost/PreviewHost', () => ({
  default: () => <div data-testid="preview-host-mock" />,
}));

describe('PreviewHostPage', () => {
  it('renders PreviewHost component', () => {
    const { getByTestId } = render(<PreviewHostPage />);
    expect(getByTestId('preview-host-mock')).toBeDefined();
  });
});
