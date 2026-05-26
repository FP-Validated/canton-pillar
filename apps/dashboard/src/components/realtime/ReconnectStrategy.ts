export class ReconnectStrategy {
  private attempt = 0;
  lastEventId: string | undefined;
  constructor(private readonly baseMs = 250, private readonly maxMs = 5000, private readonly random = Math.random) {}
  nextDelayMs() {
    const exp = Math.min(this.maxMs, this.baseMs * 2 ** this.attempt++);
    return Math.floor(exp / 2 + this.random() * exp / 2);
  }
  reset() { this.attempt = 0; }
  remember(id: string | undefined) { if (id) this.lastEventId = id; }
}
