/**
 * Worker output protocol.
 *
 * The first version of this asked workers for a single JSON object with file
 * contents inside a string field. That contract looks clean and is a trap: it
 * requires a model to escape every newline, quote and backslash of a source file
 * by hand, and small models fail it constantly — the observed failures were
 * unescaped newlines and backtick template literals pasted straight into a JSON
 * string, which is unparseable no matter how carefully you ask.
 *
 * So the primary protocol is a fenced-block format that needs no escaping at all:
 *
 *     ### FILE: src/money.js
 *     ```js
 *     export function toCents(...) { ... }
 *     ```
 *
 *     ### NOTES
 *     decisions: ...
 *
 * JSON is still accepted as a fallback, including a repair pass for the specific
 * malformations models actually produce. Parsing is deliberately generous about
 * form and strict about content: a file is only accepted if it has a plausible
 * path and non-empty body.
 */

export interface WorkerOutput {
  files: { path: string; content: string }[];
  decisions: string[];
  assumptions: string[];
  remainingWork: string[];
  confidence: number;
}

export class InvalidWorkerOutputError extends Error {
  constructor(
    message: string,
    readonly raw: string,
  ) {
    super(message);
    this.name = 'InvalidWorkerOutputError';
  }
}

/** What the worker is told to produce. Kept next to the parser so they cannot drift. */
export const WORKER_OUTPUT_CONTRACT = `Reply in exactly this format, and nothing else.

### FILE: <relative/path>
\`\`\`
<the complete file contents>
\`\`\`

Repeat the FILE block for each file you write. Then optionally:

### NOTES
decisions: <one per line>
assumptions: <one per line>
remaining: <one per line>

Write the whole file, not a diff or a fragment. Do not explain anything outside the blocks.`;

const FILE_BLOCK =
  /###\s*FILE:\s*([^\n\r]+?)\s*\r?\n\s*```[a-zA-Z0-9]*\s*\r?\n([\s\S]*?)\r?\n?\s*```/g;

export function parseWorkerOutput(raw: string): WorkerOutput {
  const fenced = parseFencedFormat(raw);
  if (fenced.files.length > 0) return fenced;

  const json = tryParseJsonFormat(raw);
  if (json) return json;

  // Last resort: a single fenced block with no FILE header. Some models drop the
  // header but still emit exactly one correct file, and throwing away a good answer
  // over a missing marker wastes a whole worker attempt.
  const loneBlock = /```[a-zA-Z0-9]*\s*\r?\n([\s\S]*?)\r?\n?```/.exec(raw);
  if (loneBlock && loneBlock[1].trim().length > 20) {
    return {
      files: [{ path: '', content: loneBlock[1] }],
      decisions: [],
      assumptions: [],
      remainingWork: [],
      confidence: 0.4,
    };
  }

  throw new InvalidWorkerOutputError(
    'no FILE block and no parseable JSON object in worker answer',
    raw,
  );
}

function parseFencedFormat(raw: string): WorkerOutput {
  const files: { path: string; content: string }[] = [];
  FILE_BLOCK.lastIndex = 0;

  for (const match of raw.matchAll(FILE_BLOCK)) {
    const path = match[1].trim().replace(/^["'`]|["'`]$/g, '');
    const content = match[2];
    if (!path || !content.trim()) continue;
    files.push({ path, content });
  }

  return {
    files,
    decisions: extractNotes(raw, 'decisions'),
    assumptions: extractNotes(raw, 'assumptions'),
    remainingWork: extractNotes(raw, 'remaining'),
    confidence: files.length > 0 ? 0.7 : 0,
  };
}

function extractNotes(raw: string, key: string): string[] {
  const re = new RegExp(`^\\s*${key}\\s*:\\s*(.+)$`, 'gim');
  const out: string[] = [];
  for (const m of raw.matchAll(re)) {
    const value = m[1].trim();
    if (value && value.toLowerCase() !== 'none') out.push(value.slice(0, 240));
  }
  return out.slice(0, 8);
}

function tryParseJsonFormat(raw: string): WorkerOutput | null {
  const body = raw.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  const candidate = body.slice(start, end + 1);

  for (const attempt of [candidate, repairJson(candidate)]) {
    try {
      const parsed = JSON.parse(attempt) as Record<string, unknown>;
      const rawFiles = Array.isArray(parsed.files) ? parsed.files : [];
      const files = rawFiles
        .filter(
          (f): f is { path: string; content: string } =>
            typeof f === 'object' &&
            f !== null &&
            typeof (f as { path?: unknown }).path === 'string' &&
            typeof (f as { content?: unknown }).content === 'string',
        )
        .map((f) => ({ path: f.path, content: f.content }));

      if (files.length === 0) continue;

      return {
        files,
        decisions: toStringArray(parsed.decisions),
        assumptions: toStringArray(parsed.assumptions),
        remainingWork: toStringArray(parsed.remainingWork),
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      };
    } catch {
      // Fall through to the next attempt.
    }
  }
  return null;
}

/**
 * Repair the two malformations models actually emit, both observed in real runs:
 * a backtick-delimited template literal where a JSON string belongs, and raw
 * newlines inside a double-quoted string.
 */
function repairJson(text: string): string {
  let out = text.replace(/:\s*`([\s\S]*?)`(\s*[,}])/g, (_, body: string, tail: string) => {
    return `: ${JSON.stringify(body)}${tail}`;
  });

  out = out.replace(/"((?:[^"\\]|\\.)*)"/g, (match) =>
    match.includes('\n') ? match.replace(/\n/g, '\\n').replace(/\r/g, '') : match,
  );

  return out;
}

function toStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 8) : [];
}
