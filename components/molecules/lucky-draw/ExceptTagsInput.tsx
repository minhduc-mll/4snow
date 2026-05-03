"use client";

import { X } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";

interface ExceptTagsInputProps {
  value: string[];
  onChange: (nextValue: string[]) => void;
  placeholder?: string;
}

export function ExceptTagsInput({
  value,
  onChange,
  placeholder,
}: ExceptTagsInputProps): React.ReactElement {
  const [inputValue, setInputValue] = React.useState("");

  const addTag = (raw: string): void => {
    const normalized = raw.trim();
    if (!normalized) {
      return;
    }
    if (value.includes(normalized)) {
      setInputValue("");
      return;
    }
    onChange([...value, normalized]);
    setInputValue("");
  };

  const removeTagAt = (index: number): void => {
    onChange(value.filter((_, currentIndex) => currentIndex !== index));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      addTag(inputValue);
      return;
    }

    if (event.key === "Backspace" && inputValue.length === 0 && value.length > 0) {
      event.preventDefault();
      removeTagAt(value.length - 1);
    }
  };

  return (
    <div className="grid gap-2">
      <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-lg border bg-background px-2 py-1.5">
        {value.map((tag, index) => (
          <span
            key={`${tag}-${index}`}
            className="inline-flex items-center gap-1 rounded-md border bg-muted px-2 py-1 text-xs"
          >
            {tag}
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Remove ${tag}`}
              className="size-4"
              onClick={() => removeTagAt(index)}
            >
              <X className="size-3" aria-hidden />
            </Button>
          </span>
        ))}
        <Input
          value={inputValue}
          placeholder={placeholder}
          className="h-7 min-w-40 flex-1 border-0 bg-transparent px-1 focus-visible:ring-0"
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => addTag(inputValue)}
        />
      </div>
    </div>
  );
}

