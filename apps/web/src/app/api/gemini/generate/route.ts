import { NextRequest, NextResponse } from 'next/server';
import { verifyParticipantToken } from '@/lib/auth';
import { generateWithGemini, resolveServerGeminiApiKey } from '@/lib/gemini-generate';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accessToken, userPrompt, systemInstruction, stageNumber, clientApiKey } = body;

    if (!accessToken || !userPrompt || typeof userPrompt !== 'string') {
      return NextResponse.json(
        { error: 'accessToken and userPrompt are required' },
        { status: 400 }
      );
    }

    const user = await verifyParticipantToken(String(accessToken).trim());
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role === 'disqualified' || user.is_disqualified) {
      return NextResponse.json({ error: 'Account suspended' }, { status: 403 });
    }

    const stageNum = Number(stageNumber) || 1;
    const systemPrompt =
      typeof systemInstruction === 'string' && systemInstruction.trim()
        ? systemInstruction.trim()
        : `You are the Gemini AI Tutor for Stage ${stageNum} of the Pixel and Anomaly CTF. Give concise, practical hints. Do not dump full answers unless asked. Use markdown and \`\`\`python code fences when helpful.`;

    const serverKey = resolveServerGeminiApiKey();
    const apiKey =
      serverKey ||
      (typeof clientApiKey === 'string' ? clientApiKey.trim() : '');

    if (!apiKey) {
      return NextResponse.json(
        {
          error: 'No Gemini key on server. Paste your Google AI Studio key in the tutor, or ask the organizer to set GEMINI_API_KEY in Vercel.',
          useClientKey: true,
        },
        { status: 503 }
      );
    }

    const result = await generateWithGemini(apiKey, userPrompt, systemPrompt);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, retryable: result.retryable, useClientKey: !serverKey },
        { status: result.retryable ? 502 : 400 }
      );
    }

    return NextResponse.json({
      text: result.text,
      model: result.model,
      apiVersion: result.apiVersion,
      via: serverKey ? 'server' : 'client-key-proxy',
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Gemini request failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
