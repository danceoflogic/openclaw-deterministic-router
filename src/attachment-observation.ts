import { classifyLocally, type LocalClassification } from "./classifier.js";
import type { AttachmentKind } from "./telemetry.js";

export type AttachmentSummary = {
  attachmentCount: number;
  attachmentKinds: AttachmentKind[];
};

type Counts = Record<AttachmentKind, number>;
const KINDS: AttachmentKind[] = ["image", "video", "audio", "document", "other"];

function emptyCounts(): Counts {
  return { image: 0, video: 0, audio: 0, document: 0, other: 0 };
}

function kindFromFact(fact: unknown, inbound: boolean): AttachmentKind {
  if (typeof fact !== "object" || fact === null) return "other";
  const value = fact as { kind?: unknown; contentType?: unknown };
  if (typeof value.kind === "string" && KINDS.includes(value.kind as AttachmentKind)) {
    return value.kind as AttachmentKind;
  }
  if (!inbound || typeof value.contentType !== "string") return "other";
  const mime = value.contentType.toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("text/") || mime.startsWith("application/")) return "document";
  return "other";
}

function countsFromFacts(facts: unknown, inbound: boolean): Counts {
  const counts = emptyCounts();
  if (!Array.isArray(facts)) return counts;
  for (const fact of facts) counts[kindFromFact(fact, inbound)]++;
  return counts;
}

function toSummary(counts: Counts): AttachmentSummary {
  return {
    attachmentCount: KINDS.reduce((total, kind) => total + counts[kind], 0),
    attachmentKinds: KINDS.filter((kind) => counts[kind] > 0).sort(),
  };
}

export function summarizeHookAttachments(attachments: unknown): AttachmentSummary {
  return toSummary(countsFromFacts(attachments, false));
}

export function summarizeInboundMedia(media: unknown): AttachmentSummary {
  return toSummary(countsFromFacts(media, true));
}

/** The two hooks may report the same image; take each kind's larger count. */
export function mergeAttachmentSummaries(
  hookAttachments: unknown,
  inboundMedia: unknown,
): AttachmentSummary {
  const hook = countsFromFacts(hookAttachments, false);
  const inbound = countsFromFacts(inboundMedia, true);
  const merged = emptyCounts();
  for (const kind of KINDS) merged[kind] = Math.max(hook[kind], inbound[kind]);
  return toSummary(merged);
}

type Observation = {
  sessionKey: string;
  media: unknown;
  classification?: LocalClassification;
  createdAt: number;
};

/** Only structural media facts are retained, never paths, MIME, filenames or content. */
export class InboundAttachmentRegistry {
  private readonly entries = new Map<string, Observation>();
  private readonly maxEntries = 256;
  private readonly maxAgeMs = 5 * 60_000;

  observe(event: unknown): void {
    if (typeof event !== "object" || event === null) return;
    const value = event as {
      runId?: unknown;
      sessionKey?: unknown;
      ctx?: { SessionKey?: unknown; media?: unknown; BodyForCommands?: unknown };
    };
    // WebChat dispatches carry the session key in the finalized message context;
    // the top-level hook field is populated only for ACP dispatches.
    const sessionKey = typeof value.sessionKey === "string" && value.sessionKey
      ? value.sessionKey
      : value.ctx?.SessionKey;
    if (typeof value.runId !== "string" || !value.runId ||
        typeof sessionKey !== "string" || !sessionKey) return;
    const summary = summarizeInboundMedia(value.ctx?.media);
    if (summary.attachmentCount === 0) return;
    const prompt = value.ctx?.BodyForCommands;
    const classification = typeof prompt === "string" ? classifyLocally(prompt) : undefined;
    this.prune();
    this.entries.set(value.runId, {
      sessionKey,
      media: (value.ctx!.media as unknown[]).map((fact) => ({ kind: kindFromFact(fact, true) })),
      classification,
      createdAt: Date.now(),
    });
    while (this.entries.size > this.maxEntries) {
      this.entries.delete(this.entries.keys().next().value!);
    }
  }

  consume(runId: string | undefined, sessionKey: string | undefined):
    { media: unknown; classification?: LocalClassification } | undefined {
    if (!runId || !sessionKey) return;
    const entry = this.entries.get(runId);
    if (!entry) return;
    this.entries.delete(runId);
    if (entry.sessionKey !== sessionKey || Date.now() - entry.createdAt > this.maxAgeMs) return;
    return { media: entry.media, classification: entry.classification };
  }

  complete(runId: string | undefined): void {
    if (runId) this.entries.delete(runId);
  }

  private prune(): void {
    const cutoff = Date.now() - this.maxAgeMs;
    for (const [runId, entry] of this.entries) {
      if (entry.createdAt < cutoff) this.entries.delete(runId);
    }
  }
}
