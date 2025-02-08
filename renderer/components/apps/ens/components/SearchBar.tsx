// SearchBar.tsx
import { useState, FormEvent } from "react";
import { Form, InputGroup } from "react-bootstrap";
import { Search } from "lucide-react";
import styles from "./SearchBar.module.scss";

interface Props {
  onSearch: (query: string) => void;
}

export function SearchBar({ onSearch }: Props) {
  const [input, setInput] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSearch(input.trim().toLowerCase());
    }
  };

  return (
    <Form onSubmit={handleSubmit} className={styles.searchForm}>
      <InputGroup>
        <Form.Control
          type="text"
          placeholder="Search for ENS names (e.g., vitalik.eth)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className={styles.searchInput}
        />
        <button type="submit" className={styles.searchButton}>
          <Search size={20} />
        </button>
      </InputGroup>
    </Form>
  );
}
