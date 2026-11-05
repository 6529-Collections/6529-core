import type { DesktopProfileState } from "@/shared/desktop-profile-state";

let initialization: Promise<void> | null = null;
let initialized = false;
let pendingSave: Promise<unknown> = Promise.resolve();

export function initializeDesktopProfiles(
  current: DesktopProfileState,
  restore: (state: DesktopProfileState) => void
): Promise<void> {
  const bridge = globalThis.window?.nativeAuth;
  if (!bridge?.restoreProfiles) return Promise.resolve();
  initialization ??= bridge
    .restoreProfiles(current)
    .then((state) => {
      // Main has durably saved this exact state before returning it. Auth and
      // wallet providers mount only after this callback restores local storage.
      // Avoid a redundant IPC save while bootstrap itself applies that state.
      restore(state);
      initialized = true;
      return undefined;
    })
    .catch((error: unknown) => {
      initialization = null;
      throw error;
    });
  return initialization;
}

export function persistDesktopProfiles(state: DesktopProfileState): void {
  const save = globalThis.window?.nativeAuth?.saveProfiles;
  if (!initialized || !save) return;
  pendingSave = pendingSave.catch(() => undefined).then(() => save(state));
  void pendingSave.catch(() =>
    console.error("Could not persist Desktop profiles")
  );
}
