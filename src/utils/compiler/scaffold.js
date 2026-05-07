/**
 * Scaffolding logic for generating default configuration files.
 */

export function scaffoldMissingFiles(vfs, packageJson, onLog) {
  // Ensure type: module for Vite if not present
  if (packageJson.scripts?.build?.includes('vite') && packageJson.type !== 'module') {
    onLog('Adding "type": "module" to package.json for Vite compatibility...');
    packageJson.type = 'module';
    vfs.writeFileSync('/package.json', JSON.stringify(packageJson, null, 2));
  }

  // Ensure a basic vite.config.js exists if using vite build and it's missing
  if (
    packageJson.scripts?.build?.includes('vite') &&
    !vfs.existsSync('/vite.config.js') &&
    !vfs.existsSync('/vite.config.ts')
  ) {
    onLog('No vite.config.js found. Creating a default one...');
    const defaultConfig = `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n  resolve: {\n    alias: {\n      '@': '/src',\n    },\n  },\n  build: {\n    outDir: 'dist',\n    emptyOutDir: true,\n  }\n});`;
    vfs.writeFileSync('/vite.config.js', defaultConfig);
  }

  // Ensure index.html exists for Vite builds
  if (packageJson.scripts?.build?.includes('vite') && !vfs.existsSync('/index.html')) {
    onLog('No index.html found. Creating a default one for Vite...');

    // Smart entry-point detection
    let entryFile = '/src/main.jsx'; // Standard Vite React default
    if (vfs.existsSync('/src/index.jsx')) entryFile = '/src/index.jsx';
    else if (vfs.existsSync('/src/main.tsx')) entryFile = '/src/main.tsx';
    else if (vfs.existsSync('/src/index.tsx')) entryFile = '/src/index.tsx';
    else if (!vfs.existsSync('/src/main.jsx')) {
      if (vfs.existsSync('/src/App.jsx') || vfs.existsSync('/src/App.tsx')) {
        const isTs = vfs.existsSync('/src/App.tsx');
        const ext = isTs ? 'tsx' : 'jsx';

        const mountCode = `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App.${ext}';\n\nReactDOM.createRoot(document.getElementById('root')).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);`;

        if (!vfs.existsSync('/src')) vfs.mkdirSync('/src');
        vfs.writeFileSync(`/src/main.${ext}`, mountCode);
        entryFile = `/src/main.${ext}`;
        onLog(`No mount point found. Auto-generated /src/main.${ext}`);
      }
    }

    const entryFileRel = entryFile.startsWith('/') ? entryFile.slice(1) : entryFile;

    const defaultHtml = `<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <base href="/preview/">\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${packageJson.name || 'Vite App'}</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="${entryFileRel}"></script>\n  </body>\n</html>`;
    vfs.writeFileSync('/index.html', defaultHtml);
  }
}
