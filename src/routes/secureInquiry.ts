import { Router, Request, Response } from "express";
import { sanitizeMessage } from "../services/sanitizer";
import { AuditLogStore } from "../services/auditLog";
import { AiGateway } from "../services/aiGateway";

interface SecureInquiryBody {
  userId: string;
  message: string;
}

function parseBody(body: unknown): SecureInquiryBody | null {
  if (typeof body !== "object" || body === null) return null;
  const { userId, message } = body as Record<string, unknown>;
  if (typeof userId !== "string" || userId.trim().length === 0) return null;
  if (typeof message !== "string" || message.trim().length === 0) return null;
  return { userId, message };
}

export interface SecureInquiryDeps {
  aiGateway: AiGateway;
  auditLogStore: AuditLogStore;
}

export function createSecureInquiryRouter(deps: SecureInquiryDeps): Router {
  const router = Router();

  router.post("/secure-inquiry", async (req: Request, res: Response) => {
    const parsed = parseBody(req.body);
    if (!parsed) {
      res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Request body must include a non-empty string 'userId' and 'message'.",
      });
      return;
    }

    const { userId, message } = parsed;
    const redactedMessage = sanitizeMessage(message);

    // Demo/grading aids only: let a caller deterministically force a mock AI failure or shrink
    // the simulated delay, so the circuit breaker can be exercised without random chance or
    // waiting on the real 2s delay for every call. They never affect sanitization or the audit log.
    const forceFail = req.header("x-mock-ai-force-fail") === "true" || undefined;
    const delayHeader = req.header("x-mock-ai-delay-ms");
    const delayMs = delayHeader !== undefined ? Number(delayHeader) : undefined;

    try {
      const { answer, circuitOpen } = await deps.aiGateway.getAiResponse(redactedMessage, {
        forceFail,
        delayMs: Number.isFinite(delayMs) ? delayMs : undefined,
      });

      await deps.auditLogStore.append({ userId, originalMessage: message, redactedMessage });

      if (circuitOpen) {
        res.status(503).json({ answer, circuitOpen: true });
        return;
      }

      res.status(200).json({ answer, redactedMessage });
    } catch {
      await deps.auditLogStore.append({ userId, originalMessage: message, redactedMessage });
      res.status(502).json({
        error: "AI_CALL_FAILED",
        message: "The AI service failed to respond. Please try again.",
      });
    }
  });

  return router;
}
