export type ImportStartInput = { artifactId: string; artifactRevision: string; chunkCount: number };
export type ImportStartMutation = { operation: "import-start"; requestId: string; idempotencyKey: string; input: ImportStartInput };
export type ImportApplyMutation = { operation: "import-apply"; requestId: string; idempotencyKey: string; input: { importId: string; document: unknown; canonicalHash: string } };
export type ImportFinalizeMutation = { operation: "import-finalize"; requestId: string; idempotencyKey: string; input: { importId: string; expectedDraftRevision: string } };
export type ImportMutation = ImportStartMutation | ImportApplyMutation | ImportFinalizeMutation;
export type VerifiedChunk = { canonicalHash: string; entries: { normalized: string; level: number }[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function parseImportMutation(value: unknown): ImportMutation {
  if (!isRecord(value) || !exactKeys(value, ["operation", "requestId", "idempotencyKey", "input"]) || !isUuid(value.requestId) || !isUuid(value.idempotencyKey) || !isRecord(value.input)) throw new Error("Invalid import mutation");
  const input = value.input;
  if (value.operation === "import-start") {
    if (!exactKeys(input, ["artifactId", "artifactRevision", "chunkCount"]) || !isUuid(input.artifactId) || typeof input.artifactRevision !== "string" || input.artifactRevision.length === 0 || Array.from(input.artifactRevision).length > 128 || new TextEncoder().encode(input.artifactRevision).length > 512 || typeof input.chunkCount !== "number" || !Number.isSafeInteger(input.chunkCount) || input.chunkCount < 1 || input.chunkCount > 100) throw new Error("Invalid import start input");
    return { operation: value.operation, requestId: value.requestId, idempotencyKey: value.idempotencyKey, input: { artifactId: input.artifactId, artifactRevision: input.artifactRevision, chunkCount: input.chunkCount } };
  }
  if (value.operation === "import-apply") {
    if (!exactKeys(input, ["importId", "document", "canonicalHash"]) || !isUuid(input.importId) || !isRecord(input.document) || typeof input.canonicalHash !== "string" || !/^[0-9a-f]{64}$/.test(input.canonicalHash)) throw new Error("Invalid import apply input");
    return { operation: value.operation, requestId: value.requestId, idempotencyKey: value.idempotencyKey, input: { importId: input.importId, document: input.document, canonicalHash: input.canonicalHash } };
  }
  if (value.operation === "import-finalize") {
    if (!exactKeys(input, ["importId", "expectedDraftRevision"]) || !isUuid(input.importId) || typeof input.expectedDraftRevision !== "string" || !/^(0|[1-9][0-9]{0,18})$/.test(input.expectedDraftRevision) || BigInt(input.expectedDraftRevision) > BigInt("9223372036854775807")) throw new Error("Invalid import finalize input");
    return { operation: value.operation, requestId: value.requestId, idempotencyKey: value.idempotencyKey, input: { importId: input.importId, expectedDraftRevision: input.expectedDraftRevision } };
  }
  throw new Error("Unsupported import operation");
}

export async function verifyImportChunk(document: unknown, expectedHash: string): Promise<VerifiedChunk> {
  try {
    if (!isRecord(document) || !Array.isArray(document.entries) || !/^[0-9a-f]{64}$/.test(expectedHash)) throw new Error("Invalid chunk");
    const { previewImport } = await import("./preview.ts");
    const { normalizeSpelling } = await import("./dictionary-contract.ts");
    const result = await previewImport(JSON.stringify(document));
    if (!result.valid || result.canonicalHash !== expectedHash) throw new Error("Invalid chunk");
    const entries = document.entries.map((entry: unknown) => {
      if (!isRecord(entry) || typeof entry.original !== "string") throw new Error("Invalid chunk");
      return normalizeSpelling(entry.original);
    });
    return { canonicalHash: expectedHash, entries };
  } catch {
    throw new Error("Invalid import chunk or hash");
  }
}
