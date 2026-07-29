import { describe, expect, it } from 'vitest';
import { getDefaultFileViewType, getFileViewByType, getFileViews } from './fileViews';

describe('fileViews', () => {
  it('returns file views for SVG, media, and normal code files', () => {
    expect(getFileViews('icon.svg')).toHaveLength(3);
    expect(getFileViews('photo.png')).toHaveLength(1);
    expect(getFileViews('index.js')).toHaveLength(2);
  });

  it('gets default file view type', () => {
    expect(getDefaultFileViewType('icon.svg')).toBe('editor');
    expect(getDefaultFileViewType('photo.png')).toBe('image-viewer');
    expect(getDefaultFileViewType('index.js')).toBe('editor');
  });

  it('gets file view by type with fallback for unmatched types', () => {
    expect(getFileViewByType('icon.svg', 'image-viewer').id).toBe('image-viewer');
    expect(getFileViewByType('index.js', 'invalid-type' as 'editor').id).toBe('editor');
  });
});
