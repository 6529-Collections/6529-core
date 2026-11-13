import type { DesktopProfileState } from "@/shared/desktop-profile-state";

let initialization: Promise<void> | null = null;
let initialized = false;
let unsavedState: DesktopProfileState | null = null;
let saveAttempt: Promise<void> | null = null;
type SaveStatus = "idle" | "failed" | "retrying";
let saveStatus: SaveStatus = "idle";
const listeners = new Set<() => void>();

function setSaveStatus(status: SaveStatus): void {
  if (saveStatus === status) return;
  saveStatus = status;
  listeners.forEach((listener) => listener());
}

export const getDesktopProfileSaveStatus = (): SaveStatus => saveStatus;
export const getDesktopProfileServerSaveStatus = (): SaveStatus => "idle";
export function subscribeDesktopProfileSaveStatus(
  listener: () => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Retry the latest complete snapshot, never an older pre-logout state. */
export function retryDesktopProfileSave(): Promise<void> {
  const save = globalThis.window?.nativeAuth?.saveProfiles;
  if (!initialized || !save || !unsavedState) return Promise.resolve();
  if (saveAttempt) return saveAttempt;
  if (saveStatus === "failed") setSaveStatus("retrying");
  saveAttempt = Promise.resolve()
    .then(async () => {
      while (unsavedState) {
        const state = unsavedState;
        await save(state);
        // Newer mutations supersede this full snapshot. Only clear the exact
        // snapshot acknowledged by main, then drain the latest pending state.
        if (unsavedState === state) unsavedState = null;
      }
      setSaveStatus("idle");
      return undefined;
    })
    .catch((error: unknown) => {
      setSaveStatus("failed");
      throw error;
    })
    .finally(() => {
      saveAttempt = null;
      // A subscriber can enqueue a new mutation as the completed save reports
      // success. Drain that state too, without looping on persistence failures.
      if (unsavedState && saveStatus !== "failed") {
        void retryDesktopProfileSave().catch(() =>
          console.error("Could not persist Desktop profiles")
        );
      }
    });
  return saveAttempt;
}

/** Reveal the main window only after a committed ready or failure screen. */
export function notifyDesktopProfilesReady(): void {
  void globalThis.window?.nativeAuth?.profilesReady?.().catch(() => {
    console.error("Could not announce Desktop profile readiness");
  });
}

export async function restartDesktopProfileRestore(): Promise<void> {
  const restart = globalThis.window?.nativeAuth?.restartProfileRestore;
  if (!restart) throw new Error("Desktop profile restart is unavailable");
  await restart();
}

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
  unsavedState = state;
  void retryDesktopProfileSave().catch(() =>
    console.error("Could not persist Desktop profiles")
  );
}
