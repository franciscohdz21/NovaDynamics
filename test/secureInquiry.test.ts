import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import os from "os";
import path from "path";
import fs from "fs/promises";
import { createApp } from "../src/app";
import { AuditLogStore } from "../src/services/auditLog";
import { createAiGateway } from "../src/services/aiGateway";
import { decrypt } from "../src/services/encryption";

const TEST_KEY = "0".repeat(64);
const tempFiles: string[] = [];

function tempFilePath(): string {
  const filePath = path.join(os.tmpdir(), `secure-inquiry-test-${Date.now()}-${Math.random()}.json`);
  tempFiles.push(filePath);
  return filePath;
}

afterAll(async () => {
  await Promise.all(tempFiles.map((f) => fs.rm(f, { force: true })));
});

describe("POST /secure-inquiry", () => {
  it("returns 400 for a missing userId", async () => {
    const app = createApp({ auditLogStore: new AuditLogStore(tempFilePath(), TEST_KEY) });
    const res = await request(app).post("/secure-inquiry").send({ message: "hi" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for a missing message", async () => {
    const app = createApp({ auditLogStore: new AuditLogStore(tempFilePath(), TEST_KEY) });
    const res = await request(app).post("/secure-inquiry").send({ userId: "u1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
  });

  it("sanitizes PII, calls the mock AI, and writes an audit log entry", async () => {
    const filePath = tempFilePath();
    const app = createApp({ auditLogStore: new AuditLogStore(filePath, TEST_KEY) });

    const res = await request(app)
      .post("/secure-inquiry")
      .set("x-mock-ai-delay-ms", "5")
      .send({ userId: "user-1", message: "email me at jane@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.answer).toContain("Generated Answer");
    expect(res.body.redactedMessage).toBe("email me at <REDACTED: EMAIL>");

    const store = new AuditLogStore(filePath, TEST_KEY);
    const entries = await store.readAll();
    const entry = entries.find((e) => e.userId === "user-1");
    expect(entry).toBeDefined();
    expect(entry!.redactedMessage).toBe("email me at <REDACTED: EMAIL>");
    expect(decrypt(entry!.encryptedOriginalMessage, TEST_KEY)).toBe(
      "email me at jane@example.com"
    );
  });

  it("returns 502 when the mock AI call fails but the breaker is still closed", async () => {
    const app = createApp({ auditLogStore: new AuditLogStore(tempFilePath(), TEST_KEY) });
    const res = await request(app)
      .post("/secure-inquiry")
      .set("x-mock-ai-force-fail", "true")
      .set("x-mock-ai-delay-ms", "5")
      .send({ userId: "user-2", message: "hello" });

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("AI_CALL_FAILED");
  });

  it("trips the circuit breaker after 3 consecutive failures and returns Service Busy instantly", async () => {
    const aiGateway = createAiGateway({ failureThreshold: 3, cooldownMs: 30000 });
    const app = createApp({
      auditLogStore: new AuditLogStore(tempFilePath(), TEST_KEY),
      aiGateway,
    });

    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post("/secure-inquiry")
        .set("x-mock-ai-force-fail", "true")
        .set("x-mock-ai-delay-ms", "5")
        .send({ userId: "user-3", message: "hello" });
      expect(res.status).toBe(502);
    }

    const start = Date.now();
    const res = await request(app)
      .post("/secure-inquiry")
      // Large delay proves the breaker skips the mock call entirely once open.
      .set("x-mock-ai-delay-ms", "5000")
      .send({ userId: "user-3", message: "hello again" });
    const elapsed = Date.now() - start;

    expect(res.status).toBe(503);
    expect(res.body.answer).toBe("Service Busy");
    expect(res.body.circuitOpen).toBe(true);
    expect(elapsed).toBeLessThan(1000);
  });
});
