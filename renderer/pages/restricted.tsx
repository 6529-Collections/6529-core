import { useEffect, useState, useContext } from "react";
import styles from "../styles/Home.module.scss";
import Cookies from "js-cookie";
import { API_AUTH_COOKIE } from "../constants";
import { useRouter } from "next/router";
import Head from "next/head";
import { LoginImage } from "./access";
import { AuthContext } from "../components/auth/Auth";
import { SEIZE_API_URL, SEIZE_URL } from "../../constants";

export default function Access() {
  const { setTitle, title } = useContext(AuthContext);
  useEffect(() => {
    setTitle({
      title: "Restricted | 6529 CORE",
    });
  }, []);
  const router = useRouter();
  const [image, setImage] = useState();
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!image && router.isReady) {
      const apiAuth = Cookies.get(API_AUTH_COOKIE);
      fetch(`${SEIZE_API_URL}/api/`, {
        headers: apiAuth ? { "x-6529-auth": apiAuth } : {},
      }).then((r: any) => {
        r.json().then((response: any) => {
          setImage(response.image);
          if (r.status === 403) {
            const country = response.country;
            const msg = `Access from your country ${
              country ? `(${country}) ` : ""
            }is restricted`;
            setMessage(msg);
          } else {
            setMessage("Go to 6529.io");
          }
        });
      });
    }
  }, [router.isReady]);

  return (
    <>
      <Head>
        <title>{title}</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="Restricted | 6529 CORE" />
        <meta property="og:url" content={`${SEIZE_URL}/restricted`} />
        <meta property="og:title" content={`Restricted`} />
        <meta property="og:description" content="6529 CORE" />
        <meta property="og:image" content={`${SEIZE_URL}/6529io.png`} />
      </Head>
      <main className={styles.login}>
        {image && <LoginImage image={image} alt="access" />}
        <div className={styles.loginPrompt}>
          <input
            disabled={true}
            type="text"
            className="text-center"
            value={message}
          />
        </div>
      </main>
    </>
  );
}
