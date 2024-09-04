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
    return (
      <Html lang="en">
        <Head>
          <meta name="description" content="6529 CORE" />
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
        </body>
      </Html>
    );
  }
}

export default MyDocument;
