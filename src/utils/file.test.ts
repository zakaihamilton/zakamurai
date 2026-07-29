import { describe, expect, it } from 'vitest';
import { isMediaFile, isSvgFile } from './file';

describe('file utils', () => {
  describe('isMediaFile', () => {
    it('returns false for null, undefined, and empty strings', () => {
      expect(isMediaFile(null)).toBe(false);
      expect(isMediaFile(undefined)).toBe(false);
      expect(isMediaFile('')).toBe(false);
    });

    it('returns false when filename has no extension', () => {
      expect(isMediaFile('README')).toBe(false);
      expect(isMediaFile('noext')).toBe(false);
    });

    it.each(['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'webm', 'mp4', 'ogg', 'avif', 'bmp'])(
      'returns true for .%s files',
      (ext) => {
        expect(isMediaFile(`photo.${ext}`)).toBe(true);
        expect(isMediaFile(`assets/IMAGE.${ext.toUpperCase()}`)).toBe(true);
      },
    );

    it('returns false for non-media extensions', () => {
      expect(isMediaFile('index.js')).toBe(false);
      expect(isMediaFile('icon.svg')).toBe(false);
      expect(isMediaFile('archive.zip')).toBe(false);
    });
  });

  describe('isSvgFile', () => {
    it('returns false for null, undefined, and empty strings', () => {
      expect(isSvgFile(null)).toBe(false);
      expect(isSvgFile(undefined)).toBe(false);
      expect(isSvgFile('')).toBe(false);
    });

    it('returns true only for .svg files', () => {
      expect(isSvgFile('icon.svg')).toBe(true);
      expect(isSvgFile('assets/Logo.SVG')).toBe(true);
    });

    it('returns false for other extensions', () => {
      expect(isSvgFile('photo.png')).toBe(false);
      expect(isSvgFile('index.js')).toBe(false);
      expect(isSvgFile('noext')).toBe(false);
    });
  });
});
