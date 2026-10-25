/** Models that work with Google AI Studio keys (not legacy GCP-only routes). */
export const GEMINI_CANDIDATE_MODELS = [
  { model: 'gemini-2.0-flash', apiVersion: 'v1beta' },
  { model: 'gemini-2.5-flash', apiVersion: 'v1beta' },
  { model: 'gemini-2.0-flash-lite', apiVersion: 'v1beta' },
  { model: 'gemini-1.5-flash', apiVersion: 'v1beta' },
  { model: 'gemini-1.5-flash', apiVersion: 'v1' },
] as const;

export function resolveServerGeminiApiKey(): string {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY ||
    process.env.GOOGLE_AI_API_KEY ||
    process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
    ''
  ).trim();
}

function isRetryableGeminiError(status: number, message: string): boolean {
  const msg = message.toLowerCase();
  if (status === 404 || msg.includes('not found') || msg.includes('no longer available')) {
    return true;
  }
  if (status === 429 || msg.includes('quota') || msg.includes('rate limit')) {
    return true;
  }
  if (
    msg.includes('denied access') ||
    msg.includes('permission_denied') ||
    msg.includes('has not been used') ||
    msg.includes('is disabled') ||
    msg.includes('access not configured')
  ) {
    return true;
  }
  return false;
}

export type GeminiGenerateResult =
  | { ok: true; text: string; model: string; apiVersion: string }
  | { ok: false; error: string; retryable: boolean };

export async function generateWithGemini(
  apiKey: string,
  userPrompt: string,
  systemInstruction: string,
  preferredModel?: { model: string; apiVersion: string } | null
): Promise<GeminiGenerateResult> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    return { ok: false, error: 'Gemini API key is not configured.', retryable: false };
  }

  const modelsToTry = preferredModel
    ? [preferredModel, ...GEMINI_CANDIDATE_MODELS.filter((m) => m.model !== preferredModel.model)]
    : [...GEMINI_CANDIDATE_MODELS];

  const fullPrompt = `${systemInstruction}\n\nUser Directive / Question:\n${userPrompt}`;
  const payload = {
    contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
    generationConfig: { temperature: 0.6, maxOutputTokens: 2048 },
  };

  let lastError = 'Could not reach Gemini.';

  for (const { model, apiVersion } of modelsToTry) {
    const endpoint = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${encodeURIComponent(cleanKey)}`;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);
      const serverMsg = (data?.error?.message || `HTTP ${res.status}`).trim();

      if (!res.ok) {
        lastError = serverMsg;
        if (isRetryableGeminiError(res.status, serverMsg)) {
          continue;
        }
        return { ok: false, error: serverMsg, retryable: false };
      }

      const parts = data?.candidates?.[0]?.content?.parts || [];
      const answerParts = parts.filter((p: { thought?: boolean }) => !p.thought);
      const rawText = (answerParts.length > 0 ? answerParts : parts)
        .map((p: { text?: string }) => p.text)
        .filter(Boolean)
        .join('\n')
        .trim();

      if (rawText) {
        return { ok: true, text: rawText, model, apiVersion };
      }

      const finishReason = data?.candidates?.[0]?.finishReason;
      if (finishReason && finishReason !== 'STOP') {
        return {
          ok: true,
          text: `[Response paused: ${finishReason}. Try a shorter question.]`,
          model,
          apiVersion,
        };
      }

      lastError = 'Empty response from model.';
    } catch (e: unknown) {
      lastError = e instanceof Error ? e.message : 'Network error calling Gemini.';
    }
  }

  const friendly = lastError.toLowerCase().includes('denied')
    ? 'Gemini blocked this request for your API key. Create a fresh key at Google AI Studio (aistudio.google.com/app/apikey), not GCP Console — or ask the organizer to set GEMINI_API_KEY on the server.'
    : lastError;

  return { ok: false, error: friendly, retryable: true };
}
