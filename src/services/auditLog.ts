import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { encrypt } from "./encryption";
import { env } from "../config/env";

export interface AuditLogEntryInput {
  userId: string;
  originalMessage: string;
  redactedMessage: string;
}

export interface AuditLogRecord {
  id: string;
  timestamp: string;
  userId: string;
  /** AES-256-GCM encrypted original message (see encryption.ts for the payload format). */
  encryptedOriginalMessage: string;
  redactedMessage: string;
}

async function readEntries(filePath: string): Promise<AuditLogRecord[]> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return raw.trim() ? (JSON.parse(raw) as AuditLogRecord[]) : [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function writeEntries(filePath: string, entries: AuditLogRecord[]): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  // Write-then-rename keeps a crash mid-write from corrupting the existing file.
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tempPath, JSON.stringify(entries, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

/**
 * Append-only JSON-file audit log. Writes are serialized through an in-process queue so
 * concurrent requests can't race each other on the read-modify-write cycle.
 */
export class AuditLogStore {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly encryptionKeyHex: string = env.auditLogEncryptionKey
  ) {}

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  append(input: AuditLogEntryInput): Promise<AuditLogRecord> {
    return this.enqueue(async () => {
      const record: AuditLogRecord = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        userId: input.userId,
        encryptedOriginalMessage: encrypt(input.originalMessage, this.encryptionKeyHex),
        redactedMessage: input.redactedMessage,
      };
      const entries = await readEntries(this.filePath);
      entries.push(record);
      await writeEntries(this.filePath, entries);
      return record;
    });
  }

  readAll(): Promise<AuditLogRecord[]> {
    return this.enqueue(() => readEntries(this.filePath));
  }
}

export const auditLogStore = new AuditLogStore(env.auditLogFilePath);
