declare const require:
  | (NodeJS.Require & { resolveWeak?: (id: string) => string | number })
  | undefined;

if (
  typeof require !== "undefined" &&
  typeof require.resolveWeak !== "function"
) {
  require.resolveWeak = (id: string) => id;
}
