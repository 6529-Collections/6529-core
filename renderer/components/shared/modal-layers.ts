export const AUTHENTICATION_MODAL_LAYER = 10_000;
export const WALLET_REQUEST_MODAL_LAYER = 10_010;

// Keep these as static Tailwind classes so the renderer build can discover
// them. The numeric exports make the ordering independently testable.
export const AUTHENTICATION_MODAL_OVERLAY_CLASS = "tw-z-[10000]";
export const WALLET_REQUEST_MODAL_OVERLAY_CLASS = "tw-z-[10010]";
