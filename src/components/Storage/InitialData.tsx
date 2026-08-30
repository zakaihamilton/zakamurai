const STARTER_FILES = [
  {
    name: 'src',
    type: 'folder',
    children: [
      { name: 'App.jsx', type: 'file' },
      { name: 'main.jsx', type: 'file' },
    ],
  },
  { name: 'package.json', type: 'file' },
];

const STARTER_CONTENTS = {
  'src/main.jsx':
    'import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App";\n\nReactDOM.createRoot(document.getElementById("root")).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);',

  'src/App.jsx':
    'export default function App() {\n  return (\n    <div>\n      <h1>New Project</h1>\n      <p>Start coding here...</p>\n    </div>\n  );\n}',

  'package.json':
    '{\n  "name": "new-project",\n  "private": true,\n  "version": "0.1.0",\n  "type": "module",\n  "scripts": {\n    "dev": "vite",\n    "build": "vite build",\n    "preview": "vite preview"\n  },\n  "dependencies": {\n    "react": "^19.0.0",\n    "react-dom": "^19.0.0"\n  }\n}',
};

// Keep the template exports stable for existing callers while ensuring every
// fresh project starts from the same minimal, AI-ready file set.
export const DEFAULT_FILES = STARTER_FILES;
export const DEFAULT_CONTENTS = STARTER_CONTENTS;
export const SCRATCH_FILES = STARTER_FILES;
export const SCRATCH_CONTENTS = STARTER_CONTENTS;
