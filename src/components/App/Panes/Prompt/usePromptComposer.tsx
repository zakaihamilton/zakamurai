import type { ExtendedEditorState } from '@/components/App/Views/EditorArea/types';
import type { StateStore } from '@/components/state/types';
import type {
  PromptUiStateShape,
  SidebarStateShape,
  TabStateShape,
  TreeNode,
} from '@/types/domain-types';
import { useCallback, useState } from 'react';
import type { ChangeEvent, FormEvent, KeyboardEvent, MouseEvent } from 'react';
import { parseFileCommand } from './filePrompt';

type PromptEvent = FormEvent<HTMLFormElement> | KeyboardEvent<HTMLTextAreaElement>;

type PromptSend = (
  event: FormEvent<HTMLFormElement> | null,
  text?: string,
  scope?: string,
  isWelcomePrompt?: boolean,
) => void;

type PromptComposerParams = {
  promptUiState: StateStore<PromptUiStateShape>;
  editorState: StateStore<ExtendedEditorState>;
  tabState: StateStore<TabStateShape>;
  sidebarState: StateStore<SidebarStateShape>;
  historyIndex: number;
  fileScopeArmed: boolean;
  setFileScopeArmed: (value: boolean) => void;
  filePromptRemainder: string;
  setFilePromptRemainder: (value: string) => void;
  send: PromptSend;
  handleStop: (event: MouseEvent<HTMLButtonElement>) => void;
  handleArrowUp: () => void;
  handleArrowDown: () => void;
};

export type PromptComposerController = {
  isFilePickerOpen: boolean;
  filePickerQuery: string;
  fileScopeArmed: boolean;
  files: string[];
  handleKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  handleChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (event: PromptEvent) => void;
  handleFileSelect: (filePath: string) => void;
  handleFilePickerCancel: () => void;
  setFilePickerQuery: (value: string) => void;
};

function collectProjectFiles(nodes: TreeNode[], parentPath: string[] = []): string[] {
  return nodes.flatMap((node) => {
    const path = node.path || [...parentPath, node.name];
    return node.type === 'file' ? [path.join('/')] : collectProjectFiles(node.children || [], path);
  });
}

export default function usePromptComposer({
  promptUiState,
  editorState,
  tabState,
  sidebarState,
  historyIndex,
  fileScopeArmed,
  setFileScopeArmed,
  filePromptRemainder,
  setFilePromptRemainder,
  send,
  handleStop,
  handleArrowUp,
  handleArrowDown,
}: PromptComposerParams): PromptComposerController {
  const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
  const [filePickerQuery, setFilePickerQuery] = useState('');

  const handleSubmit = useCallback(
    (event: PromptEvent) => {
      send(event as FormEvent<HTMLFormElement>);
      setFileScopeArmed(false);
      promptUiState((draft) => {
        draft.promptScope = 'project';
      });
    },
    [promptUiState, send, setFileScopeArmed],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      const mac = navigator.platform.toUpperCase().includes('MAC');
      if ((mac ? event.metaKey : event.ctrlKey) && event.key === '.') {
        handleStop(event as unknown as MouseEvent<HTMLButtonElement>);
        return;
      }
      if (event.key === 'Enter') {
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault();
          event.stopPropagation();
          const target = event.target as HTMLTextAreaElement;
          const { selectionStart, selectionEnd, value } = target;
          const nextValue = `${value.substring(0, selectionStart)}\n${value.substring(selectionEnd)}`;
          promptUiState((draft) => {
            draft.val = nextValue;
          });
          requestAnimationFrame(() => {
            target.selectionStart = target.selectionEnd = selectionStart + 1;
          });
          return;
        }
        if (!event.shiftKey) handleSubmit(event);
      } else if (event.key === 'ArrowUp') {
        handleArrowUp();
      } else if (event.key === 'ArrowDown') {
        handleArrowDown();
      }
    },
    [handleArrowDown, handleArrowUp, handleStop, handleSubmit, promptUiState],
  );

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const nextValue = event.target.value;
      const fileCommand = parseFileCommand(nextValue);
      if (fileCommand) {
        setFilePromptRemainder(fileCommand.prompt);
        setFilePickerQuery('');
        setIsFilePickerOpen(true);
        promptUiState((draft) => {
          draft.val = fileCommand.prompt;
          if (historyIndex === -1) draft.draftVal = fileCommand.prompt;
        });
        return;
      }
      promptUiState((draft) => {
        draft.val = nextValue;
        if (historyIndex === -1) draft.draftVal = nextValue;
      });
    },
    [historyIndex, promptUiState, setFilePromptRemainder],
  );

  const handleFileSelect = useCallback(
    (filePath: string) => {
      const fileName = filePath.split('/').pop() || filePath;
      const fileContent = editorState.fileContents?.[filePath] || '';
      tabState((draft) => {
        if (!draft.openTabs.some((tab) => tab.id === filePath)) {
          draft.openTabs = [
            ...draft.openTabs,
            {
              id: filePath,
              type: 'file',
              label: fileName,
              file: { name: fileName, path: filePath.split('/'), content: fileContent },
            },
          ];
        }
        draft.activeTabId = filePath;
      });
      promptUiState((draft) => {
        draft.promptScope = 'file';
        draft.val = filePromptRemainder;
        draft.draftVal = filePromptRemainder;
      });
      setFileScopeArmed(true);
      setIsFilePickerOpen(false);
      setFilePromptRemainder('');
      setFilePickerQuery('');
    },
    [
      editorState.fileContents,
      filePromptRemainder,
      promptUiState,
      setFilePromptRemainder,
      setFileScopeArmed,
      tabState,
    ],
  );

  const handleFilePickerCancel = useCallback(() => {
    setIsFilePickerOpen(false);
    setFilePromptRemainder('');
    setFilePickerQuery('');
    setFileScopeArmed(false);
    promptUiState((draft) => {
      draft.promptScope = 'project';
    });
  }, [promptUiState, setFilePromptRemainder, setFileScopeArmed]);

  return {
    isFilePickerOpen,
    filePickerQuery,
    fileScopeArmed,
    files: [
      ...Object.keys(editorState.fileContents || {}),
      ...collectProjectFiles(sidebarState.folderTree || []),
    ],
    handleKeyDown,
    handleChange,
    handleSubmit,
    handleFileSelect,
    handleFilePickerCancel,
    setFilePickerQuery,
  };
}
