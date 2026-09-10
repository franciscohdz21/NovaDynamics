import express, { Express, NextFunction, Request, Response } from "express";
import { healthRouter } from "./routes/health";
import { createSecureInquiryRouter } from "./routes/secureInquiry";
import { createAiGateway, AiGateway } from "./services/aiGateway";
import { auditLogStore as defaultAuditLogStore, AuditLogStore } from "./services/auditLog";

export interface CreateAppOptions {
  auditLogStore?: AuditLogStore;
  aiGateway?: AiGateway;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();
  app.use(express.json());
  app.use(healthRouter);

  const aiGateway = options.aiGateway ?? createAiGateway();
  const auditLogStore = options.auditLogStore ?? defaultAuditLogStore;
  app.use(createSecureInquiryRouter({ aiGateway, auditLogStore }));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if ((err as { type?: string })?.type === "entity.parse.failed") {
      res.status(400).json({ error: "INVALID_JSON", message: "Request body must be valid JSON." });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Unexpected server error." });
  });

  return app;
}
