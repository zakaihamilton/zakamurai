import { WEB_LLM_MODELS } from '@/components/AI/WebLLMModels';
import { describe, expect, it } from 'vitest';
import { COLUMNS, detailValue, formatSize, modelValues } from './modelUtils';

describe('modelUtils', () => {
  const model = WEB_LLM_MODELS.find((entry) => entry.recommended) || WEB_LLM_MODELS[0];

  it('reads detail values and formats sizes', () => {
    expect(detailValue(model, 'Best for')).toBeTruthy();
    expect(detailValue(model, 'Missing')).toBe('');
    expect(detailValue({}, 'Best for')).toBe('');
    expect(formatSize(500)).toContain('MB');
    expect(formatSize(1500)).toContain('GB');
    expect(formatSize(1000)).toContain('GB');
    expect(COLUMNS).toHaveLength(5);
  });

  it('builds searchable model values with status badges', () => {
    const values = modelValues(model, model.id, [model.id]);
    expect(values.status).toContain('Selected');
    expect(values.status).toContain('Cached');
    if (model.recommended) expect(values.status).toContain('Recommended');
    expect(values.model).toContain(model.name);
    expect(values.searchText).toContain(model.requirement);

    const plain = modelValues({ ...model, recommended: false, details: undefined }, 'other-id', []);
    expect(plain.status).toBe('');
    expect(plain.searchText.trim()).toBe(model.requirement || '');
  });
});
