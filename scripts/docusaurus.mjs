import { register } from "node:module";

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

if (!require.extensions[".css"]) {
  require.extensions[".css"] = () => undefined;
}

register("./css-loader.mjs", import.meta.url);

await import("../node_modules/@docusaurus/core/bin/docusaurus.mjs");
