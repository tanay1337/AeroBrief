/** Serializes local writes and coalesces edits while a write is in progress. */
export class LatestAutosave<T> {
  private pending: T | undefined;
  private running: Promise<void> | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private write: (value: T) => Promise<void>, private status: (value: 'saving' | 'saved' | 'error') => void, private delay = 300) {}
  discard() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined; this.pending = undefined; this.status('saved');
  }
  setWriter(write: (value: T) => Promise<void>) { this.write = write; }
  enqueue(value: T) {
    this.pending = value;
    this.status('saving');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = undefined; void this.flush().catch(() => undefined); }, this.delay);
  }
  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.running) return this.running;
    this.running = this.drain();
    try { await this.running; } finally { this.running = undefined; }
  }
  private async drain() {
    while (this.pending !== undefined) {
      const value = this.pending; this.pending = undefined;
      try { await this.write(value); }
      catch (error) { if (this.pending === undefined) this.pending = value; this.status('error'); throw error; }
    }
    this.status('saved');
  }
}
