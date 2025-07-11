import { useEffect, useState } from "react";
import styles from "@/styles/Home.module.scss";

import { useRouter } from "next/router";
import { LoginImage } from "./access";
import { useSetTitle } from "@/contexts/TitleContext";
import { getStagingAuth } from "@/services/auth/auth.utils";
import { SEIZE_API_URL } from "@/electron-constants";

export default function Access() {
  useSetTitle("Restricted");
  const router = useRouter();
  const [image, setImage] = useState();
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!image && router.isReady) {
      const apiAuth = getStagingAuth();
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
  );
}

Access.metadata = {
  title: "Restricted",
};
