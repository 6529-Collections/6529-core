"use client";

import styles from "./LogsViewer.module.scss";
import React, { useEffect, useState, useRef, UIEvent } from "react";
import { LogLine } from "@/shared/types";
import { Accordion, Button, useAccordionButton } from "react-bootstrap";

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

function LogsViewerToggle({
  width,
  children,
  eventKey,
  isOpen,
  onClick,
}: {
  width: number | string;
  children: React.ReactNode;
  eventKey: string;
  isOpen: boolean;
  onClick?: () => void;
}) {
  const decoratedOnClick = useAccordionButton(eventKey);

  return (
    <Accordion.Button
      style={{ maxWidth: width, flex: "1" }}
      className={`pt-3 pb-3 ${isOpen ? styles.accordionButtonOpen : ""}`}
      onClick={(e) => {
        decoratedOnClick(e);
        onClick?.();
      }}>
      {children}
    </Accordion.Button>
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

  return (
    <Accordion
      onSelect={(eventKey) => setSelectedAccordionKey(eventKey as string)}>
      <div className="d-flex align-items-center gap-2">
        {extraActions?.map((action, index) => (
          <LogsViewerToggle
            key={action.name}
            width={width}
            eventKey={index.toString()}
            isOpen={selectedAccordionKey === index.toString()}>
            <b>{action.name}</b>
          </LogsViewerToggle>
        ))}
        <LogsViewerToggle
          width={width}
          eventKey={(extraActions?.length ?? 0).toString()}
          isOpen={
            selectedAccordionKey === (extraActions?.length ?? 0).toString()
          }>
          <b>{name ?? "Logs"}</b>
        </LogsViewerToggle>
        {isLogsOpen && (
          <Button className="pt-2 pb-2 btn-grey" onClick={locateFile}>
            Locate
          </Button>
        )}
        {isLogsOpen && selectedText.length > 0 && (
          <Button
            className="pt-2 pb-2 btn-white"
            disabled={selectedText.length === 0 || isCopied}
            onClick={copySelectedText}>
            {isCopied ? "Selection Copied!" : "Copy Selection"}
          </Button>
        )}
      </div>
      {extraActions?.map((action, index) => (
        <Accordion.Collapse key={action.name} eventKey={index.toString()}>
          <div>{action.content}</div>
        </Accordion.Collapse>
      ))}
      <Accordion.Collapse eventKey={(extraActions?.length ?? 0).toString()}>
        <LogsViewerInternal
          filePath={filePath}
          height={height}
          onSelectionChange={setSelectedText}
          run={isLogsOpen}
        />
      </Accordion.Collapse>
    </Accordion>
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
        setFirstLineNumber(uniqueLines[0].id);
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

  const handleScroll = async (event: UIEvent<HTMLDivElement>) => {
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
      className="mt-2"
      style={{ position: "relative", height: `${height}vh` }}>
      <div
        ref={containerRef}
        style={{
          height: "100%",
          overflowY: "scroll",
          backgroundColor: "#000",
          color: "#fff",
          padding: "10px",
          position: "relative",
        }}
        onScroll={handleScroll}
        onMouseUp={handleSelection}
        onKeyUp={handleSelection}>
        {lines.map((line) => (
          <div
            key={line.id}
            style={{ whiteSpace: "pre-wrap", fontFamily: "monospace" }}>
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
