import { useEffect, useRef } from "react";
import { useSearch } from "../../../contexts/SearchContext";

export default function SearchBar() {
  const { isOpen, open, close, query, setQuery, total, current, next, prev } =
    useSearch();

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      console.log("cmdOrCtrl", cmdOrCtrl);

      if (cmdOrCtrl && e.key.toLowerCase() === "f") {
        e.preventDefault();
        open();
      } else if (e.key === "Escape") {
        close();
      } else if (e.key === "Enter") {
        if (e.shiftKey) prev();
        else next();
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, close, next, prev]);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  console.log("isOpen", isOpen);

  return (
    <div className="tw-fixed tw-top-[30px] tw-right-4 tw-z-[1001] tw-bg-neutral-900 tw-text-white tw-rounded-bl-lg tw-px-3 tw-py-2 tw-flex tw-items-center tw-gap-2 tw-shadow-xl">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="tw-bg-neutral-800 tw-text-white tw-border tw-border-neutral-600 tw-rounded-md tw-px-2 tw-py-1 tw-text-sm tw-w-[180px] focus:tw-outline-none focus:tw-border-white"
        placeholder="Find..."
      />
      <span className="tw-text-xs tw-tabular-nums tw-min-w-[48px] tw-text-center">
        <span className={total > 0 ? "" : "tw-invisible"}>
          {total > 0 ? `${current + 1} / ${total}` : "0 / 0"}
        </span>
      </span>
      <button onClick={prev}>↑</button>
      <button onClick={next}>↓</button>
      <button onClick={close}>✕</button>
    </div>
  );
}
