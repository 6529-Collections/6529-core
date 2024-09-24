import { NavDropdown } from "react-bootstrap";
import styles from "./Header.module.scss";
import Link from "next/link";
import { HeaderLink } from "./Header";

export default function HeaderDesktopLink({
  link,
  disabled,
}: {
  readonly link: HeaderLink;
  readonly disabled?: boolean;
}) {
  return (
    <NavDropdown.Item className="tw-h-full" disabled={disabled}>
      <Link
        className="tw-no-underline tw-h-full tw-w-full tw-p-0 tw-m-0"
        href={link.path}
        passHref>
        <div className="tw-no-underline tw-h-full tw-w-full tw-p-0 tw-m-0 tw-inline-flex tw-justify-between">
          <span className={disabled ? "font-color-h" : "font-color"}>
            {link.name}
          </span>
          {link.isNew && <span className={styles.new}>new</span>}
        </div>
      </Link>
    </NavDropdown.Item>
  );
}
