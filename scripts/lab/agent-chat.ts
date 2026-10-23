// Asks the conversational agent questions through the real Worker route with a live LLM.
// Usage: npx vite-node scripts/lab/agent-chat.ts <projectId> "<question>" ["<question>" ...]
import { callWorker, ensureUser, readLocalSupabase, workerEnv } from './local-env';

const main = async () => {
  const [projectId, ...questions] = process.argv.slice(2);
  const supabase = readLocalSupabase();
  const { accessToken } = await ensureUser(supabase, 'lab@scout.local', 'lab-password-123');
  const env = workerEnv(supabase, {
    GROQ_API_KEY: process.env.GROQ_API_KEY ?? process.env.GROQ_API,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? process.env.OPENROUTER_API,
    EBAY_BROWSE_BUDGET_PER_RUN: '20',
    TEXT_ANALYZER_PROVIDERS: 'groq,gemini',
  });
  for (const question of questions) {
    const started = Date.now();
    const { status, body } = await callWorker(env, accessToken, '/api/agent/chat', {
      method: 'POST',
      body: JSON.stringify({ projectId, messages: [{ role: 'user', content: question }] }),
    });
    const turn = body as Record<string, unknown>;
    console.log(
      JSON.stringify(
        {
          question,
          status,
          ms: Date.now() - started,
          toolCalls: turn.toolCalls,
          appliedFilters: turn.appliedFilters,
          citations: (turn.citations as string[] | undefined)?.length,
          uncitedIds: turn.uncitedIds,
          pendingConfirmation: turn.pendingConfirmation,
          reply: turn.reply ?? turn.error,
        },
        null,
        2,
      ),
    );
  }
};

void main();
