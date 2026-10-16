/** Plain data survives both ipcRenderer.invoke and contextBridge serialization. */
export interface NativeAuthFailure {
  readonly kind: "native-auth-api-error";
  readonly status: number;
  readonly message: string;
  readonly retryAfter?: string;
}

export type NativeAuthResult<T> = T | NativeAuthFailure;

export class NativeAuthApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfter?: string,
  ) {
    super(message);
  }
}

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
