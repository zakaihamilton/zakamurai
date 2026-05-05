import React, { useState } from 'react';
import { Icons } from '../Icons';
import { ZakamuraiState } from '../State';
import styles from './TreeItem.module.css';

export default function TreeItem({ item, level = 0, filterText = '' }) {
  const state = ZakamuraiState.useState();
  const { expandedFolders = {}, activeTabId } = state;
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(item.name);

  const currentPathStr = item.path.join('/');
  // Force expansion if we are actively filtering, otherwise use standard state
  const isExpanded = filterText ? true : expandedFolders[currentPathStr];
  const isActive = activeTabId === currentPathStr;

  const handleToggle = () => {
    if (isEditing) return; // Prevent toggle when clicking to edit
    if (item.type === 'folder') {
      state((draft) => {
        draft.expandedFolders = {
          ...draft.expandedFolders,
          [currentPathStr]: !draft.expandedFolders[currentPathStr],
        };
      });
    } else {
      state((draft) => {
        const existingTab = draft.openTabs.find((t) => t.id === currentPathStr);
        if (!existingTab) {
          draft.openTabs = [
            ...draft.openTabs,
            { id: currentPathStr, type: 'file', label: item.name, file: item },
          ];
        }
        draft.activeTabId = currentPathStr;

        // Auto-expand parent folders
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
      state((draft) => {
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
          const oldPathStr = item.path.join('/');
          const newPathArr = [...item.path];
          newPathArr[newPathArr.length - 1] = editValue;
          const newPathStr = newPathArr.join('/');

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

          // Replace old path prefix in fileContents
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

          // Replace old path prefix in openTabs
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
        }
      });
    }
    setIsEditing(false);
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleToggle}
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
        <span
          className={styles.typeIcon}
          style={{ color: item.type === 'folder' ? 'var(--accent)' : 'var(--text-muted)' }}
        >
          {item.type === 'folder' ? <Icons.Folder open={isExpanded} /> : <Icons.File />}
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
          <span className={styles.name} onDoubleClick={handleDoubleClick}>
            {item.name}
          </span>
        )}
      </button>
      {item.type === 'folder' &&
        isExpanded &&
        item.children?.map((child) => {
          const childPath = [...item.path, child.name].join('/');
          return (
            <TreeItem
              key={childPath}
              item={{ ...child, path: [...item.path, child.name] }}
              level={level + 1}
              filterText={filterText}
            />
          );
        })}
    </div>
  );
}
