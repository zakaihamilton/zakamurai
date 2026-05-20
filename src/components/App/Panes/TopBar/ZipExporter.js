import { Compiler } from '@/utils/compiler';
import { ZipWriter } from '@/utils/zip';
import { useCallback } from 'react';

export default function useZipExporter(fs, editorState, folderTree, projectName) {
  const handleExportZip = useCallback(async () => {
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
  }, [fs, editorState, folderTree, projectName]);

  const handleExportCompiledZip = useCallback(async () => {
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
            if (
              contentType.includes('javascript') ||
              filePath.match(/\.(jsx?|tsx?|module\.css)$/)
            ) {
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
  }, [projectName]);

  return {
    handleExportZip,
    handleExportCompiledZip,
  };
}
