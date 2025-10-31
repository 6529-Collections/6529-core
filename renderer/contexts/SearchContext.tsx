"use client";

import Mark from "mark.js";
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";

interface SearchContextType {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  query: string;
  setQuery: (q: string) => void;
  total: number;
  current: number;
  next: () => void;
  prev: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const SearchContext = createContext<SearchContextType | null>(null);

export const useSearch = () => useContext(SearchContext)!;

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [query, setQuery] = useState("");
  const [total, setTotal] = useState(0);
  const [current, setCurrent] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const markInstance = useRef<Mark | null>(null);

  const [isOpen, setIsOpen] = useState(false);

  const open = () => setIsOpen(true);
  const close = () => {
    setIsOpen(false);
    setQuery("");
    setTotal(0);
    setCurrent(0);
    if (markInstance.current && containerRef.current) {
      markInstance.current.unmark();
    }
  };

  const performSearch = useCallback((q: string) => {
    console.log("performSearch", q, containerRef.current, "end");
    console.log("containerRef.current", containerRef.current);
    if (!containerRef.current) return;

    const context = containerRef.current;
    markInstance.current = new Mark(context);

    markInstance.current.unmark({
      done: () => {
        if (!q.trim()) {
          setTotal(0);
          return;
        }

        markInstance.current!.mark(q, {
          separateWordSearch: false,
          done: (count: number) => {
            setTotal(count);
            setCurrent(count > 0 ? 0 : -1);
            scrollToMatch(0);
          },
        });
      },
    });
  }, []);

  const scrollToMatch = (index: number) => {
    const matches = document.querySelectorAll("mark");
    matches.forEach((el) => el.classList.remove("tw-bg-yellow-400"));
    const el = matches[index] as HTMLElement;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("tw-bg-yellow-400");
    }
  };

  const next = () => {
    if (total <= 0) return;
    const nextIndex = (current + 1) % total;
    setCurrent(nextIndex);
    scrollToMatch(nextIndex);
  };

  const prev = () => {
    if (total <= 0) return;
    const prevIndex = (current - 1 + total) % total;
    setCurrent(prevIndex);
    scrollToMatch(prevIndex);
  };

  return (
    <SearchContext.Provider
      value={{
        isOpen,
        open,
        close,
        query,
        setQuery: (q) => {
          setQuery(q);
          performSearch(q);
        },
        total,
        current,
        next,
        prev,
        containerRef,
      }}>
      {children}
    </SearchContext.Provider>
  );
}
