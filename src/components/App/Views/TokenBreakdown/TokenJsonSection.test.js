import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TokenJsonSection from './TokenJsonSection';

describe('TokenJsonSection', () => {
  it('renders JSON report', () => {
    const report = { languageMode: 'javascript', tokens: [], lineCount: 1 };
    render(<TokenJsonSection report={report} />);

    expect(screen.getByText('Raw JSON')).toBeDefined();
    expect(screen.getByText('full report')).toBeDefined();
    expect(screen.getByText(/"languageMode": "javascript"/)).toBeDefined();
  });
});
