/** Plain data survives both ipcRenderer.invoke and contextBridge serialization. */
export interface NativeAuthFailure {
  readonly kind: "native-auth-api-error";
  readonly status: number;
  readonly message: string;
  readonly retryAfter?: string;
}

export type NativeAuthResult<T> = T | NativeAuthFailure;

/** Main-process HTTP failure whose allowed fields can be serialized explicitly. */
export class NativeAuthApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfter?: string,
  ) {
    super(message);
  }
}

/** Transport HTTP failures as data; preserve successes and non-API rejections. */
export async function serializeNativeAuthResult<T>(
  request: () => Promise<T>,
): Promise<NativeAuthResult<T>> {
  try {
    return await request();
  } catch (error) {
    if (!(error instanceof NativeAuthApiError)) throw error;
    // Never transport the request, raw response body, credentials or stack.
    return {
      kind: "native-auth-api-error",
      status: error.status,
      message: error.message,
      ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
    };
  }
}

/** Reconstruct status-aware errors in the renderer after Electron serialization. */
export function unwrapNativeAuthResult<T>(result: NativeAuthResult<T>): T {
  if (
    typeof result === "object" &&
    result !== null &&
    "kind" in result &&
    result.kind === "native-auth-api-error"
  ) {
    const failure = result as NativeAuthFailure;
    // Construct the error in the renderer, after crossing contextBridge.
    throw Object.assign(new Error(failure.message), {
      status: failure.status,
      headers: new Headers(
        failure.retryAfter ? { "Retry-After": failure.retryAfter } : {},
      ),
    });
  }
  return result as T;
}
