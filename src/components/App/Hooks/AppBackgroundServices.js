import { useNotification } from '@/components/Widgets/Notification/Notification';
import { useContentSaver } from './ContentSaver';
import { useKeyboardHandler } from './KeyboardHandler';
import { usePreviewRestorer } from './PreviewRestorer';
import { useTabRestorer } from './TabRestorer';

export function useAppBackgroundServices() {
  useTabRestorer();
  usePreviewRestorer();
  useContentSaver();
  useKeyboardHandler();
  // Notification is handled by its own provider/hook, but we can ensure it's initialized if needed.
}
