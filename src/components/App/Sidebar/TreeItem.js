import { AppState } from '@/components/App/AppState';
import { EditorState } from '@/components/App/EditorArea';
import { SidebarState } from '@/components/App/Sidebar';
import { TabState } from '@/components/App/TabBar';
import { Icons } from '@/components/Core/Base/Icons';
import ContextMenu from '@/components/Widgets/ContextMenu/ContextMenu';
import Dialog from '@/components/Widgets/Dialog/Dialog';
import { useNotification } from '@/components/Widgets/Notification/Notification';
import Tooltip from '@/components/Widgets/Tooltip/Tooltip';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import styles from './TreeItem.module.css';

const treeSorter = (a, b) => {
  const aType = a.type || (a.kind === 'directory' ? 'folder' : 'file');
  const bType = b.type || (b.kind === 'directory' ? 'folder' : 'file');

  if (aType === bType) {
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  }
  return aType === 'folder' ? -1 : 1;
};

export default function TreeItem({
  item,
  level = 0,
  filterText = '',
  fsHandle = null,
  parentHandle = null,
  onRename = null,
}) {
  const appState = AppState.useState();
  const { fs } = appState;
  const sidebarState = SidebarState.useState();
  const { expandedFolders = {} } = sidebarState;
  const tabState = TabState.useState();
  const { activeTabId } = tabState;
  const editorState = EditorState.useState();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(item.name);
  const [isCreating, setIsCreating] = useState(null); // 'file' or 'folder'
  const [createValue, setCreateValue] = useState('');
  const [contextMenu, setContextMenu] = useState(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const editInputRef = useRef(null);
  const createInputRef = useRef(null);
  const { addNotification } = useNotification();

  const currentPathStr = item.path.join('/');
  // Force expansion if we are actively filtering, otherwise use standard state
  const isExpanded = filterText ? true : expandedFolders[currentPathStr] !== false;
  const isActive = activeTabId === currentPathStr;

  const [children, setChildren] = useState(() => {
    if (item.children) {
      return [...item.children].sort(treeSorter).map((child) => ({
        ...child,
        path: [...item.path, child.name],
      }));
    }
    return [];
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);

  // Delay spinner to prevent flashing on fast loads
  useEffect(() => {
    let timeout;
    if (isLoading) {
      timeout = setTimeout(() => setShowSpinner(true), 1000);
    } else {
      setShowSpinner(false);
    }
    return () => clearTimeout(timeout);
  }, [isLoading]);

  // Sync children state from props for mock mode
  useEffect(() => {
    if (item.children && fs.mode !== 'local') {
      setChildren(
        [...item.children].sort(treeSorter).map((child) => ({
          ...child,
          path: [...item.path, child.name],
        })),
      );
    }
  }, [item.children, item.path, fs.mode]);

  const loadLocalChildren = useCallback(
    async (force = false) => {
      if (!fsHandle || item.type !== 'folder') return;
      if (!force && children.length > 0) return;
      setIsLoading(true);
      try {
        const entries = [];
        for await (const [name, handle] of fsHandle.entries()) {
          entries.push({
            name,
            kind: handle.kind,
            handle,
            type: handle.kind === 'directory' ? 'folder' : 'file',
            path: [...item.path, name],
          });
        }
        entries.sort(treeSorter);
        setChildren(entries);
      } catch (err) {
        console.error('Failed to load sub-directory:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [fsHandle, item.type, item.path, children.length],
  );

  useEffect(() => {
    if (isExpanded && fs.mode === 'local' && fsHandle) {
      loadLocalChildren(true);
    }
  }, [isExpanded, fs.mode, fsHandle, loadLocalChildren]);

  const handleToggle = () => {
    if (isEditing) return; // Prevent toggle when clicking to edit
    if (item.type === 'folder') {
      if (!isExpanded && fs.mode === 'local') {
        loadLocalChildren();
      }
      sidebarState((draft) => {
        const current = draft.expandedFolders[currentPathStr] !== false;
        draft.expandedFolders = {
          ...draft.expandedFolders,
          [currentPathStr]: !current,
        };
      });
    } else {
      const openFile = async () => {
        let content = '';
        if (fs.mode === 'local' && fsHandle) {
          content = await fs.readFile(fsHandle);
        }

        tabState((draft) => {
          const existingTab = draft.openTabs.find((t) => t.id === currentPathStr);
          if (!existingTab) {
            draft.openTabs = [
              ...draft.openTabs,
              { id: currentPathStr, type: 'file', label: item.name, file: item, fsHandle },
            ];
          }
          draft.activeTabId = currentPathStr;
        });

        if (content) {
          editorState((draft) => {
            if (!draft.fileContents) draft.fileContents = {};
            draft.fileContents[currentPathStr] = content;
          });
        }
      };
      openFile();

      // Auto-expand parent folders
      sidebarState((draft) => {
        const newExpanded = { ...draft.expandedFolders };
        let runningPath = '';
        for (const seg of item.path.slice(0, -1)) {
          runningPath = runningPath ? `${runningPath}/${seg}` : seg;
          newExpanded[runningPath] = true;
        }
        draft.expandedFolders = newExpanded;
      });
    }
  };

  const handleDoubleClick = (e) => {
    e.stopPropagation();
    setIsEditing(true);
    setEditValue(item.name);
  };

  const handleRenameSubmit = async () => {
    if (editValue.trim() && editValue !== item.name) {
      if (onRename) {
        onRename(editValue.trim());
        setIsEditing(false);
        return;
      }

      const oldPathStr = item.path.join('/');
      const newPathArr = [...item.path];
      newPathArr[newPathArr.length - 1] = editValue;
      const newPathStr = newPathArr.join('/');

      if (fs.mode === 'local' && fsHandle) {
        try {
          // Check if move is supported
          if (fsHandle.move) {
            await fsHandle.move(editValue);
          } else {
            // Fallback for older browsers (unlikely in this context but safe)
            throw new Error('Rename (move) not supported by this browser/handle.');
          }
          fs.triggerRefresh();
        } catch (err) {
          console.error('Failed to rename local file:', err);
          return; // Don't update state if FS rename failed
        }
      }

      sidebarState((draft) => {
        let currentLevel = draft.folderTree;
        let targetNode = null;

        // Traverse the tree to find the exact node
        for (let i = 0; i < item.path.length; i++) {
          const seg = item.path[i];
          const node = currentLevel.find((n) => n.name === seg);
          if (!node) break;
          if (i === item.path.length - 1) {
            targetNode = node;
          } else {
            currentLevel = node.children;
          }
        }

        if (targetNode) {
          targetNode.name = editValue;

          // Replace old path prefix in expandedFolders
          const newExpanded = {};
          for (const key in draft.expandedFolders) {
            if (key === oldPathStr || key.startsWith(`${oldPathStr}/`)) {
              const newKey = newPathStr + key.substring(oldPathStr.length);
              newExpanded[newKey] = draft.expandedFolders[key];
            } else {
              newExpanded[key] = draft.expandedFolders[key];
            }
          }
          draft.expandedFolders = newExpanded;
        }
      });

      // Update file contents
      editorState((draft) => {
        if (draft.fileContents) {
          const newContents = {};
          for (const key in draft.fileContents) {
            if (key === oldPathStr || key.startsWith(`${oldPathStr}/`)) {
              const newKey = newPathStr + key.substring(oldPathStr.length);
              newContents[newKey] = draft.fileContents[key];
            } else {
              newContents[key] = draft.fileContents[key];
            }
          }
          draft.fileContents = newContents;
        }
      });

      // Update tabs
      tabState((draft) => {
        for (const t of draft.openTabs) {
          if (t.id === oldPathStr || t.id.startsWith(`${oldPathStr}/`)) {
            const newId = newPathStr + t.id.substring(oldPathStr.length);
            t.id = newId;
            if (t.id === newPathStr) t.label = editValue; // Active file got directly renamed
            if (t.file?.path) {
              const newFilePath = [...t.file.path];
              for (let i = 0; i < item.path.length; i++) {
                newFilePath[i] = newPathArr[i];
              }
              t.file.path = newFilePath;
              t.file.name = newFilePath[newFilePath.length - 1];
            }
          }
        }

        // Redirect active tab if it's the one that moved
        if (draft.activeTabId === oldPathStr || draft.activeTabId?.startsWith(`${oldPathStr}/`)) {
          draft.activeTabId = newPathStr + draft.activeTabId.substring(oldPathStr.length);
        }
      });
    }
    addNotification(`Renamed to "${editValue}"`, 'success');
    setIsEditing(false);
  };

  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [isEditing]);

  const handleCreateSubmit = async () => {
    if (!createValue.trim()) {
      setIsCreating(null);
      return;
    }

    if (fs.mode === 'local' && fsHandle) {
      try {
        if (isCreating === 'file') {
          const newFileHandle = await fsHandle.getFileHandle(createValue, { create: true });
          const writable = await newFileHandle.createWritable();
          await writable.close();

          const newPathStr = [...item.path, createValue].join('/');
          const newFileItem = {
            name: createValue,
            path: [...item.path, createValue],
            type: 'file',
          };

          tabState((draft) => {
            if (!draft.openTabs.find((t) => t.id === newPathStr)) {
              draft.openTabs.push({
                id: newPathStr,
                type: 'file',
                label: createValue,
                file: newFileItem,
                fsHandle: newFileHandle,
              });
            }
            draft.activeTabId = newPathStr;
          });

          editorState((draft) => {
            if (!draft.fileContents) draft.fileContents = {};
            draft.fileContents[newPathStr] = '';
          });
        } else {
          await fsHandle.getDirectoryHandle(createValue, { create: true });
        }
        await loadLocalChildren(true);
        if (!isExpanded) handleToggle();
        fs.triggerRefresh();
      } catch (err) {
        console.error('Failed to create:', err);
      }
    } else {
      // Mock mode creation
      sidebarState((draft) => {
        let currentLevel = draft.folderTree;
        for (const seg of item.path) {
          const node = currentLevel.find((n) => n.name === seg);
          if (node) {
            if (!node.children) node.children = [];
            currentLevel = node.children;
          }
        }
        currentLevel.push({
          name: createValue,
          type: isCreating === 'folder' ? 'folder' : 'file',
          children: isCreating === 'folder' ? [] : undefined,
        });
      });
      if (!isExpanded) handleToggle();
      addNotification(
        `${isCreating === 'folder' ? 'Folder' : 'File'} "${createValue}" created`,
        'success',
      );
    }
    setIsCreating(null);
    setCreateValue('');
  };

  useEffect(() => {
    if (isCreating && createInputRef.current) {
      createInputRef.current.focus();
    }
  }, [isCreating]);

  const handleDelete = () => {
    setShowDeleteDialog(true);
    setContextMenu(null);
  };

  const confirmDelete = async () => {
    const deletedPathStr = item.path.join('/');

    if (fs.mode === 'local' && parentHandle) {
      try {
        await parentHandle.removeEntry(item.name, { recursive: true });
        fs.triggerRefresh();
      } catch (err) {
        console.error('Failed to delete:', err);
      }
    } else {
      sidebarState((draft) => {
        const parentPath = item.path.slice(0, -1);
        let currentLevel = draft.folderTree;
        for (const seg of parentPath) {
          const node = currentLevel.find((n) => n.name === seg);
          if (node) currentLevel = node.children;
        }
        const index = currentLevel.findIndex((n) => n.name === item.name);
        if (index !== -1) currentLevel.splice(index, 1);
      });
    }

    // Close tab(s) associated with deleted item (handles both files and folders)
    tabState((draft) => {
      const tabsToDelete = draft.openTabs.filter(
        (t) => t.id === deletedPathStr || t.id.startsWith(`${deletedPathStr}/`),
      );
      if (tabsToDelete.length > 0) {
        draft.openTabs = draft.openTabs.filter((t) => !tabsToDelete.includes(t));
        // If active tab was deleted, switch to another tab or null
        if (tabsToDelete.some((t) => t.id === draft.activeTabId)) {
          draft.activeTabId =
            draft.openTabs.length > 0 ? draft.openTabs[draft.openTabs.length - 1].id : null;
        }
      }
    });

    // Remove from editor contents
    editorState((draft) => {
      if (draft.fileContents) {
        for (const key in draft.fileContents) {
          if (key === deletedPathStr || key.startsWith(`${deletedPathStr}/`)) {
            delete draft.fileContents[key];
          }
        }
      }
    });

    addNotification(`"${item.name}" deleted`, 'info');
    setShowDeleteDialog(false);
  };

  const onContextMenu = (e) => {
    if (isEditing) return;
    e.preventDefault();
    setContextMenu({ x: e.pageX, y: e.pageY });
  };

  const handleDragStart = (e) => {
    if (isEditing) {
      e.preventDefault();
      return;
    }
    e.stopPropagation();
    sidebarState((draft) => {
      draft.draggedItem = {
        path: item.path,
        type: item.type,
        handle: fsHandle,
        name: item.name,
      };
    });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', currentPathStr);
  };

  const handleDragOver = (e) => {
    if (item.type === 'folder') {
      const { draggedItem } = sidebarState;
      if (draggedItem) {
        const sourcePath = draggedItem.path.join('/');
        const targetPath = item.path.join('/');
        const isInvalid = sourcePath === targetPath || targetPath.startsWith(`${sourcePath}/`);
        if (!isInvalid) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }
      }
    }
  };

  const handleDragEnter = (_e) => {
    if (item.type === 'folder') {
      const { draggedItem } = sidebarState;
      if (draggedItem) {
        const sourcePath = draggedItem.path.join('/');
        const targetPath = item.path.join('/');
        const isInvalid = sourcePath === targetPath || targetPath.startsWith(`${sourcePath}/`);
        if (!isInvalid) {
          setIsDropTarget(true);
        }
      }
    }
  };

  const handleDragLeave = () => {
    setIsDropTarget(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDropTarget(false);

    const { draggedItem } = sidebarState;
    if (!draggedItem) return;

    const sourcePathStr = draggedItem.path.join('/');
    const targetPathStr = item.path.join('/');

    // Cannot drop on itself or its own children
    if (sourcePathStr === targetPathStr || targetPathStr.startsWith(`${sourcePathStr}/`)) {
      return;
    }

    if (item.type !== 'folder') return;

    const newPathArr = [...item.path, draggedItem.name];
    const newPathStr = newPathArr.join('/');

    if (fs.mode === 'local' && draggedItem.handle && fsHandle) {
      try {
        await fs.moveEntry(draggedItem.handle, fsHandle);
        // fs.triggerRefresh() is called inside moveEntry
      } catch (err) {
        console.error('Failed to move local item:', err);
        return;
      }
    }

    // Update Sidebar State for mock mode or to sync expanded states
    sidebarState((draft) => {
      if (fs.mode !== 'local') {
        // Find and remove from old location
        const sourceParentPath = draggedItem.path.slice(0, -1);
        let sourceLevel = draft.folderTree;
        for (const seg of sourceParentPath) {
          const node = sourceLevel.find((n) => n.name === seg);
          if (node) sourceLevel = node.children;
        }
        const sourceIdx = sourceLevel.findIndex((n) => n.name === draggedItem.name);
        let movedNode = null;
        if (sourceIdx !== -1) {
          [movedNode] = sourceLevel.splice(sourceIdx, 1);
        }

        // Find and add to new location
        let targetLevel = draft.folderTree;
        for (const seg of item.path) {
          const node = targetLevel.find((n) => n.name === seg);
          if (node) {
            if (!node.children) node.children = [];
            targetLevel = node.children;
          }
        }
        if (movedNode) {
          targetLevel.push(movedNode);
        }
      }

      // Update expanded folders
      const newExpanded = {};
      for (const key in draft.expandedFolders) {
        if (key === sourcePathStr || key.startsWith(`${sourcePathStr}/`)) {
          const newKey = newPathStr + key.substring(sourcePathStr.length);
          newExpanded[newKey] = draft.expandedFolders[key];
        } else {
          newExpanded[key] = draft.expandedFolders[key];
        }
      }
      draft.expandedFolders = newExpanded;
      draft.draggedItem = null;
    });

    // Update Editor State
    editorState((draft) => {
      if (draft.fileContents) {
        const newContents = {};
        for (const key in draft.fileContents) {
          if (key === sourcePathStr || key.startsWith(`${sourcePathStr}/`)) {
            const newKey = newPathStr + key.substring(sourcePathStr.length);
            newContents[newKey] = draft.fileContents[key];
          } else {
            newContents[key] = draft.fileContents[key];
          }
        }
        draft.fileContents = newContents;
      }
    });

    // Update Tab State
    tabState((draft) => {
      for (const t of draft.openTabs) {
        if (t.id === sourcePathStr || t.id.startsWith(`${sourcePathStr}/`)) {
          const newId = newPathStr + t.id.substring(sourcePathStr.length);
          t.id = newId;
          if (t.file?.path) {
            const movedPathArr = [...newPathArr, ...t.file.path.slice(draggedItem.path.length)];
            t.file.path = movedPathArr;
          }
        }
      }

      if (
        draft.activeTabId === sourcePathStr ||
        draft.activeTabId?.startsWith(`${sourcePathStr}/`)
      ) {
        draft.activeTabId = newPathStr + draft.activeTabId.substring(sourcePathStr.length);
      }
    });
  };

  const handleDragEnd = () => {
    sidebarState((draft) => {
      draft.draggedItem = null;
    });
    setIsDropTarget(false);
  };

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  return (
    <div>
      <div
        onClick={handleToggle}
        onContextMenu={onContextMenu}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleToggle()}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
        className={`${styles.item} ${isActive ? styles.active : ''} ${isDropTarget ? styles.dropTarget : ''} ${sidebarState.draggedItem?.path.join('/') === currentPathStr ? styles.dragging : ''}`}
        style={{
          paddingLeft: `${16 + level * 16}px`,
          paddingRight: '16px',
          paddingTop: '8px',
          paddingBottom: '8px',
        }}
      >
        <span className={styles.iconContainer}>
          {item.type === 'folder' ? (
            isExpanded ? (
              <Icons.ChevronDown />
            ) : (
              <Icons.ChevronRight />
            )
          ) : null}
        </span>
        <span
          className={styles.typeIcon}
          style={{ color: item.type === 'folder' ? 'var(--accent)' : 'var(--text-muted)' }}
        >
          {showSpinner ? (
            <div className={styles.spinner} />
          ) : item.type === 'folder' ? (
            <Icons.Folder open={isExpanded} />
          ) : (
            <Icons.File />
          )}
        </span>

        {isEditing ? (
          <input
            ref={editInputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit();
              if (e.key === 'Escape') setIsEditing(false);
            }}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            className={styles.editInput}
          />
        ) : (
          <Tooltip content={item.name} className={styles.nameTooltip}>
            <span className={styles.name} onDoubleClick={handleDoubleClick}>
              {item.name}
            </span>
          </Tooltip>
        )}

        {/* Action Buttons on Hover */}
        {!isEditing && item.type === 'folder' && (
          <div className={styles.itemActions}>
            <Tooltip content="New File">
              <button
                type="button"
                className={styles.miniActionBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCreating('file');
                }}
              >
                <Icons.FilePlus />
              </button>
            </Tooltip>
            <Tooltip content="New Folder">
              <button
                type="button"
                className={styles.miniActionBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCreating('folder');
                }}
              >
                <Icons.FolderPlus />
              </button>
            </Tooltip>
          </div>
        )}
      </div>

      {isCreating && (
        <div
          style={{ paddingLeft: `${32 + level * 16}px`, paddingRight: '16px' }}
          className={styles.createInputContainer}
        >
          <span className={styles.typeIcon}>
            {isCreating === 'folder' ? <Icons.Folder /> : <Icons.File />}
          </span>
          <input
            ref={createInputRef}
            value={createValue}
            onChange={(e) => setCreateValue(e.target.value)}
            onBlur={handleCreateSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateSubmit();
              if (e.key === 'Escape') setIsCreating(null);
            }}
            className={styles.editInput}
          />
        </div>
      )}

      <ContextMenu position={contextMenu} onClose={() => setContextMenu(null)}>
        <button
          type="button"
          onClick={() => {
            setIsEditing(true);
            setContextMenu(null);
          }}
        >
          Rename
        </button>
        {!item.isRoot && (
          <button type="button" onClick={handleDelete} className={styles.deleteOption}>
            Delete
          </button>
        )}
      </ContextMenu>

      <Dialog
        isOpen={showDeleteDialog}
        title="Delete Item"
        message={`Are you sure you want to delete "${item.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteDialog(false)}
      />

      {item.type === 'folder' &&
        isExpanded &&
        children.map((child) => {
          const childPath = [...item.path, child.name].join('/');
          return (
            <TreeItem
              key={childPath}
              item={child}
              level={level + 1}
              filterText={filterText}
              fsHandle={child.handle}
              parentHandle={fsHandle}
            />
          );
        })}
    </div>
  );
}
