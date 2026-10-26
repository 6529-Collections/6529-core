import type { ReactNode } from "react";
import {
  NETWORK_PAGE_TITLE_CLASSES,
  NETWORK_REFERENCE_SECTION_HEADING_CLASSES,
} from "@/components/network/networkPageLayoutClasses";

interface HeadingProps {
  readonly children: ReactNode;
  readonly id?: string;
}

/** Scope only the heading so legacy global h2 rules cannot override FE tokens. */
export function DesktopPageHeading({ children, id }: HeadingProps) {
  return (
    <div className="tailwind-scope">
      <h1 id={id} className={NETWORK_PAGE_TITLE_CLASSES}>
        {children}
      </h1>
    </div>
  );
}

export function DesktopSectionHeading({ children, id }: HeadingProps) {
  return (
    <div className="tailwind-scope">
      <h2 id={id} className={NETWORK_REFERENCE_SECTION_HEADING_CLASSES}>
        {children}
      </h2>
    </div>
  );
}
