import { useEffect, useState } from "react";

const usePageTitle = (): string => {
  const [title, setTitle] = useState<string>("");

  useEffect(() => {
    const titleElement = document.querySelector("title");
    if (titleElement) {
      setTitle(titleElement.innerText);
    }
  }, []);

  return title;
};

export default usePageTitle;
