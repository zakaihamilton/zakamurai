import type { CSSProperties } from 'react';

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      id?: string;
      mode?: 'read' | 'readwrite';
      startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
    }) => Promise<FileSystemDirectoryHandle>;
  }

  interface FileSystemDirectoryHandle {
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
    queryPermission(
      descriptor?: FileSystemHandlePermissionDescriptor,
    ): Promise<PermissionState>;
  }

  interface FileSystemHandle {
    move?(destination: FileSystemDirectoryHandle, name?: string): Promise<void>;
  }

  interface Performance {
    measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>;
  }
}

declare module 'react' {
  interface CSSProperties {
    '--menu-top'?: string;
    '--menu-left'?: string;
    '--tooltip-top'?: string;
    '--tooltip-left'?: string;
    '--arrow-offset'?: string;
    '--tooltip-max-width'?: string;
    '--tooltip-max-height'?: string;
    '--logo-size'?: string;
    '--logo-radius'?: string;
    '--logo-font-size'?: string;
  }
}

export type CssVarStyle = CSSProperties;
