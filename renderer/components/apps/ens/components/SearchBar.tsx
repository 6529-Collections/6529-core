// components/SearchBar.tsx
import { useState } from "react";
import { Form, InputGroup, Button } from "react-bootstrap";
import { Search } from "lucide-react";

interface SearchBarProps {
  onSearch: (query: string) => void;
}

export function SearchBar({ onSearch }: SearchBarProps) {
  const [inputValue, setInputValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      // Add .eth if not present
      let query = inputValue.trim().toLowerCase();
      if (!query.endsWith(".eth")) {
        query = `${query}.eth`;
      }
      onSearch(query);
    }
  };

  return (
    <Form onSubmit={handleSubmit} className="tw-mb-6">
      <InputGroup className="tw-shadow-lg tw-rounded-lg tw-overflow-hidden">
        <Form.Control
          type="text"
          placeholder="Search for an ENS name..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="tw-bg-zinc-800 tw-border-zinc-700 tw-text-white tw-py-3 tw-px-4 tw-text-lg tw-placeholder-zinc-400 focus:tw-ring-zinc-500 focus:tw-border-zinc-500 tw-border-r-0"
        />
        <Button
          variant="primary"
          type="submit"
          className="tw-bg-zinc-700 hover:tw-bg-zinc-600 tw-border-0 tw-px-5"
        >
          <Search size={20} />
        </Button>
      </InputGroup>
      <p className="tw-text-zinc-400 tw-text-sm tw-mt-2 tw-text-center">
        Enter a name to check availability (e.g. "myname")
      </p>
    </Form>
  );
}
