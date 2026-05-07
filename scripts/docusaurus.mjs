import { createRequire, register } from "node:module";

const require = createRequire(import.meta.url);

if (!require.extensions[".css"]) {
  require.extensions[".css"] = () => undefined;
}

if (typeof Function.prototype.resolveWeak !== "function") {
  Function.prototype.resolveWeak = function resolveWeak(specifier) {
    return specifier;
  };
}

register("./css-loader.mjs", import.meta.url);

await import("../node_modules/@docusaurus/core/bin/docusaurus.mjs");
