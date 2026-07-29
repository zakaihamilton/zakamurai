import type { FileViewType } from '@/utils/fileViews';

export type FileViewToolbarProps = {
  fileName: string;
  activeViewType: FileViewType | string;
  onSelectView: (viewType: FileViewType) => void;
};
