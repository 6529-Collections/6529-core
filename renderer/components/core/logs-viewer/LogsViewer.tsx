"use client";

import { LogLine } from "@/shared/types";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import React, { UIEvent, useEffect, useRef, useState } from "react";

interface LogsViewerProps {
  filePath: string;
  name?: string;
  height?: number;
  width?: number | string;
  extraActions?: {
    name: string;
    content: React.ReactNode;
  }[];
}

function LogsViewerTrigger({
  width,
  children,
  isOpen,
  onSelect,
  summaryStyle = false,
}: {
  width: number | string;
  children: React.ReactNode;
  isOpen: boolean;
  onSelect: () => void;
  summaryStyle?: boolean;
}) {
  const summaryClasses =
    "tw-rounded-t-xl tw-border-0 tw-ring-0 tw-bg-iron-950 tw-px-4 tw-py-3 tw-font-medium tw-transition-colors desktop-hover:hover:tw-bg-iron-900 " +
    (isOpen ? "tw-min-w-0 tw-flex-1" : "tw-w-full");
  const defaultClasses =
    "tw-flex tw-min-w-0 tw-flex-1 tw-cursor-pointer tw-items-center tw-gap-2 tw-rounded-xl tw-border-0 tw-px-4 tw-py-3 tw-text-left tw-font-medium tw-text-inherit tw-ring-1 tw-ring-inset tw-ring-iron-800 tw-transition-colors focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-inset focus-visible:tw-ring-iron-500";
  const stateClasses = summaryStyle
    ? isOpen
      ? "tw-bg-iron-900"
      : ""
    : isOpen
      ? "tw-bg-iron-900"
      : "tw-bg-black desktop-hover:hover:tw-bg-iron-900";
  return (
    <button
      type="button"
      style={summaryStyle ? undefined : { maxWidth: width }}
      className={`tw-flex tw-cursor-pointer tw-items-center tw-gap-2 tw-text-left tw-text-inherit focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-inset focus-visible:tw-ring-iron-500 ${summaryStyle ? summaryClasses : defaultClasses} ${stateClasses}`}
      onClick={onSelect}
    >
      <ChevronRightIcon
        className={`tw-size-4 tw-shrink-0 tw-text-inherit tw-transition-transform ${isOpen ? "tw-rotate-90" : ""}`}
      />
      <span className="tw-truncate">{children}</span>
    </button>
  );
}

export default function LogsViewer({
  filePath,
  name,
  height = 30,
  width = 250,
  extraActions,
}: LogsViewerProps) {
  const [selectedText, setSelectedText] = useState<string>("");
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const [selectedAccordionKey, setSelectedAccordionKey] = useState<string>("");

  const [isLogsOpen, setIsLogsOpen] = useState<boolean>(false);

  const locateFile = () => {
    window.api.showFile(filePath);
  };

  const copySelectedText = () => {
    navigator.clipboard.writeText(selectedText);
    setIsCopied(true);
    setTimeout(() => {
      setIsCopied(false);
    }, 1000);
  };

  useEffect(() => {
    if (selectedAccordionKey === (extraActions?.length ?? 0).toString()) {
      setIsLogsOpen(true);
    } else {
      setIsLogsOpen(false);
    }
  }, [selectedAccordionKey]);

  const logsKey = (extraActions?.length ?? 0).toString();

  const summaryOnly = !extraActions?.length;
  return (
    <div className="tw-rounded-xl tw-border tw-border-iron-800 tw-bg-iron-950 tw-text-iron-100 [color-scheme:dark]">
      <div
        className={`tw-flex tw-items-center tw-gap-2 tw-bg-iron-950 ${summaryOnly ? "tw-flex-nowrap tw-rounded-t-xl" : "tw-flex-wrap"}`}
      >
        {extraActions?.map((action, index) => (
          <LogsViewerTrigger
            key={action.name}
            width={width}
            isOpen={selectedAccordionKey === index.toString()}
            onSelect={() =>
              setSelectedAccordionKey((k) =>
                k === index.toString() ? "" : index.toString()
              )
            }
          >
            <b>{action.name}</b>
          </LogsViewerTrigger>
        ))}
        <LogsViewerTrigger
          width={width}
          isOpen={selectedAccordionKey === logsKey}
          onSelect={() =>
            setSelectedAccordionKey((k) => (k === logsKey ? "" : logsKey))
          }
          summaryStyle={!extraActions?.length}
        >
          <b>{name ?? "Logs"}</b>
        </LogsViewerTrigger>
        {isLogsOpen && (
          <button
            type="button"
            onClick={locateFile}
            className="tw-cursor-pointer tw-rounded-lg tw-border-0 tw-bg-iron-800 tw-py-2 tw-px-3 tw-text-sm tw-text-iron-100 focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-iron-500 desktop-hover:hover:tw-bg-iron-700"
          >
            Locate
          </button>
        )}
        {isLogsOpen && selectedText.length > 0 && (
          <button
            type="button"
            disabled={selectedText.length === 0 || isCopied}
            onClick={copySelectedText}
            className="tw-cursor-pointer tw-rounded-lg tw-border-0 tw-bg-white tw-py-2 tw-px-3 tw-text-sm tw-text-black focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-iron-500 disabled:tw-opacity-50 desktop-hover:hover:tw-bg-iron-100"
          >
            {isCopied ? "Selection Copied!" : "Copy Selection"}
          </button>
        )}
      </div>
      {extraActions?.map((action, index) =>
        selectedAccordionKey === index.toString() ? (
          <div key={action.name} className="tw-overflow-hidden tw-rounded-b-xl tw-bg-iron-950 tw-py-4">
            {action.content}
          </div>
        ) : null
      )}
      {selectedAccordionKey === logsKey && (
        <div className="tw-overflow-hidden tw-rounded-b-xl tw-bg-iron-950 tw-px-4 tw-pb-4 tw-pt-2">
          <LogsViewerInternal
            filePath={filePath}
            height={height}
            onSelectionChange={setSelectedText}
            run={isLogsOpen}
          />
        </div>
      )}
    </div>
  );
}

