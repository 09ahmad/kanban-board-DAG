/**
 * Runs before any test module is loaded (see bunfig.toml).
 *
 * The background AI queue lives in a shared Redis, so a dev server running
 * elsewhere on the machine would compete for jobs and answer them with a real
 * LLM. Tests get their own queue, decided here because module load order
 * decides which name wins otherwise.
 */
process.env.AI_SUGGESTIONS_QUEUE ??= "ai-suggestions-test";
