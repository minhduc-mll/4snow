/** Parse JSON while rejecting duplicate object keys, including escaped equivalents. */
export function parseStrictJson(text: string, maxRootInputBytes?: number, maxDocumentBytes?: number, maxOrdinaryBytes?: number): unknown {
  try {
    let offset = 0;
    let operation: unknown;
    const whitespace = (): void => { while (/[\t\n\r ]/.test(text[offset] ?? "") && offset < text.length) offset++; };
    const stringToken = (): string => {
      const start = offset++;
      while (offset < text.length) {
        const character = text[offset++];
        if (character === "\\") offset++;
        else if (character === '"') {
          const decoded: unknown = JSON.parse(text.slice(start, offset));
          if (typeof decoded !== "string") throw new Error("Invalid string");
          return decoded;
        }
      }
      throw new Error("Invalid string");
    };
    const scan = (depth: number): void => {
      if (depth > 64) throw new Error("JSON nesting limit exceeded");
      whitespace();
      if (text[offset] === '"') { stringToken(); return; }
      if (text[offset] === "{") {
        offset++; whitespace();
        const keys = new Set<string>();
        if (text[offset] === "}") { offset++; return; }
        while (offset < text.length) {
          whitespace();
          const key = stringToken();
          if (keys.has(key)) throw new Error("Duplicate JSON key");
          keys.add(key); whitespace(); offset++; whitespace();
          const start = offset;
          scan(depth + 1);
          if (depth === 0 && key === "operation" && text[start] === '"' && offset - start <= 80) operation = JSON.parse(text.slice(start, offset));
          if (depth === 0 && key === "input" && maxRootInputBytes !== undefined && new TextEncoder().encode(text.slice(start, offset)).length > maxRootInputBytes) throw new RangeError("Input exceeds byte limit");
          if (depth === 1 && key === "document" && maxDocumentBytes !== undefined && new TextEncoder().encode(text.slice(start, offset)).length > maxDocumentBytes) throw new RangeError("Document exceeds byte limit");
          whitespace();
          if (text[offset] === "}") { offset++; return; }
          offset++;
        }
        throw new Error("Invalid object");
      }
      if (text[offset] === "[") {
        offset++; whitespace();
        if (text[offset] === "]") { offset++; return; }
        while (offset < text.length) {
          scan(depth + 1); whitespace();
          if (text[offset] === "]") { offset++; return; }
          offset++;
        }
        throw new Error("Invalid array");
      }
      while (offset < text.length && !/[\t\n\r ,\]}]/.test(text[offset])) offset++;
    };
    scan(0);
    if (maxOrdinaryBytes !== undefined && operation !== "import-preview" && operation !== "import-apply" && new TextEncoder().encode(text).length > maxOrdinaryBytes) throw new RangeError("Request exceeds byte limit");
    const value: unknown = JSON.parse(text);
    return value;
  } catch (error) {
    if (error instanceof RangeError) throw error;
    throw new Error("Invalid JSON or duplicate object key");
  }
}
