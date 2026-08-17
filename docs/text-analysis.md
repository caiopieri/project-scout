# Textual Analysis — Milestone 7

## Scope

Milestone 7 analyzes only normalized eBay title, description and condition. It creates versioned evidence, defects and contradictions. It does not analyze images, calculate scores, call a live LLM or expose a user-facing analysis endpoint.

## Pipeline

1. Normalized ingestion returns internal listing UUIDs.
2. `TextAnalysisQueueScheduler` requests an idempotent `analysis_runs` row for the current text hash.
3. It publishes only `{kind, version, analysisRunId}` to `analysis-queue` and marks the run queued.
4. The consumer atomically claims the run and reloads bounded title/description/condition from PostgreSQL.
5. A `TextAnalyzer` returns schema-validated JSON.
6. One transaction persists evidence, defects, relational `defect_evidence` links and run metadata.

Queue redelivery is safe: the unique key combines listing, text hash, analysis type, prompt version and model. Claims use a five-minute lease and transient failures retry at most three analysis attempts.

## Implemented analyzers

- `DeterministicTextAnalyzer`: initial English/Portuguese rules for Activation Lock, logic-board failure, no power, cracked screen, broken rear glass, degraded battery, missing board, empty box, working declarations and untested state.
- `MockTextAnalyzer`: deterministic test/demo provider with explicit `provider=mock` metadata.

Seller statements are facts about what the listing declares, not proof that the product state is true. Every extracted statement includes confidence, explanation and limitations. Contradictory working/no-power claims become an inferred inconsistency; missing functional statements become `unknown`.

## Hostile input and limits

Title is limited to 500 characters, description to 50,000 and condition to 200. Prompt-like text is never executed. Output is strict Zod JSON, capped at 50 evidence records, 30 defects and 20 contradictions; every defect must reference an evidence key from the same result.

## Future AI provider

`TextAnalyzer` is provider-neutral, but no live Gemini adapter is implemented in Milestone 7. A future opt-in adapter must keep the API key server-side, use structured output, escape/wrap listing content as untrusted data, enforce timeout and bounded retries, and validate the response with the same shared schemas. It must record the actual provider/model/prompt version and must not pretend a deterministic fallback was a Gemini result.

Gemini 2.5 Flash is only a candidate. Before enabling its free tier, review data handling: free-tier content may be used by Google to improve products. Production usage needs an explicit privacy and cost decision.

## Known limitations

- Initial rules cover a small vocabulary in Portuguese and English; negation and context are not general.
- Extraction does not yet use structured item specifics as corroborating evidence.
- No semantic entity resolution, repair-cost inference, visual confirmation or opportunity scoring.
- The production Cloudflare environment has no analysis queue binding yet; Marco 7 is local-only until provisioned and deployed explicitly.
