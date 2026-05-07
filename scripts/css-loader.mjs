import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

if (!require.extensions[".css"]) {
  require.extensions[".css"] = () => undefined;
}

export async function resolve(specifier, context, defaultResolve) {
  if (specifier.endsWith(".css")) {
    return {
      url: new URL(specifier, context.parentURL).href,
      format: "module",
      shortCircuit: true,
    };
  }

  return defaultResolve(specifier, context, defaultResolve);
}

export async function load(url, context, defaultLoad) {
  if (url.endsWith(".css")) {
    return {
      format: "module",
      shortCircuit: true,
      source: "export default {};\n",
    };
  }

  return defaultLoad(url, context, defaultLoad);
}
