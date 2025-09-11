"use client";

import { faExternalLinkAlt } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";
import { NavDropdown } from "react-bootstrap";
import { HeaderLink } from "./Header";
import styles from "./Header.module.scss";

export default function HeaderDesktopLink({
  link,
}: {
  readonly link: HeaderLink;
  readonly disabled?: boolean;
}) {
  return (
    <NavDropdown.Item as="div" className="tw-h-full">
      <Link
        href={link.path}
        target={link.isExternal ? "_blank" : undefined}
        rel={link.isExternal ? "noopener noreferrer" : undefined}
        passHref
        className="tw-no-underline tw-h-full tw-w-full tw-p-0 tw-m-0 tw-inline-flex tw-justify-between tw-items-center">
        {link.name}
        {link.isNew && <span className={styles.new}>new</span>}
        {link.isExternal && (
          <FontAwesomeIcon
            icon={faExternalLinkAlt}
            className="tw-ml-2 tw-w-4 tw-h-4"
          />
        )}
      </Link>
    </NavDropdown.Item>
  );
}
