"use client";

import { CORE_TITLEBAR_HEIGHT_PX } from "@/components/header/titlebar/titlebar.constants";
import { useSearch } from "@/contexts/SearchContext";
import {
  faArrowDown,
  faArrowUp,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useRef } from "react";

export default function SearchBar() {
  const { isOpen, open, close, query, setQuery, total, current, next, prev } =
    useSearch();

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
      }
    };
    window.addEventListener("keydown", handleKey);
    window.api.onOpenSearch(open);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.api.offOpenSearch(open);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="tw-fixed tw-right-4 tw-z-[1001] tw-max-w-[calc(100%-2rem)] tw-bg-neutral-900 tw-text-white tw-rounded-bl-lg tw-px-3 tw-py-2 tw-flex tw-items-center tw-gap-2 tw-shadow-xl"
      style={{ top: CORE_TITLEBAR_HEIGHT_PX }}
    >
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) prev();
            else next();
          } else if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
        }}
        placeholder="Find..."
        className="tw-bg-neutral-800 tw-text-white tw-border tw-border-neutral-600 tw-rounded-md tw-px-2 tw-py-1 tw-text-sm tw-w-[180px] tw-min-w-0 focus:tw-outline-none focus:tw-border-white tw-placeholder-gray-400"
      />
      <span className="tw-shrink-0 tw-text-xs tw-tabular-nums tw-min-w-[48px] tw-text-center">
        <span className={total > 0 ? "" : "tw-invisible"}>
          {`${current + 1} / ${total}`}
        </span>
      </span>
      <FontAwesomeIcon
        icon={faArrowUp}
        className="tw-shrink-0 tw-cursor-pointer tw-text-white hover:tw-text-gray-300"
        title="Previous"
        onClick={prev}
      />
      <FontAwesomeIcon
        icon={faArrowDown}
        className="tw-shrink-0 tw-cursor-pointer tw-text-white hover:tw-text-gray-300"
        title="Next"
        onClick={next}
      />
      <FontAwesomeIcon
        icon={faXmark}
        className="tw-shrink-0 tw-cursor-pointer tw-text-red-400 hover:tw-text-red-200 tw-ml-1"
        title="Close"
        onClick={close}
      />
    </div>
  );
}
