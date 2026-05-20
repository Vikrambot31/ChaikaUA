export class SafePromiseTimeoutError extends Error {
  readonly source: string;
  readonly timeoutMs: number;

  constructor(source: string, timeoutMs: number) {
    super(`Timed out after ${timeoutMs}ms: ${source}`);
    this.name = 'SafePromiseTimeoutError';
    this.source = source;
    this.timeoutMs = timeoutMs;
  }
}

export const isSafePromiseTimeoutError = (value: unknown): value is SafePromiseTimeoutError =>
  value instanceof SafePromiseTimeoutError;

export const safePromiseTimeout = <T>(
  promise: Promise<T>,
  timeoutMs: number,
  source: string,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new SafePromiseTimeoutError(source, timeoutMs));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
