import type { UltrafeedEvent } from "src/worker/feed/feed-events";

type PendingResolver = (event: UltrafeedEvent | null) => void;

export class RealtimeEventBuffer {
  private readonly events: Array<UltrafeedEvent> = [];
  private readonly waiters: Array<PendingResolver> = [];

  private closed = false;

  push(event: UltrafeedEvent) {
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

  next() {
    const queued = this.events.shift();
    if (queued) {
      return Promise.resolve(queued);
    }

    if (this.closed) {
      return Promise.resolve(null);
    }

    return new Promise<UltrafeedEvent | null>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  drain() {
    return this.events.splice(0, this.events.length);
  }

  close() {
    this.closed = true;

    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      waiter?.(null);
    }
  }
}
