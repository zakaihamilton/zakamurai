import { useEffect } from 'react';
import { createState } from 'triactor';
import { LogState } from '@/components/App/Views/LogArea';
import { getProjectTemplates } from '@/components/Storage/InitialData';
import ContextMenu from '@/components/ui/ContextMenu';
import Dialog from '@/components/ui/Dialog';
import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import type { TopBarMenuStateShape } from '@/types/domain-types';
import { formatShortcut } from '@/utils/os';
import { requireStore } from '../../../types';
import type { TopBarMenuProps } from '../topbar-types';
import styles from './Menu.module.css';

const TopBarMenuState = createState<TopBarMenuStateShape>('TopBarMenuState');

export default function TopBarMenu({
  onExportZip,
  onShareProject,
  onExportCompiledZip,
  onNewProject,
  onOpenProjectLibrary,
  projectActionRequest,
  onConsumeProjectActionRequest,
  onClearFS,
  onToggleShortcuts,
}: TopBarMenuProps) {
  const { isSystemProcessing, isAIProcessing } = requireStore(
    LogState.useState(['isSystemProcessing', 'isAIProcessing']),
  );
  const topBarMenuState = requireStore(
    TopBarMenuState.useState(null, {
      menuPosition: null,
      confirmNewProject: false,
      selectedTemplateId: 'counter',
    }),
  );
  const {
    menuPosition = null,
    confirmNewProject = false,
    selectedTemplateId = 'counter',
  } = topBarMenuState || {};

  useEffect(() => {
    if (!projectActionRequest) return;
    if (projectActionRequest.type === 'template') {
      topBarMenuState((draft) => {
        draft.selectedTemplateId = projectActionRequest.templateId;
        draft.confirmNewProject = true;
      });
    } else {
      onOpenProjectLibrary?.();
    }
    onConsumeProjectActionRequest?.();
  }, [onConsumeProjectActionRequest, onOpenProjectLibrary, projectActionRequest, topBarMenuState]);

  const handleMenuOpen = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    topBarMenuState((draft) => {
      draft.menuPosition = {
        x: rect.right - 220,
        y: rect.bottom + 8,
      };
    });
  };

  const handleMenuClose = () => {
    topBarMenuState((draft) => {
      draft.menuPosition = null;
    });
  };

  const isProcessing = isSystemProcessing || isAIProcessing;

  return (
    <>
      <Tooltip content="More actions">
        <button
          type="button"
          className={`${styles.actionBtn} ${menuPosition ? styles.activeAction : ''}`}
          onClick={handleMenuOpen}
          aria-label="More actions"
          data-testid="more-actions-btn"
        >
          <Icons.MoreVertical />
        </button>
      </Tooltip>
      <ContextMenu position={menuPosition} onClose={handleMenuClose}>
        <button
          type="button"
          className={styles.menuItem}
          disabled={isProcessing}
          onClick={() => {
            topBarMenuState((draft) => {
              draft.confirmNewProject = true;
            });
            handleMenuClose();
          }}
        >
          <Icons.FilePlus />
          <span>New Project</span>
        </button>

        <button
          type="button"
          className={styles.menuItem}
          disabled={isProcessing}
          onClick={() => {
            onOpenProjectLibrary?.();
            handleMenuClose();
          }}
        >
          {Icons.Folder && <Icons.Folder />}
          <span>Saved projects</span>
        </button>

        <div className={styles.menuSeparator} />

        <button
          type="button"
          className={styles.menuItem}
          onClick={() => {
            (onShareProject || onExportZip)();
            handleMenuClose();
          }}
        >
          <Icons.Download />
          <span>Export ZIP</span>
        </button>
        <button
          type="button"
          className={styles.menuItem}
          onClick={() => {
            onExportCompiledZip();
            handleMenuClose();
          }}
        >
          <Icons.Download />
          <span>Export compiled files</span>
        </button>

        <div className={styles.menuSeparator} />

        <button
          type="button"
          className={styles.menuItem}
          disabled={isProcessing}
          onClick={() => {
            onClearFS();
            handleMenuClose();
          }}
        >
          <Icons.Trash />
          <span>Clear FS</span>
        </button>

        <div className={styles.menuSeparator} />

        <button
          type="button"
          className={styles.menuItem}
          onClick={() => {
            onToggleShortcuts();
            handleMenuClose();
          }}
        >
          <Icons.Info />
          <span>Keyboard Shortcuts</span>
          <span className={styles.menuShortcut}>{formatShortcut('⌃⇧K')}</span>
        </button>
      </ContextMenu>
      <Dialog
        isOpen={confirmNewProject}
        title="Start a new project?"
        message="Choose a starter. Your current browser workspace will be replaced; save it to Saved projects first if you want to keep a separate copy."
        onConfirm={() => {
          topBarMenuState((draft) => {
            draft.confirmNewProject = false;
          });
          void onNewProject(selectedTemplateId);
        }}
        onCancel={() =>
          topBarMenuState((draft) => {
            draft.confirmNewProject = false;
          })
        }
        confirmText="Create project"
        cancelText="Cancel"
      >
        <div className={styles.templateDialogContent}>
          <p>
            Choose a starter. Your current browser workspace will be replaced. Save it to Saved
            projects first if you want to keep a separate copy.
          </p>
          <label htmlFor="new-project-template">Starter template</label>
          <select
            id="new-project-template"
            value={selectedTemplateId}
            onChange={(event) =>
              topBarMenuState((draft) => {
                draft.selectedTemplateId = event.target.value;
              })
            }
          >
            {getProjectTemplates().map((template) => (
              <option value={template.id} key={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          <p className={styles.templateDescription}>
            {
              getProjectTemplates().find((template) => template.id === selectedTemplateId)
                ?.description
            }
          </p>
        </div>
      </Dialog>
    </>
  );
}
