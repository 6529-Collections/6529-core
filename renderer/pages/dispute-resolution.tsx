import Head from "next/head";
import styles from "../styles/Home.module.scss";
import dynamic from "next/dynamic";
import HeaderPlaceholder from "../components/header/HeaderPlaceholder";
import { Container, Row, Col } from "react-bootstrap";
import { AboutSection } from "./about/[section]";
import { useContext, useEffect } from "react";
import { AuthContext } from "../components/auth/Auth";
import { SEIZE_URL } from "../../constants";

const Header = dynamic(() => import("../components/header/Header"), {
  ssr: false,
  loading: () => <HeaderPlaceholder />,
});

export default function DisputeResolution() {
  const { setTitle, title } = useContext(AuthContext);
  useEffect(() => {
    setTitle({
      title: "Dispute Resolution | 6529 SEIZE",
    });
  }, []);

  return (
    <>
      <Head>
        <title>{title}</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="Dispute Resolution | 6529 CORE" />
        <meta property="og:url" content={`${SEIZE_URL}/dispute-resolution`} />
        <meta property="og:title" content="Dispute Resolution" />
        <meta property="og:description" content="6529 CORE" />
        <meta
          property="og:image"
          content={`${SEIZE_URL}/Seize_Logo_Glasses_2.png`}
        />
      </Head>

      <main className={styles.main}>
        <Header />
        <Container>
          <Row className="pt-4 pb-4">
            <Col>
              <h1>
                <span className="font-lightest">Dispute</span> Resolution
              </h1>
            </Col>
          </Row>
          <Row>
            <Col>
              <p>
                Dispute resolution for disputes relating to the Terms shall
                occur through JAMS, an arbitration organization, under the terms
                noted below, which shall be considered part of the Terms.
              </p>
              <br />
              <ol>
                <li>
                  Any dispute, claim or controversy arising out of or relating
                  to this Agreement or the breach, termination, enforcement,
                  interpretation or validity thereof, including the
                  determination of the scope or applicability of this agreement
                  to arbitrate, shall be determined by arbitration in Manhattan
                  County before one arbitrator. The arbitration shall be
                  administered by JAMS pursuant to JAMS&apos; Streamlined
                  Arbitration Rules and Procedures. Judgment on the Award may be
                  entered in any court having jurisdiction. This clause shall
                  not preclude parties from seeking provisional remedies in aid
                  of arbitration from a court of appropriate jurisdiction.
                </li>
                <br />
                <li>
                  The parties shall maintain the confidential nature of the
                  arbitration proceeding and the Award, including the Hearing,
                  except as may be necessary to prepare for or conduct the
                  arbitration hearing on the merits, or except as may be
                  necessary in connection with a court application for a
                  preliminary remedy, a judicial challenge to an Award or its
                  enforcement, or unless otherwise required by law or judicial
                  decision.
                </li>
                <br />
                <li>
                  This Agreement and the rights of the parties hereunder shall
                  be governed by and construed in accordance with the laws of
                  the State of New York, exclusive of conflict or choice of law
                  rules. The parties acknowledge that this Agreement evidences a
                  transaction involving interstate commerce. Notwithstanding the
                  provision in the preceding paragraph with respect to
                  applicable substantive law, any arbitration conducted pursuant
                  to the terms of this Agreement shall be governed by the
                  Federal Arbitration Act &#40;9 U.S.C., Secs. 1-16&#41;.
                </li>
                <br />
                <li>
                  In any arbitration arising out of or related to this
                  Agreement, the arbitrator&#40;s&#41; shall award to the
                  prevailing party, if any, the costs and attorneys&apos; fees
                  reasonably incurred by the prevailing party in connection with
                  the arbitration. If the arbitrator&#40;s&#41; determine a
                  party to be the prevailing party under circumstances where the
                  prevailing party won on some but not all of the claims and
                  counterclaims, the arbitrator&#40;s&#41; may award the
                  prevailing party an appropriate percentage of the costs and
                  attorneys&apos; fees reasonably incurred by the prevailing
                  party in connection with the arbitration.
                </li>
              </ol>
              <br />
              <p>
                <a href={`/about/${AboutSection.TERMS_OF_SERVICE}`}>
                  Back to Terms of Service
                </a>{" "}
              </p>
            </Col>
          </Row>
        </Container>
      </main>
    </>
  );
}
