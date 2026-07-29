import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PreviewHostFallbackPage from './page';

vi.mock('@/components/App/PreviewHost/PreviewHost', () => ({
  default: () => <div data-testid="preview-host-fallback-mock" />,
}));

describe('PreviewHostFallbackPage', () => {
  it('renders PreviewHost component', () => {
    const { getByTestId } = render(<PreviewHostFallbackPage />);
    expect(getByTestId('preview-host-fallback-mock')).toBeDefined();
  });
});
