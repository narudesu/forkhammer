import type { Config } from "@docusaurus/types";

if (
  typeof (Function.prototype as { resolveWeak?: unknown }).resolveWeak !==
  "function"
) {
  Object.defineProperty(Function.prototype, "resolveWeak", {
    configurable: true,
    value: () => 0,
  });
}

const config: Config = {
  title: "forkhammer",
  tagline: "Validate Jira issues and spawn OpenCode worktrees",
  favicon: "img/favicon.ico",
  url: process.env.SITE_URL ?? "https://github.com",
  baseUrl: process.env.BASE_URL ?? "/forkhammer/",
  organizationName: process.env.GITHUB_OWNER ?? "your-org",
  projectName: process.env.GITHUB_REPO ?? "forkhammer",
  headTags: [
    {
      tagName: "script",
      attributes: {},
      innerHTML:
        "globalThis.require = globalThis.require || function require() { return {}; }; globalThis.require.resolveWeak = globalThis.require.resolveWeak || function resolveWeak() { return 0; };",
    },
  ],
  onBrokenLinks: "warn",
  onBrokenMarkdownLinks: "warn",
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },
  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          routeBasePath: "/",
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      },
    ],
  ],
};

export default config;
