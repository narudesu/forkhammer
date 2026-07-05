import { createWatch, type Event, type Scope } from "effector";

export async function onceEvent<T>(event: Event<T>, opts: { scope: Scope }) {
  return new Promise<T>((resolve) => {
    const subscription = createWatch({
      scope: opts.scope,
      fn: (data) => {
        subscription.unsubscribe();
        resolve(data);
      },
      unit: event,
    });
  });
}
