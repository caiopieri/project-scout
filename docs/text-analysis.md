# Textual Analysis — Milestone 7

## Scope

Milestone 7 analyzes only normalized eBay title, description and condition. It creates versioned evidence, defects and contradictions. It does not analyze images, calculate scores or expose a user-facing analysis endpoint. The Gemini path is implemented but remains disabled by default until its live privacy and quota gate is approved.

## Pipeline

1. Normalized ingestion returns internal listing UUIDs.
2. `TextAnalysisQueueScheduler` requests an idempotent `analysis_runs` row for the current text hash.
3. It publishes only analysis-run IDs to `analysis-queue` and marks each run queued. Gemini mode groups up to 20 IDs into one batch task; deterministic/mock modes retain single-item tasks.
4. The consumer atomically claims the run and reloads bounded title/description/condition from PostgreSQL.
5. A `TextAnalyzer` returns schema-validated JSON.
6. One transaction persists evidence, defects, relational `defect_evidence` links and run metadata.

Queue redelivery is safe: the unique key combines listing, text hash, analysis type, prompt version and model. Claims use a five-minute lease and transient failures retry at most three analysis attempts.

## Implemented analyzers

- `DeterministicTextAnalyzer`: initial English/Portuguese rules for Activation Lock, logic-board failure, no power, cracked screen, broken rear glass, degraded battery, missing board, empty box, working declarations and untested state.
- `MockTextAnalyzer`: deterministic test/demo provider with explicit `provider=mock` metadata.
- `GeminiTextAnalyzer`: opt-in REST provider with structured JSON output, bounded requests and sanitized error classification. It is selected only by `TEXT_ANALYZER_MODE=gemini` and a server-side key.
- Gemini batches preserve `returnId` per listing, validate each item independently and persist valid neighbors without allowing an invalid item to contaminate them.

Seller statements are facts about what the listing declares, not proof that the product state is true. Every extracted statement includes confidence, explanation and limitations. Contradictory working/no-power claims become an inferred inconsistency; missing functional statements become `unknown`.

## Hostile input and limits

Title is limited to 500 characters, description to 50,000 and condition to 200. Prompt-like text is never executed. Output is strict Zod JSON, capped at 50 evidence records, 30 defects and 20 contradictions; every defect must reference an evidence key from the same result.

## Gemini provider boundary

The adapter keeps the API key server-side, requests structured JSON, wraps listing content in strict data tags, enforces timeout and an instance request budget, classifies failures with stable internal codes and validates the complete result with the shared schemas. It records the actual provider/model/prompt version and never presents a deterministic fallback as Gemini output.

Gemini 2.5 Flash is the default model candidate. Before enabling it, review data handling: free-tier content may be used by Google to improve products. Production usage needs an explicit privacy and cost decision.

## Known limitations

- Initial rules cover a small vocabulary in Portuguese and English; negation and context are not general.
- Extraction does not yet use structured item specifics as corroborating evidence.
- No semantic entity resolution, repair-cost inference, visual confirmation or opportunity scoring.
- The isolated production Wrangler environment now declares the analysis
  producer/consumer and DLQ. The remote queues still need to be provisioned,
  deployed and smoke-tested explicitly; analysis remains disabled by default
  there until the credential, privacy and quota gates are approved.
