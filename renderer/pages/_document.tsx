import Document, {
  Html,
  Head,
  Main,
  NextScript,
  DocumentContext,
  DocumentProps,
} from "next/document";
import { AboutSection } from "./about/[section]";
import { SEIZE_API_URL } from "../../constants";
import { openInExternalBrowser } from "../helpers";

interface MyDocumentProps extends DocumentProps {
  pathname: string;
}

class MyDocument extends Document<MyDocumentProps> {
  static async getInitialProps(ctx: DocumentContext) {
    const initialProps = await Document.getInitialProps(ctx);
    const pathname = ctx.pathname;
    return { ...initialProps, pathname };
  }

  render() {
    const { pathname } = this.props as { pathname: string };
    const hideFooter = pathname === "/app-wallet";

    return (
      <Html lang="en">
        <Head>
          <meta name="description" content="6529 SEIZE" />
          <link rel="icon" href="/favicon.ico" />
          <link rel="preconnect" href={SEIZE_API_URL} />
          <link rel="preconnect" href="https://d3lqz0a4bldqgf.cloudfront.net" />
          <link rel="preload" href="/metamask.svg" as="image" />
          <link rel="preload" href="/walletconnect.svg" as="image" />
          <link rel="preload" href="/coinbase.svg" as="image" />
          <link rel="preload" href="/chrome.svg" as="image" />
          <link rel="preload" href="/safe.svg" as="image" />
          <link rel="preload" href="/firefox.svg" as="image" />
          <link rel="preload" href="/brave.svg" as="image" />
          <link rel="preload" href="/rabby.png" as="image" />
        </Head>
        <body>
          <Main />
          <NextScript />
          {!hideFooter && (
            <footer
              className="d-flex flex-column align-items-center justify-content-center gap-2"
              id="footer">
              <span className="d-flex align-items-center justify-content-center flex-wrap gap-2">
                <a
                  href="#"
                  onClick={() =>
                    openInExternalBrowser("https://twitter.com/punk6529")
                  }>
                  <img
                    width="0"
                    height="0"
                    style={{ height: "18px", width: "auto" }}
                    src="/twitter.png"
                    alt="punk6529 Twitter"
                  />{" "}
                  &#64;punk6529
                </a>
                |
                <a
                  href="#"
                  onClick={() =>
                    openInExternalBrowser("https://twitter.com/6529Collections")
                  }>
                  <img
                    width="0"
                    height="0"
                    style={{ height: "18px", width: "auto" }}
                    src="/twitter.png"
                    alt="6529Collections Twitter"
                  />{" "}
                  &#64;6529Collections
                </a>
                |
                <a
                  href="#"
                  onClick={() =>
                    openInExternalBrowser("https://discord.gg/join-om")
                  }>
                  <img
                    width="0"
                    height="0"
                    style={{ height: "18px", width: "auto" }}
                    src="/discord.png"
                    alt="OM Discord"
                  />{" "}
                  OM Discord
                </a>
                |
                <a
                  href="#"
                  onClick={() => openInExternalBrowser("https://6529.io")}>
                  <img
                    width="0"
                    height="0"
                    style={{ height: "18px", width: "auto" }}
                    src="/Seize_Logo_2.png"
                    alt="6529.io"
                  />{" "}
                  6529.io
                </a>
                |
                <a
                  href="#"
                  onClick={() =>
                    openInExternalBrowser("https://github.com/6529-Collections")
                  }>
                  <img
                    width="0"
                    height="0"
                    style={{ height: "18px", width: "auto" }}
                    src="/github_w.png"
                    alt="6529-Collections"
                  />{" "}
                  6529-Collections
                </a>
              </span>
              <span className="d-flex align-items-center justify-content-center flex-wrap gap-2">
                <a href={`/about/${AboutSection.TERMS_OF_SERVICE}`}>
                  Terms of Service
                </a>
                |{" "}
                <a href={`/about/${AboutSection.PRIVACY_POLICY}`}>
                  Privacy Policy
                </a>
                | <a href={`/about/${AboutSection.COPYRIGHT}`}>Copyright</a>|{" "}
                <a href={`/about/${AboutSection.COOKIE_POLICY}`}>
                  Cookie Policy
                </a>
                | <a href={`/about/${AboutSection.LICENSE}`}>License</a>|{" "}
                <a
                  href="#"
                  onClick={() =>
                    openInExternalBrowser("https://api.seize.io/docs")
                  }>
                  API Documentation
                </a>
                |{" "}
                <a
                  href="#"
                  onClick={() =>
                    openInExternalBrowser("https://status.seize.io/")
                  }>
                  Status
                </a>
              </span>
            </footer>
          )}
        </body>
      </Html>
    );
  }
}

export default MyDocument;
