export const SHUTDOWN_STEP_TIMEOUT_MS = 10_000;

export async function runShutdownStepWithTimeout<T>(
  name: string,
  operation: () => Promise<T>,
  timeoutMs = SHUTDOWN_STEP_TIMEOUT_MS,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${name} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(), timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
