/** Holds private links only in memory until the renderer can receive them. */
export class DeepLinkQueue {
  private readonly pending: string[] = [];

  constructor(
    private readonly canDeliver: () => boolean,
    private readonly deliver: (url: string) => void,
  ) {}

  /** Accept a link even during cold startup or window recreation. */
  enqueue(url: string): void {
    this.pending.push(url);
    this.flush();
  }

  /** Drain in arrival order only after the current renderer signals ready. */
  flush(): void {
    while (this.pending.length && this.canDeliver()) {
      this.deliver(this.pending.shift()!);
    }
  }
}
