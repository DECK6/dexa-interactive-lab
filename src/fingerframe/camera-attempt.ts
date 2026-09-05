/** getUserMedia cannot be aborted. Retain the lock until a cancelled attempt settles. */
export class CameraAttemptGate {
  private revision = 0
  private pending: number | null = null
  get busy(): boolean { return this.pending !== null }
  begin(): number | null {
    if (this.busy) return null
    this.pending = ++this.revision
    return this.pending
  }
  accepts(attempt: number): boolean { return this.pending === attempt && this.revision === attempt }
  cancel(): void { this.revision++ }
  finish(attempt: number): void { if (this.pending === attempt) this.pending = null }
}
