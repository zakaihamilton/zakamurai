import type { TreeNode } from '@/types/domain-types';

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

const STARTER_CONTENTS: Record<string, string> = {
  'src/main.jsx':
    'import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App";\n\nReactDOM.createRoot(document.getElementById("root")).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);',

  'src/App.jsx':
    'export default function App() {\n  return (\n    <div>\n      <h1>New Project</h1>\n      <p>Start coding here...</p>\n    </div>\n  );\n}',

  'package.json':
    '{\n  "name": "new-project",\n  "private": true,\n  "version": "0.1.0",\n  "type": "module",\n  "scripts": {\n    "dev": "vite",\n    "build": "vite build",\n    "preview": "vite preview"\n  },\n  "dependencies": {\n    "react": "^19.0.0",\n    "react-dom": "^19.0.0"\n  }\n}',
};

const PORTABLE_TEMPLATE_CONTENTS: Record<string, string> = {
  ...STARTER_CONTENTS,
  'src/App.jsx': STARTER_CONTENTS['src/App.jsx'].replace(
    'export default function App()',
    'import React from "react";\n\nexport default function App()',
  ),
  'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#111522" />
    <title>New project</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>`,
  'package.json': `{
  "name": "new-project",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "vite": "^8.4.0"
  }
}`,
};

export type ProjectTemplate = {
  id: string;
  name: string;
  description: string;
  contents: Record<string, string>;
};

const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'counter',
    name: 'Counter app',
    description: 'A working React app with state, styled controls, and a live preview.',
    contents: {
      ...PORTABLE_TEMPLATE_CONTENTS,
      'src/App.jsx': `import React, { useState } from "react";
