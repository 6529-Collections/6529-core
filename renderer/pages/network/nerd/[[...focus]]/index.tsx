import Head from "next/head";
import styles from "../../../../styles/Home.module.scss";
import Breadcrumb, {
  Crumb,
} from "../../../../components/breadcrumb/Breadcrumb";
import { Container, Row, Col } from "react-bootstrap";
import dynamic from "next/dynamic";
import HeaderPlaceholder from "../../../../components/header/HeaderPlaceholder";
import { LeaderboardFocus } from "../../../../components/leaderboard/Leaderboard";
import { useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { AuthContext } from "../../../../components/auth/Auth";
import { SEIZE_URL } from "../../../../../constants";

const Leaderboard = dynamic(
  () => import("../../../../components/leaderboard/Leaderboard"),
  { ssr: false }
);

const Header = dynamic(() => import("../../../../components/header/Header"), {
  ssr: false,
  loading: () => <HeaderPlaceholder />,
});

export default function CommunityNerdPage(props: any) {
  const { setTitle, title } = useContext(AuthContext);
  const router = useRouter();
  const [focus, setFocus] = useState<LeaderboardFocus>(props.pageProps.focus);
  const [breadcrumbs, setBreadcrumbs] = useState<Crumb[]>([]);

  useEffect(() => {
    setBreadcrumbs([
      { display: "Home", href: "/" },
      { display: "Network", href: "/network" },
      { display: `Nerd - ${focus}` },
    ]);

    let path = "/network/nerd";
    if (focus === LeaderboardFocus.INTERACTIONS) {
      path += "/interactions";
    } else {
      path += "/cards-collected";
    }
    router.replace(
      {
        pathname: path,
      },
      undefined,
      { shallow: true }
    );
  }, [focus]);

  useEffect(() => {
    const title = focus ? `Network | ${focus}` : "Network";
    setTitle({ title });
  }, [focus]);

  return (
    <>
      <Head>
        <title>{title}</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="6529 CORE" />
        <meta property="og:url" content={`${SEIZE_URL}/network/nerd`} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content="6529 CORE" />
        <meta property="og:image" content={`${SEIZE_URL}/6529io.png`} />
      </Head>

      <main className={styles.main}>
        <Header />
        <Breadcrumb breadcrumbs={breadcrumbs} />
        <Container fluid>
          <Row>
            <Col>
              <Leaderboard focus={focus} setFocus={setFocus} />
            </Col>
          </Row>
        </Container>
      </main>
    </>
  );
}

export async function getServerSideProps(req: any, res: any, resolvedUrl: any) {
  const focusPath = req.query.focus?.[0];
  let focus = LeaderboardFocus.TDH;
  if (focusPath === "interactions") {
    focus = LeaderboardFocus.INTERACTIONS;
  }

  return {
    props: {
      focus,
    },
  };
}
