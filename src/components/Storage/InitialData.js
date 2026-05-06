export const DEFAULT_FILES = [
  {
    name: 'src',
    type: 'folder',
    children: [
      {
        name: 'components',
        type: 'folder',
        children: [
          { name: 'Sidebar.jsx', type: 'file' },
          { name: 'Sidebar.module.css', type: 'file' },
          { name: 'Editor.jsx', type: 'file' },
          { name: 'Editor.module.css', type: 'file' },
        ],
      },
      { name: 'App.jsx', type: 'file' },
      { name: 'App.module.css', type: 'file' },
      { name: 'main.jsx', type: 'file' },
    ],
  },
  { name: 'package.json', type: 'file' },
  { name: 'vite.config.js', type: 'file' },
];

export const DEFAULT_CONTENTS = {
  'src/main.jsx':
    'import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App";\n\nReactDOM.createRoot(document.getElementById("root")).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);',

  'src/App.jsx':
    'import Sidebar from "./components/Sidebar";\nimport Editor from "./components/Editor";\nimport styles from "./App.module.css";\n\nexport default function App() {\n  return (\n    <div className={styles.container}>\n      <Sidebar />\n      <Editor />\n    </div>\n  );\n}',

  'src/App.module.css':
    '.container {\n  display: flex;\n  height: 100vh;\n  width: 100vw;\n  background: #1a1a1a;\n  color: #fff;\n}',

  'src/components/Sidebar.jsx':
    'import styles from "./Sidebar.module.css";\n\nexport default function Sidebar() {\n  return (\n    <aside className={styles.sidebar}>\n      <h2 className={styles.title}>Project</h2>\n      <nav>\n        <ul>\n          <li>File Explorer</li>\n          <li>Settings</li>\n        </ul>\n      </nav>\n    </aside>\n  );\n}',

  'src/components/Sidebar.module.css':
    '.sidebar {\n  width: 250px;\n  border-right: 1px solid #333;\n  padding: 1rem;\n}\n.title {\n  font-size: 0.9rem;\n  text-transform: uppercase;\n  color: #888;\n}',

  'src/components/Editor.jsx':
    'import styles from "./Editor.module.css";\n\nexport default function Editor() {\n  return (\n    <section className={styles.editor}>\n      <header className={styles.header}>main.js</header>\n      <textarea className={styles.textarea} defaultValue="// Local-first AI code goes here..." />\n    </section>\n  );\n}',

  'src/components/Editor.module.css':
    '.editor {\n  flex: 1;\n  display: flex;\n  flex-direction: column;\n}\n.header {\n  padding: 0.5rem 1rem;\n  background: #252525;\n  font-family: monospace;\n}\n.textarea {\n  flex: 1;\n  background: transparent;\n  color: #d4d4d4;\n  border: none;\n  padding: 1rem;\n  font-family: "Fira Code", monospace;\n  resize: none;\n  outline: none;\n}',

  'package.json':
    '{\n  "name": "zakamurai-local-env",\n  "private": true,\n  "version": "0.1.0",\n  "type": "module",\n  "scripts": {\n    "dev": "vite",\n    "build": "vite build",\n    "preview": "vite preview"\n  },\n  "dependencies": {\n    "react": "^18.2.0",\n    "react-dom": "^18.2.0"\n  },\n  "devDependencies": {\n    "@vitejs/plugin-react": "^4.0.0",\n    "vite": "^4.3.0"\n  }\n}',

  'vite.config.js':
    'import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\n\nexport default defineConfig({\n  plugins: [react()],\n});',
};