import "./App.css";

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <main className="page">
      <section className="card" aria-labelledby="counter-title">
        <p className="eyebrow">Your first browser app</p>
        <h1 id="counter-title">Make something real.</h1>
        <p className="intro">This counter is already running. Edit the code or ask local AI to change it.</p>
        <div className="counter" aria-live="polite">{count}</div>
        <div className="controls">
          <button type="button" onClick={() => setCount((value) => value - 1)} aria-label="Decrease count">−</button>
          <button type="button" className="primary" onClick={() => setCount((value) => value + 1)}>Add one</button>
          <button type="button" onClick={() => setCount(0)}>Reset</button>
        </div>
        <p className="hint">Change <code>src/App.jsx</code>, then press Build to refresh the preview.</p>
      </section>
    </main>
  );
}`,
      'src/App.css': `.page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 32px;
  color: #f4f5fb;
  background: radial-gradient(circle at top, #293164, #111522 55%);
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; }
.card {
  width: min(100%, 520px);
  padding: 42px;
  border: 1px solid #414768;
  border-radius: 24px;
  background: rgb(22 27 45 / 88%);
  box-shadow: 0 28px 80px rgb(0 0 0 / 30%);
}
.eyebrow { color: #a9a4ff; font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
h1 { margin: 8px 0; font-size: clamp(30px, 7vw, 46px); letter-spacing: -.04em; }
.intro, .hint { color: #b8bfd3; line-height: 1.6; }
.counter { margin: 30px 0; font-size: 72px; font-weight: 750; text-align: center; }
.controls { display: flex; justify-content: center; gap: 10px; }
button { min-height: 42px; padding: 0 15px; border: 1px solid #444c68; border-radius: 10px; color: inherit; background: #202740; font: inherit; font-weight: 650; cursor: pointer; }
button:hover { border-color: #a9a4ff; }
button.primary { border-color: #8078ff; background: #7168ed; }
.hint { margin: 24px 0 0; font-size: 13px; text-align: center; }
code { color: #dedbff; }`,
    },
  },
  {
    id: 'landing',
    name: 'Landing page',
    description:
      'A responsive product page with a hero, feature cards, and a clear call to action.',
    contents: {
      ...PORTABLE_TEMPLATE_CONTENTS,
      'src/App.jsx': `import React from "react";
import "./App.css";

const features = [
  { number: "01", title: "Start in the browser", text: "No install or project setup before you can see your idea take shape." },
  { number: "02", title: "Keep your work close", text: "Your files stay in this browser until you choose to export or open a folder." },
  { number: "03", title: "Build at your pace", text: "Edit the code yourself, or ask local AI for a first draft." },
];

export default function App() {
  return (
    <main className="site-shell">
      <nav className="nav"><a className="brand" href="#top"><span className="brand-mark">N</span> Northstar</a><a className="nav-link" href="#features">Explore</a></nav>
      <section className="hero" id="top">
        <p className="eyebrow">A calmer way to build</p>
        <h1>Ideas deserve a place to become real.</h1>
        <p className="lead">Northstar gives your next small idea a clear path from first thought to a working web page.</p>
        <a className="cta" href="#features">See how it works <span aria-hidden="true">↗</span></a>
        <div className="hero-note"><span className="status-dot" /> Ready when you are</div>
      </section>
      <section className="features" id="features" aria-label="What you can do">
        {features.map((feature) => <article className="feature" key={feature.number}><span className="number">{feature.number}</span><h2>{feature.title}</h2><p>{feature.text}</p></article>)}
      </section>
      <footer>Built for the next thing you want to make.</footer>
    </main>
  );
}`,
      'src/App.css': `:root { font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #172322; background: #f2f5ef; }
* { box-sizing: border-box; }
body { margin: 0; }
.site-shell { max-width: 1120px; margin: 0 auto; padding: 0 28px; }
.nav { height: 78px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #dce3dc; }
.brand, .nav-link { color: inherit; text-decoration: none; font-weight: 700; }
.brand { display: flex; align-items: center; gap: 10px; }
.brand-mark { display: grid; width: 30px; height: 30px; place-items: center; border-radius: 9px; color: white; background: #27645c; }
.nav-link { color: #526762; font-size: 14px; }
.hero { max-width: 760px; margin: 88px auto 76px; text-align: center; }
.eyebrow, .number { color: #27766b; font-size: 12px; font-weight: 750; letter-spacing: .13em; text-transform: uppercase; }
h1 { margin: 14px 0 18px; font-size: clamp(42px, 8vw, 82px); letter-spacing: -.065em; line-height: .98; }
.lead { max-width: 560px; margin: 0 auto; color: #5c6e68; font-size: 18px; line-height: 1.65; }
.cta { display: inline-flex; gap: 16px; align-items: center; margin-top: 30px; padding: 14px 20px; border-radius: 999px; color: white; background: #23655c; text-decoration: none; font-weight: 700; }
.cta:hover { background: #174e47; }
.hero-note { margin-top: 20px; color: #667771; font-size: 13px; }
.status-dot { display: inline-block; width: 7px; height: 7px; margin-right: 7px; border-radius: 50%; background: #49a17d; }
.features { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.feature { padding: 24px; border: 1px solid #dbe3dd; border-radius: 18px; background: #fbfcf9; }
.feature h2 { margin: 22px 0 8px; font-size: 20px; letter-spacing: -.03em; }
.feature p { margin: 0; color: #5c6e68; line-height: 1.6; }
footer { padding: 32px 0; color: #667771; font-size: 13px; text-align: center; }
@media (max-width: 680px) { .site-shell { padding: 0 18px; } .hero { margin: 64px auto 54px; } .features { grid-template-columns: 1fr; } .feature { padding: 20px; } }`,
    },
  },
  {
    id: 'blank',
    name: 'Blank project',
    description: 'A minimal React workspace with the preview and build loop ready to go.',
    contents: PORTABLE_TEMPLATE_CONTENTS,
  },
];

export const getProjectTemplates = (): ProjectTemplate[] => PROJECT_TEMPLATES;

const LEGACY_SCRATCH_TEMPLATE: ProjectTemplate = {
  id: 'scratch',
  name: 'Blank project',
  description: 'A minimal React workspace with the preview and build loop ready to go.',
  contents: STARTER_CONTENTS,
};

export const getProjectTemplate = (templateId: string): ProjectTemplate => {
  const matchingTemplate = PROJECT_TEMPLATES.find((template) => template.id === templateId);
  if (matchingTemplate) return matchingTemplate;
  if (templateId === 'scratch') return LEGACY_SCRATCH_TEMPLATE;
  if (templateId === 'default') return PROJECT_TEMPLATES[0];
  return PROJECT_TEMPLATES.find((template) => template.id === 'blank') || LEGACY_SCRATCH_TEMPLATE;
};

export const getTemplateContents = (templateId: string): Record<string, string> => ({
  ...getProjectTemplate(templateId).contents,
});

export const getTemplateFiles = (templateId: string): TreeNode[] => {
  const tree: TreeNode[] = [];
  for (const path of Object.keys(getProjectTemplate(templateId).contents)) {
    const parts = path.split('/').filter(Boolean);
    let level = tree;
    for (const [index, part] of parts.entries()) {
      const isFile = index === parts.length - 1;
      let node = level.find((item) => item.name === part);
      if (!node) {
        node = isFile
          ? { name: part, type: 'file', path: parts.slice(0, index + 1) }
          : { name: part, type: 'folder', path: parts.slice(0, index + 1), children: [] };
        level.push(node);
      }
      if (!isFile) {
        node.children ||= [];
        level = node.children;
      }
    }
  }
  return tree;
};

// Keep these legacy exports stable for existing callers and benchmark fixtures.
export const DEFAULT_FILES = STARTER_FILES;
export const DEFAULT_CONTENTS = STARTER_CONTENTS;
export const SCRATCH_FILES = STARTER_FILES;
export const SCRATCH_CONTENTS = STARTER_CONTENTS;