export function LogsViewerInternal({
  filePath,
  height = 15,
  onSelectionChange,
  run,
}: {
  filePath: string;
  height?: number;
  onSelectionChange: (selectedText: string) => void;
  run: boolean;
}) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [firstLineNumber, setFirstLineNumber] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const isFetching = useRef<boolean>(false);
  const shouldAutoScroll = useRef<boolean>(false);
  const lineIdsSet = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!run) return;

    lineIdsSet.current.clear();

    // Fetch the last 20 lines on initial load
    window.api.getLastLines(filePath, 20).then(({ lines: initialLines }) => {
      lineIdsSet.current = new Set();
      // Filter out duplicates (should not be any on initial load)
      const uniqueLines = initialLines.filter((line) => {
        if (lineIdsSet.current.has(line.id)) {
          return false;
        } else {
          lineIdsSet.current.add(line.id);
          return true;
        }
      });

      setLines(uniqueLines);
      if (uniqueLines.length > 0) {
        setFirstLineNumber(uniqueLines[0]?.id ?? 0);
      } else {
        setFirstLineNumber(0);
      }

      // Scroll to the bottom after loading
      setTimeout(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
      }, 0);
    });

    // Start tailing the file for real-time updates
    window.api.startTail(filePath);

    // Listen for new lines
    window.api.onTailLine((logFilePath, newLine) => {
      if (logFilePath !== filePath) {
        return;
      }

      if (lineIdsSet.current.has(newLine.id)) {
        // Duplicate line, do not add
        return;
      } else {
        lineIdsSet.current.add(newLine.id);
      }

      // Check if the user is near the bottom before auto-scrolling
      if (containerRef.current) {
        const { scrollHeight, scrollTop, clientHeight } = containerRef.current;
        const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);

        const threshold = 50;

        shouldAutoScroll.current = distanceFromBottom <= threshold;
      } else {
        shouldAutoScroll.current = false;
      }

      setLines((prevLines) => [...prevLines, newLine]);
    });

    return () => {
      // Cleanup on unmount
      window.api.stopTail(filePath);
      lineIdsSet.current.clear();
    };
  }, [filePath, run]);

  useEffect(() => {
    // Adjust scroll position after lines update
    if (shouldAutoScroll.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      shouldAutoScroll.current = false;
    }
  }, [lines]);

  const handleScroll = async (_event: UIEvent<HTMLDivElement>) => {
    if (!containerRef.current || isFetching.current) {
      return;
    }

    const { scrollTop } = containerRef.current;

    // Define a threshold (e.g., 100 pixels)
    const threshold = 100;

    if (scrollTop <= threshold) {
      isFetching.current = true;
      // User scrolled near the top, load more lines
      const numLinesToFetch = 20;
      const newFirstLineNumber = Math.max(0, firstLineNumber - numLinesToFetch);
      const linesToFetch = firstLineNumber - newFirstLineNumber;

      const result = await window.api.getPreviousLines(
        filePath,
        newFirstLineNumber,
        linesToFetch
      );
      if (result.lines.length > 0) {
        // Filter out duplicates
        const uniqueLines = result.lines.filter((line) => {
          if (lineIdsSet.current.has(line.id)) {
            return false;
          } else {
            lineIdsSet.current.add(line.id);
            return true;
          }
        });

        // Remember the scroll position before adding new lines
        const previousScrollHeight = containerRef.current.scrollHeight;

        setLines((prevLines) => [...uniqueLines, ...prevLines]);
        setFirstLineNumber(newFirstLineNumber);

        // Adjust the scroll position to maintain the user's position
        setTimeout(() => {
          if (containerRef.current) {
            const newScrollHeight = containerRef.current.scrollHeight;
            containerRef.current.scrollTop =
              newScrollHeight - previousScrollHeight + scrollTop;
          }
        }, 0);
      } else {
        // No more lines to fetch
        console.log("Reached the beginning of the file.");
      }

      isFetching.current = false;
    }
  };

  const handleSelection = () => {
    const selection = window.getSelection();
    if (!selection) {
      onSelectionChange("");
      return;
    }

    const container = containerRef.current;
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (container && container.contains(range.commonAncestorContainer)) {
        onSelectionChange(selection.toString());
      } else {
        onSelectionChange("");
      }
    } else {
      onSelectionChange("");
    }
  };

  return (
    <div
      className="tw-mt-2"
      style={{ position: "relative", height: `${height}vh` }}
    >
      <div
        ref={containerRef}
        className="tw-rounded-lg tw-ring-1 tw-ring-inset tw-ring-iron-800"
        style={{
          height: "100%",
          overflowY: "scroll",
          backgroundColor: "#000",
          color: "#fff",
          padding: "16px",
          position: "relative",
        }}
        onScroll={handleScroll}
        onMouseUp={handleSelection}
        onKeyUp={handleSelection}
      >
        {lines.map((line) => (
          <div
            key={line.id}
            style={{ whiteSpace: "pre-wrap", fontFamily: "monospace" }}
          >
            {line.content}
          </div>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "35px",
          background: "linear-gradient(to bottom, #000, transparent)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
