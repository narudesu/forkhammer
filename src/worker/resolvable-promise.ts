export abstract class ResolvablePromise<T> {
  abstract promise: Promise<T>;
  abstract resolve(value: T): void;
  abstract isResolved(): boolean;

  static create = createResolvablePromise;
}

interface State<T> {
  resolve: null | ((value: T) => void);
  resolvedValue: {
    value: T;
  } | null;
}

function createResolvablePromise<T>(): ResolvablePromise<T> {
  const state: State<T> = { resolve: null, resolvedValue: null };

  const promise = new Promise<T>((resolve) => {
    state.resolve = resolve;
  });
  return {
    promise,
    isResolved() {
      return state.resolvedValue == null;
    },
    resolve: (value) => state.resolve?.(value),
  };
}
