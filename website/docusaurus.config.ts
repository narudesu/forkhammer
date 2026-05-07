import type { Config } from "@docusaurus/types";

declare const require: (NodeJS.Require & { resolveWeak?: unknown }) | undefined;

if (
  typeof (Function.prototype as { resolveWeak?: unknown }).resolveWeak !==
  "function"
) {
  Object.defineProperty(Function.prototype, "resolveWeak", {
    configurable: true,
    value: () => 0,
  });
}

if (typeof require !== "undefined") {
  require.extensions[".css"] = () => undefined;
}

const config: Config = {
  title: "forkhammer",
  tagline: "Validate Jira issues and spawn OpenCode worktrees",
  favicon: "img/favicon.ico",
  url: process.env.SITE_URL ?? "https://github.com",
  baseUrl: process.env.BASE_URL ?? "/forkhammer/",
  organizationName: process.env.GITHUB_OWNER ?? "your-org",
  projectName: process.env.GITHUB_REPO ?? "forkhammer",
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
