export function runBlock<T>(cb: () => T) {
  return cb();
}
