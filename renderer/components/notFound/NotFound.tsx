import Image from "next/image";

interface Props {
  title: string;
  links: {
    href: string;
    display: string;
  }[];
}

export default function NotFound(props: Readonly<Props>) {
  return (
    <div className="tw-pt-5 tw-text-center">
      <h4 className="tw-mb-0 tw-float-none">{props.title}</h4>
      <div>
        <Image
          width="0"
          height="0"
          style={{ height: "auto", width: "120px" }}
          src="/SummerGlasses.svg"
          alt="SummerGlasses"
        />
      </div>
      {props.links.map((link) => (
        <div className="tw-pt-3" key={`not-found-link-${link.href}`}>
          <a href={link.href}>{link.display}</a>
        </div>
      ))}
    </div>
  );
}
