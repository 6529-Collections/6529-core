export type SanitizedNativeSessionResponse<
  T extends { readonly native_refresh_token: string },
> = Omit<T, "native_refresh_token"> & {
  readonly native_refresh_token: "";
};

export function sanitizeNativeSessionResponse<
  T extends { readonly native_refresh_token: string },
>(response: T): SanitizedNativeSessionResponse<T> {
  return {
    ...response,
    native_refresh_token: "",
  };
}
