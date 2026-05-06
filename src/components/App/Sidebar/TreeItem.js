import React, { useState, useEffect } from 'react';
import { Icons } from '../Icons';
import { SidebarState } from '../Sidebar';
import { TabState } from '../TabBar';
import { EditorState } from '../EditorArea';
import { AppState } from '../App';
import Tooltip from '../../Widgets/Tooltip/Tooltip';
import ContextMenu from '../../Widgets/ContextMenu/ContextMenu';
import styles from './TreeItem.module.css';

export default function TreeItem({ item, level = 0, filterText = '', fsHandle = null, parentHandle = null }) {
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

  const currentPathStr = item.path.join('/');
  // Force expansion if we are actively filtering, otherwise use standard state
  const isExpanded = filterText ? true : expandedFolders[currentPathStr];
  const isActive = activeTabId === currentPathStr;

  const [children, setChildren] = useState(() => {
    if (item.children) {
      return item.children.map(child => ({
        ...child,
        path: [...item.path, child.name]
      }));
    }
    return [];
  });
  const [isLoading, setIsLoading] = useState(false);

  const loadLocalChildren = async () => {
    if (!fsHandle || item.type !== 'folder' || children.length > 0) return;
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
      entries.sort((a, b) => {
        if (a.kind === b.kind) return a.name.localeCompare(b.name);
        return a.kind === 'directory' ? -1 : 1;
      });
      setChildren(entries);
    } catch (err) {
      console.error('Failed to load sub-directory:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isExpanded && fs.mode === 'local' && fsHandle && children.length === 0) {
      loadLocalChildren();
    }
  }, [isExpanded, fs.mode, fsHandle, children.length, loadLocalChildren]);

  const handleToggle = () => {
    if (isEditing) return; // Prevent toggle when clicking to edit
    if (item.type === 'folder') {
      if (!isExpanded && fs.mode === 'local') {
        loadLocalChildren();
      }
      sidebarState((draft) => {
        draft.expandedFolders = {
          ...draft.expandedFolders,
          [currentPathStr]: !draft.expandedFolders[currentPathStr],
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

  const handleRenameSubmit = () => {
    if (editValue.trim() && editValue !== item.name) {
      const oldPathStr = item.path.join('/');
      const newPathArr = [...item.path];
      newPathArr[newPathArr.length - 1] = editValue;
      const newPathStr = newPathArr.join('/');

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
    setIsEditing(false);
  };

  const handleCreateSubmit = async () => {
    if (!createValue.trim()) {
      setIsCreating(null);
      return;
    }

    if (fs.mode === 'local' && fsHandle) {
      try {
        if (isCreating === 'file') {
          await fsHandle.getFileHandle(createValue, { create: true });
        } else {
          await fsHandle.getDirectoryHandle(createValue, { create: true });
        }
        await loadLocalChildren();
        if (!isExpanded) handleToggle();
      } catch (err) {
        console.error('Failed to create:', err);
      }
    } else {
      // Mock mode creation
      sidebarState((draft) => {
        let currentLevel = draft.folderTree;
        for (const seg of item.path) {
          const node = currentLevel.find((n) => n.name === seg);
          if (node) currentLevel = node.children || (node.children = []);
        }
        currentLevel.push({
          name: createValue,
          type: isCreating === 'folder' ? 'folder' : 'file',
          children: isCreating === 'folder' ? [] : undefined,
        });
      });
      if (!isExpanded) handleToggle();
    }
    setIsCreating(null);
    setCreateValue('');
  };

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete ${item.name}?`)) return;

    if (fs.mode === 'local' && parentHandle) {
      try {
        await parentHandle.removeEntry(item.name, { recursive: true });
        // Refresh the parent directory to update the UI
        await fs.refreshDirectory(parentHandle);
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
    setContextMenu(null);
  };

  const onContextMenu = (e) => {
    if (isEditing) return;
    e.preventDefault();
    setContextMenu({ x: e.pageX, y: e.pageY });
  };

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  return (
    <div>
      <button
        type="button"
        onClick={handleToggle}
        onContextMenu={onContextMenu}
        onKeyDown={(e) => e.key === 'Enter' && handleToggle()}
        className={`${styles.item} ${isActive ? styles.active : ''}`}
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
        <span className={styles.typeIcon} style={{ color: item.type === 'folder' ? 'var(--accent)' : 'var(--text-muted)' }}>
          {isLoading ? (
            <div className={styles.spinner} />
          ) : item.type === 'folder' ? (
            <Icons.Folder open={isExpanded} />
          ) : (
            <Icons.File />
          )}
        </span>

        {isEditing ? (
          <input
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
            <button
              type="button"
              className={styles.miniActionBtn}
              onClick={(e) => {
                e.stopPropagation();
                setIsCreating('file');
              }}
              title="New File"
            >
              <Icons.FilePlus />
            </button>
            <button
              type="button"
              className={styles.miniActionBtn}
              onClick={(e) => {
                e.stopPropagation();
                setIsCreating('folder');
              }}
              title="New Folder"
            >
              <Icons.FolderPlus />
            </button>
          </div>
        )}
      </button>

      {isCreating && (
        <div style={{ paddingLeft: `${32 + level * 16}px`, paddingRight: '16px' }} className={styles.createInputContainer}>
          <span className={styles.typeIcon}>
            {isCreating === 'folder' ? <Icons.Folder /> : <Icons.File />}
          </span>
          <input
            autoFocus
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
        <button type="button" onClick={() => { setIsEditing(true); setContextMenu(null); }}>Rename</button>
        <button type="button" onClick={handleDelete} className={styles.deleteOption}>Delete</button>
      </ContextMenu>

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
