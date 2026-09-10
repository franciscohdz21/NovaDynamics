import { describe, it, expect, afterEach } from "vitest";
import os from "os";
import path from "path";
import fs from "fs/promises";
import { AuditLogStore } from "../src/services/auditLog";
import { decrypt } from "../src/services/encryption";

const TEST_KEY = "0".repeat(64);

function tempFilePath(): string {
  return path.join(os.tmpdir(), `audit-log-test-${Date.now()}-${Math.random()}.json`);
}

describe("AuditLogStore", () => {
  const filesToClean: string[] = [];

  afterEach(async () => {
    await Promise.all(
      filesToClean.splice(0).map((f) => fs.rm(f, { force: true }))
    );
  });

  it("appends a record with the original message encrypted and the redacted message in plaintext", async () => {
    const filePath = tempFilePath();
    filesToClean.push(filePath);
    const store = new AuditLogStore(filePath, TEST_KEY);

    const record = await store.append({
      userId: "user-1",
      originalMessage: "my email is jane@example.com",
      redactedMessage: "my email is <REDACTED: EMAIL>",
    });

    expect(record.redactedMessage).toBe("my email is <REDACTED: EMAIL>");
    expect(record.encryptedOriginalMessage).not.toContain("jane@example.com");
    expect(decrypt(record.encryptedOriginalMessage, TEST_KEY)).toBe(
      "my email is jane@example.com"
    );

    const onDisk = await store.readAll();
    expect(onDisk).toHaveLength(1);
    expect(onDisk[0].id).toBe(record.id);
  });

  it("appends multiple entries without losing any under concurrent writes", async () => {
    const filePath = tempFilePath();
    filesToClean.push(filePath);
    const store = new AuditLogStore(filePath, TEST_KEY);

    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        store.append({
          userId: `user-${i}`,
          originalMessage: `message ${i}`,
          redactedMessage: `message ${i}`,
        })
      )
    );

    const entries = await store.readAll();
    expect(entries).toHaveLength(10);
    const userIds = entries.map((e) => e.userId).sort();
    expect(userIds).toEqual(Array.from({ length: 10 }, (_, i) => `user-${i}`).sort());
  });

  it("returns an empty array when the file does not exist yet", async () => {
    const filePath = tempFilePath();
    const store = new AuditLogStore(filePath, TEST_KEY);
    expect(await store.readAll()).toEqual([]);
  });
});
