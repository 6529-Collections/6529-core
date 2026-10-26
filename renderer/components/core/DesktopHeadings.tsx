import type { ReactNode } from "react";
import { NETWORK_PAGE_TITLE_CLASSES } from "@/components/network/networkPageLayoutClasses";

interface HeadingProps {
  readonly children: ReactNode;
  readonly id?: string;
}

/** Apply FE Network typography only to Desktop page titles. */
export function DesktopPageHeading({ children, id }: HeadingProps) {
  return (
    <div className="tailwind-scope">
      <h1 id={id} className={NETWORK_PAGE_TITLE_CLASSES}>
        {children}
      </h1>
    </div>
  );
}
