export function throwIfCancelled(signal) {
  if (signal?.aborted) throw new Error('MEASUREMENT_CANCELLED');
}

// Reserve before joining the command queue, so another popup cannot enqueue
// a duplicate test and Disconnect can cancel even a not-yet-started one.
export class MeasurementJob {
  constructor(notify = async () => {}) { this.notify = notify; this.current = null; }
  snapshot() {
    const job = this.current;
    return job ? { kind: job.kind, stage: job.stage, completed: job.completed,
      total: job.total, pendingRegions: job.pendingRegions, cancelling: job.abort.signal.aborted } : null;
  }
  start(kind) {
    if (this.current) throw new Error('MEASUREMENT_BUSY');
    const job = { kind, stage: 'queued', completed: 0, total: 0, abort: new AbortController(), restoreAbort: new AbortController(), disconnect: false };
    this.current = job;
    void this.notify().catch(() => {});
    return job;
  }
  cancel(disconnect = false) {
    if (!this.current) return;
    this.current.disconnect ||= disconnect;
    this.current.abort.abort();
    if (disconnect) this.current.restoreAbort.abort();
    void this.notify().catch(() => {});
  }
  async run(job, work) {
    try {
      throwIfCancelled(job.abort.signal);
      return await work({ signal: job.abort.signal, restoreSignal: job.restoreAbort.signal, shouldRestore: () => !job.disconnect,
        onProgress: async progress => {
          Object.assign(job, progress);
          await this.notify().catch(() => {});
        } });
    } catch (error) {
      if (job.abort.signal.aborted && error?.name === 'AbortError') throw new Error('MEASUREMENT_CANCELLED');
      throw error;
    } finally {
      if (this.current === job) this.current = null;
      await this.notify().catch(() => {});
    }
  }
}
