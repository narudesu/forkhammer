import type { FeedEvent } from "../types";

type PendingResolver = (event: FeedEvent | null) => void;

export class RealtimeEventBuffer {
  private readonly events: Array<FeedEvent> = [];

  private readonly waiters: Array<PendingResolver> = [];

  private closed = false;

  push(event: FeedEvent) {
    if (this.closed) {
      return;
    }

    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(event);
      return;
    }

    this.events.push(event);
  }

  drain() {
    const drained = [...this.events];
    this.events.length = 0;
    return drained;
  }

  next() {
    const queued = this.events.shift();
    if (queued) {
      return Promise.resolve(queued);
    }

    if (this.closed) {
      return Promise.resolve(null);
    }

    return new Promise<FeedEvent | null>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  close() {
    this.closed = true;

    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      waiter?.(null);
    }
  }
}
