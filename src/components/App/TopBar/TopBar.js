import React from 'react';
import { Compiler } from '../../../utils/compiler';
import { ZipWriter } from '../../../utils/zip';
import Settings from '../../Storage/Settings';
import { AppState, PreviewState } from '../App';
import { EditorState } from '../EditorArea';
import { LogState } from '../LogArea';
import { SidebarState } from '../Sidebar';
import { TabState } from '../TabBar';
import styles from './TopBar.module.css';
import ActionButtons from './subcomponents/ActionButtons';
import Breadcrumb from './subcomponents/Breadcrumb';
import ThemeToggle from './subcomponents/ThemeToggle';
import TopBarMenu from './subcomponents/TopBarMenu';
import WorkingIndicator from './subcomponents/WorkingIndicator';

export default function TopBar() {
  const appState = AppState.useState();
  const { theme, projectName, fs } = appState;
  const tabState = TabState.useState();
  const { openTabs = [], activeTabId } = tabState;
  const sidebarState = SidebarState.useState();
  const { folderTree, showAIInput } = sidebarState;
  const editorState = EditorState.useState();
  const logState = LogState.useState();
  const previewState = PreviewState.useState();
  const { isProcessing } = logState;

  const activeTab = openTabs.find((t) => t.id === activeTabId);

  const handleCompile = async () => {
    if (isProcessing) return;

    logState((draft) => {
      draft.isProcessing = true;
      draft.processingType = 'system';
    });

    if (activeTabId !== 'ai-logs') {
      handleOpenLog();
    }

    const onLog = (text) => {
      logState((draft) => {
        draft.logs.push({ id: `${Date.now()}-${Math.random()}`, role: 'system', text });
      });
    };

    try {
      const compiler = new Compiler(onLog);
      await compiler.compile(fs, folderTree, editorState.fileContents);

      try {
        const container = compiler.container;
        if (container?.vfs?.existsSync('/dist/index.html')) {
          const html = container.vfs.readFileSync('/dist/index.html', 'utf8');
          if (html) {
            previewState((draft) => {
              draft.htmlContent = html;
            });
            Settings.setPreviewHtml(html);
            tabState((draft) => {
              const exists = draft.openTabs.some((t) => t.id === 'preview');
              if (!exists) {
                draft.openTabs = [
                  ...draft.openTabs,
                  { id: 'preview', type: 'preview', label: 'Preview' },
                ];
              }
              draft.activeTabId = 'preview';
            });
            onLog('Preview ready. Opened preview tab.');
          }
        }
      } catch (previewErr) {
        onLog(`[WARN] Could not load preview: ${previewErr.message}`);
      }
    } catch (err) {
      onLog(`Unexpected error: ${err.message}`);
    } finally {
      logState((draft) => {
        draft.isProcessing = false;
        draft.processingType = null;
      });
    }
  };

  const handleOpenPreview = () => {
    tabState((draft) => {
      const exists = draft.openTabs.some((t) => t.id === 'preview');
      if (!exists) {
        draft.openTabs = [...draft.openTabs, { id: 'preview', type: 'preview', label: 'Preview' }];
      }
      draft.activeTabId = 'preview';
    });
  };

  const handleOpenLog = () => {
    tabState((draft) => {
      const exists = draft.openTabs.some((t) => t.id === 'ai-logs');
      if (!exists) {
        draft.openTabs = [{ id: 'ai-logs', type: 'logs', label: 'Log' }, ...draft.openTabs];
      }
      draft.activeTabId = 'ai-logs';
    });
  };

  const handleClearFS = () => {
    Compiler.reset();
    previewState((draft) => {
      draft.htmlContent = null;
    });
    Settings.setPreviewHtml(null);
    logState((draft) => {
      draft.logs.push({
        id: `${Date.now()}-${Math.random()}`,
        role: 'system',
        text: 'Virtual filesystem cleared. Next compile will start fresh.',
      });
    });
    handleOpenLog();
  };

  const handleStartOver = async () => {
    await fs.unlinkProject();
    Settings.reset();
    window.location.reload();
  };

  const handleExportZip = async () => {
    const zip = new ZipWriter();

    if (fs.mode === 'local' && fs.rootHandle) {
      const traverse = async (handle, path = '') => {
        for await (const [name, entry] of handle.entries()) {
          const entryPath = path ? `${path}/${name}` : name;
          if (entry.kind === 'file') {
            const inMemory = editorState.fileContents?.[entryPath];
            if (inMemory !== undefined) {
              zip.addFile(entryPath, inMemory);
            } else {
              const file = await entry.getFile();
              const content = await file.arrayBuffer();
              zip.addFile(entryPath, new Uint8Array(content));
            }
          } else if (entry.kind === 'directory') {
            await traverse(entry, entryPath);
          }
        }
      };
      await traverse(fs.rootHandle);
    } else {
      const traverse = (nodes, path = '') => {
        for (const node of nodes) {
          const nodePath = path ? `${path}/${node.name}` : node.name;
          if (node.type === 'file') {
            const content = editorState.fileContents?.[nodePath] || '';
            zip.addFile(nodePath, content);
          } else if (node.type === 'folder') {
            traverse(node.children || [], nodePath);
          }
        }
      };
      traverse(folderTree);
    }

    const blob = await zip.generateBlob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${projectName.replace(/\s+/g, '_')}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportCompiledZip = async () => {
    const container = Compiler.getContainer();
    if (!container) {
      alert('No compiled files found. Please compile the project first.');
      return;
    }

    const zip = new ZipWriter();
    const vfs = container.vfs;

    const filePaths = [];
    const collectFiles = (dirPath) => {
      try {
        const entries = vfs.readdirSync(dirPath);
        for (const name of entries) {
          if (
            name === 'node_modules' ||
            name === '.git' ||
            name === '.npm' ||
            name === 'dist' ||
            name === 'package.json' ||
            name === 'package-lock.json' ||
            name === 'tsconfig.json' ||
            name.startsWith('vite.config') ||
            name.startsWith('.almostnode')
          )
            continue;

          const fullPath = dirPath === '/' ? `/${name}` : `${dirPath}/${name}`;

          try {
            vfs.readdirSync(fullPath);
            collectFiles(fullPath);
          } catch (_dirErr) {
            filePaths.push(fullPath);
          }
        }
      } catch (_err) {}
    };
    collectFiles('/');

    const cleanDevArtifacts = (text) => {
      return text
        .replace(/\/\/ HMR Setup\n/g, '')
        .replace(/import\.meta\.hot\s*=\s*window\.__vite_hot_context__\([^)]*\);\n*/g, '')
        .replace(
          /\n*\/\/ React Refresh Registration\nif \(import\.meta\.hot\) \{[\s\S]*?\n\}\n*/g,
          '\n',
        )
        .replace(/\/\/#\s*sourceMappingURL=data:[^\n]*/g, '')
        .replace(/\$RefreshReg\$\([^)]*\);\n*/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    };

    const toProductionPath = (path) =>
      path
        .replace(/\.(jsx|tsx)$/, '.js')
        .replace(/\.ts$/, '.js')
        .replace(/\.module\.css$/, '.module.css.js');

    const rewriteImports = (text) =>
      text
        .replace(/(from\s+["'])([^"']*)\.(jsx|tsx)(["'])/g, '$1$2.js$4')
        .replace(/(import\s*\(["'])([^"']*)\.(jsx|tsx)(["']\))/g, '$1$2.js$4')
        .replace(/(from\s+["'])([^"']*\.module\.css)(["'])/g, '$1$2.js$3')
        .replace(/(import\s*\(["'])([^"']*\.module\.css)(["']\))/g, '$1$2.js$3')
        .replace(/(from\s+["'])(\.\.?\/[^"']*?)(["'])/g, (_match, pre, path, post) => {
          if (/\.\w+$/.test(path)) return _match;
          return `${pre}${path}.js${post}`;
        })
        .replace(/(import\s*\(["'])(\.\.?\/[^"']*?)(["']\))/g, (_match, pre, path, post) => {
          if (/\.\w+$/.test(path)) return _match;
          return `${pre}${path}.js${post}`;
        });

    const rewriteHtmlScripts = (html) =>
      html.replace(/(src=["'][^"']*)\.(jsx|tsx)(["'])/g, '$1.js$3');

    for (const filePath of filePaths) {
      try {
        const response = await fetch(`/preview${filePath}`);
        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          const zipPath = toProductionPath(filePath.slice(1));

          if (
            contentType.includes('javascript') ||
            contentType.includes('text/') ||
            filePath.match(/\.(jsx?|tsx?|css|html|json|md|txt|svg)$/)
          ) {
            let text = await response.text();
            if (contentType.includes('javascript') || filePath.match(/\.(jsx?|tsx?|module\.css)$/)) {
              text = rewriteImports(cleanDevArtifacts(text));
            } else if (filePath.endsWith('.html')) {
              text = rewriteHtmlScripts(text);
            }
            zip.addFile(zipPath, text);
          } else {
            const buffer = await response.arrayBuffer();
            zip.addFile(zipPath, new Uint8Array(buffer));
          }
        }
      } catch (_fetchErr) {
        try {
          const content = vfs.readFileSync(filePath);
          zip.addFile(toProductionPath(filePath.slice(1)), content);
        } catch (_readErr) {
          console.warn(`Could not read ${filePath}`);
        }
      }
    }

    const blob = await zip.generateBlob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${projectName.replace(/\s+/g, '_')}_compiled.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const toggleTheme = () => {
    appState((draft) => {
      draft.theme = draft.theme === 'light' ? 'dark' : 'light';
    });
  };

  let breadcrumb = [projectName];
  if (activeTab) {
    if (activeTab.type === 'file') {
      breadcrumb = [projectName, ...(activeTab.file?.path || [])];
    } else if (activeTab.type === 'logs') {
      breadcrumb = [projectName, 'System', 'Log'];
    } else if (activeTab.type === 'preview') {
      breadcrumb = [projectName, 'dist', 'index.html'];
    }
  }

  const handleBreadcrumbClick = (_seg, index) => {
    sidebarState((draft) => {
      if (!draft.expandedFolders) draft.expandedFolders = {};

      let fullPath = '';
      if (index > 0) {
        const pathSegments = breadcrumb.slice(1, index + 1);
        fullPath = pathSegments.join('/');
      }

      const current = draft.expandedFolders[fullPath] !== false;
      draft.expandedFolders[fullPath] = !current;
    });
  };

  return (
    <header className={styles.header}>
      <Breadcrumb breadcrumb={breadcrumb} onBreadcrumbClick={handleBreadcrumbClick} />
      <div className={styles.centerSection} />
      <div className={styles.actions}>
        <WorkingIndicator
          isProcessing={logState.isProcessing}
          processingType={logState.processingType}
        />
        <ActionButtons
          onCompile={handleCompile}
          onOpenLog={handleOpenLog}
          onOpenPreview={handleOpenPreview}
          isProcessing={isProcessing}
          activeTabId={activeTabId}
          showAIInput={showAIInput}
          onToggleAIInput={() =>
            sidebarState((draft) => {
              draft.showAIInput = !draft.showAIInput;
            })
          }
        />
        <TopBarMenu
          onExportZip={handleExportZip}
          onExportCompiledZip={handleExportCompiledZip}
          onStartOver={handleStartOver}
          onClearFS={handleClearFS}
          isProcessing={isProcessing}
        />
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </div>
    </header>
  );
}
