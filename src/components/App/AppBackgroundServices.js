import { useKeyboardHandler } from '@/components/App/Manager/KeyboardHandler';
import { useTabRestorer } from '@/components/App/Panes/TabBar/TabRestorer';
import { usePreviewRestorer } from '@/components/App/Views/PreviewArea/PreviewRestorer';
import { useContentSaver } from '@/components/Storage/ContentSaver';
import { useOfflineSupport } from './OfflineSupport';

export function useAppBackgroundServices() {
  useOfflineSupport();
  useTabRestorer();
  usePreviewRestorer();
  useContentSaver();
  useKeyboardHandler();
}
