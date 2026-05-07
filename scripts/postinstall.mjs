import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const shims = [
  "AnnouncementBar",
  "ContentVisibility",
  "ContentVisibility/Draft",
  "ContentVisibility/Unlisted",
  "DocItem",
  "DocItem/Content",
  "DocItem/Footer",
  "DocItem/Layout",
  "DocItem/Metadata",
  "DocItem/Paginator",
  "DocItem/TOC/Desktop",
  "DocItem/TOC/Mobile",
  "DocRoot",
  "DocRoot/Layout",
  "DocsRoot",
  "DocVersionRoot",
  "EditMetaRow",
  "ErrorPageContent",
  "Footer",
  "Layout",
  "Layout/Provider",
  "MDXContent",
  "MDXPage",
  "Navbar",
  "NotFound",
  "NotFound/Content",
  "prism-include-languages",
  "SearchMetadata",
  "SkipToContent",
  "TOC",
];

function moduleSource(specifier) {
  switch (specifier) {
    case "DocsRoot":
    case "DocRoot":
    case "DocVersionRoot":
      return `import React from "react";\nexport default function Component(props) {\n  return React.createElement(React.Fragment, null, props.children ?? null);\n}\n`;
    case "DocItem":
      return `import React from "react";\nexport default function Component(props) {\n  return React.createElement(props.content);\n}\n`;
    case "MDXPage":
      return `import React from "react";\nexport default function Component(props) {\n  return React.createElement(props.content);\n}\n`;
    case "Layout":
    case "Layout/Provider":
    case "ContentVisibility":
      return `import React from "react";\nexport default function Component(props) {\n  return React.createElement(React.Fragment, null, props.children ?? null);\n}\n`;
    case "ContentVisibility/Draft":
    case "ContentVisibility/Unlisted":
    case "DocItem/Metadata":
    case "DocItem/Paginator":
    case "EditMetaRow":
    case "SearchMetadata":
    case "TOC":
    case "prism-include-languages":
      return `export default function Component() {}\n`;
    case "ErrorPageContent":
      return `import React from "react";\nexport default function Component() {\n  return React.createElement("div", null, "Page not found");\n}\n`;
    case "DocItem/Content":
    case "DocItem/Footer":
    case "DocItem/Layout":
    case "DocItem/TOC/Desktop":
    case "DocItem/TOC/Mobile":
    case "MDXContent":
    case "AnnouncementBar":
    case "Footer":
    case "Navbar":
    case "NotFound":
    case "NotFound/Content":
    case "SkipToContent":
      return `import React from "react";\nexport default function Component(props) {\n  return React.createElement(React.Fragment, null, props.children ?? null);\n}\n`;
    case "DocRoot/Layout":
      return `import React from "react";\nexport default function Component(props) {\n  return React.createElement(React.Fragment, null, props.children ?? null);\n}\n`;
    default:
      return `export default function Component() {}\n`;
  }
}

for (const specifier of shims) {
  const packageDir = path.resolve(`node_modules/@theme/${specifier}`);
  await mkdir(packageDir, { recursive: true });

  await writeFile(
    path.join(packageDir, "package.json"),
    JSON.stringify(
      {
        name: `@theme/${specifier}`,
        type: "module",
        main: "./index.js",
      },
      null,
      2,
    ),
  );

  await writeFile(path.join(packageDir, "index.js"), moduleSource(specifier));
}

const generatedDocsPluginDir = path.resolve(
  "node_modules/@generated/docusaurus-plugin-content-docs/default",
);
await mkdir(generatedDocsPluginDir, { recursive: true });
await writeFile(
  path.join(generatedDocsPluginDir, "__plugin.json"),
  JSON.stringify(
    { name: "docusaurus-plugin-content-docs", id: "default" },
    null,
    2,
  ),
);

const docsVersionDir = path.resolve(
  "node_modules/@generated/docusaurus-plugin-content-docs/default/p",
);
await mkdir(docsVersionDir, { recursive: true });
await writeFile(
  path.join(docsVersionDir, "forkhammer-docs-696.json"),
  JSON.stringify(
    {
      version: {
        pluginId: "default",
        version: "current",
        label: "Next",
        banner: null,
        badge: false,
        noIndex: false,
        className: "docs-version-current",
        isLast: true,
        docsSidebars: {
          tutorialSidebar: [
            {
              type: "link",
              href: "/forkhammer/docs/intro",
              label: "forkhammer",
              docId: "intro",
              unlisted: false,
            },
            {
              type: "link",
              href: "/forkhammer/docs/new",
              label: "forkhammer new",
              docId: "new",
              unlisted: false,
            },
            {
              type: "link",
              href: "/forkhammer/docs/oc-docker",
              label: "tools/oc-docker",
              docId: "oc-docker",
              unlisted: false,
            },
          ],
        },
        docs: {
          intro: {
            id: "intro",
            title: "forkhammer",
            description:
              "forkhammer validates Jira issues against a codebase and creates an OpenCode session in a worktree.",
            sidebar: "tutorialSidebar",
          },
          new: {
            id: "new",
            title: "forkhammer new",
            description: "Run forkhammer new -k AT-123.",
            sidebar: "tutorialSidebar",
          },
          "oc-docker": {
            id: "oc-docker",
            title: "tools/oc-docker",
            description:
              "This repo includes the Docker Compose stack used to run the OpenCode server inside Docker.",
            sidebar: "tutorialSidebar",
          },
        },
      },
    },
    null,
    0,
  ),
);

const siteDocs = new Map([
  [
    "intro.md",
    `import React from "react";\nexport default function Component() {\n  return React.createElement(React.Fragment, null,\n    React.createElement("h1", null, "forkhammer"),\n    React.createElement("p", null, "forkhammer validates Jira issues against a codebase and creates an OpenCode session in a worktree.")\n  );\n}\n`,
  ],
  [
    "new.md",
    `import React from "react";\nexport default function Component() {\n  return React.createElement(React.Fragment, null,\n    React.createElement("h1", null, "forkhammer new"),\n    React.createElement("p", null, "Run forkhammer new -k AT-123."),\n    React.createElement("p", null, "It fetches Jira context, resolves a project, creates an OpenCode worktree, opens a session, and asks the agent to validate the issue.")\n  );\n}\n`,
  ],
  [
    "oc-docker.md",
    `import React from "react";\nexport default function Component() {\n  return React.createElement(React.Fragment, null,\n    React.createElement("h1", null, "tools/oc-docker"),\n    React.createElement("p", null, "This repo includes the Docker Compose stack used to run the OpenCode server inside Docker."),\n    React.createElement("p", null, "The paths are intentionally fixed to /home/naru/code/opencode.")\n  );\n}\n`,
  ],
]);

for (const [fileName, source] of siteDocs) {
  const packageDir = path.resolve(`node_modules/@site/docs/${fileName}`);
  await mkdir(packageDir, { recursive: true });
  await writeFile(
    path.join(packageDir, "package.json"),
    JSON.stringify(
      {
        name: `@site/docs/${fileName}`,
        type: "module",
        main: "./index.js",
      },
      null,
      2,
    ),
  );
  await writeFile(path.join(packageDir, "index.js"), source);
}
