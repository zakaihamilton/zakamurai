import { isMediaFile, isSvgFile } from './file';

export const FILE_VIEW_TYPES = {
  EDITOR: 'editor',
  IMAGE_VIEWER: 'image-viewer',
  TOKEN_BREAKDOWN: 'token-breakdown',
} as const;

export type FileViewType = (typeof FILE_VIEW_TYPES)[keyof typeof FILE_VIEW_TYPES];

export type FileView = {
  id: FileViewType;
  label: string;
  icon: string;
};

export const FILE_VIEWS: Record<FileViewType, FileView> = {
  [FILE_VIEW_TYPES.EDITOR]: {
    id: FILE_VIEW_TYPES.EDITOR,
    label: 'Editor',
    icon: 'Code',
  },
  [FILE_VIEW_TYPES.IMAGE_VIEWER]: {
    id: FILE_VIEW_TYPES.IMAGE_VIEWER,
    label: 'Image Viewer',
    icon: 'Image',
  },
  [FILE_VIEW_TYPES.TOKEN_BREAKDOWN]: {
    id: FILE_VIEW_TYPES.TOKEN_BREAKDOWN,
    label: 'Token Breakdown',
    icon: 'Tokens',
  },
};

export const getFileViews = (filename: string): FileView[] => {
  if (isSvgFile(filename)) {
    return [
      FILE_VIEWS[FILE_VIEW_TYPES.EDITOR],
      FILE_VIEWS[FILE_VIEW_TYPES.IMAGE_VIEWER],
      FILE_VIEWS[FILE_VIEW_TYPES.TOKEN_BREAKDOWN],
    ];
  }

  if (isMediaFile(filename)) {
    return [FILE_VIEWS[FILE_VIEW_TYPES.IMAGE_VIEWER]];
  }

  return [FILE_VIEWS[FILE_VIEW_TYPES.EDITOR], FILE_VIEWS[FILE_VIEW_TYPES.TOKEN_BREAKDOWN]];
};

export const getDefaultFileViewType = (filename: string): FileViewType => {
  return getFileViews(filename)[0]?.id || FILE_VIEW_TYPES.EDITOR;
};

export const getFileViewByType = (filename: string, viewType: FileViewType): FileView => {
  const views = getFileViews(filename);
  return (
    views.find((view) => view.id === viewType) || views[0] || FILE_VIEWS[FILE_VIEW_TYPES.EDITOR]
  );
};
