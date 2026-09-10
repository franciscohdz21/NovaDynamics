# AI Orchestration Log

This document records how AI was used to design the security-critical logic in this project, per
the exercise requirement to show how AI was orchestrated to handle security logic.

This is being built inside a GitHub Copilot Chat session running on **Claude Sonnet 5**, so the
AI usage requirement is satisfied end-to-end: every file in this repo was produced through a
prompt/response loop with Claude, not written by hand first and "AI-polished" after.

Entries are added phase by phase as the security-sensitive logic (sanitizer, circuit breaker,
encryption) is built. See later phases for the sanitizer design log and circuit breaker design log.

## Phase 1 - Scaffold

No security-critical logic yet (health check + project skeleton only). Scaffolding decisions
(Express + TS, Vitest/Supertest, Docker multi-stage build) were carried over from this workspace's
sibling project conventions rather than AI-generated from scratch.
