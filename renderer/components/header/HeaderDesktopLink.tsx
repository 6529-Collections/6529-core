import { NavDropdown } from "react-bootstrap";
import { useRouter } from "next/router";
import styles from "./Header.module.scss";
import { HeaderLink } from "./Header";
import Link from "next/link";

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
        passHref
        className="tw-no-underline tw-h-full tw-w-full tw-p-0 tw-m-0 tw-inline-flex tw-justify-between">
        {link.name}
        {link.isNew && <span className={styles.new}>new</span>}
      </Link>
    </NavDropdown.Item>
  );
}
