import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { verifyAdminSecret } from '@/lib/auth';

export const dynamic = 'force-dynamic';

interface ParticipantRecipient {
  name: string;
  email: string;
  token: string;
  team_name?: string;
  team_size?: string;
}

function isValidRecipientEmail(email: unknown): email is string {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim();
  return trimmed.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export async function POST(req: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const adminSecret = record.adminSecret as string | undefined;
    const subject = record.subject as string | undefined;
    const htmlTemplate = record.htmlTemplate as string | undefined;
    const participants = record.participants;
    const customApiKey = record.apiKey as string | undefined;
    const customSenderEmail = record.senderEmail as string | undefined;
    const customSenderName = record.senderName as string | undefined;
    const customDeliveryEngine = record.deliveryEngine as string | undefined;

    const secret = adminSecret || req.headers.get('x-admin-secret');
    if (!verifyAdminSecret(secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!Array.isArray(participants) || participants.length === 0) {
      return NextResponse.json(
        { error: 'participants array is required and must not be empty' },
        { status: 400 }
      );
    }

    const invalidEmail = participants.find((p) => !isValidRecipientEmail(p?.email));
    if (invalidEmail) {
      return NextResponse.json(
        { error: 'Every participant must have a valid email address' },
        { status: 400 }
      );
    }

    if (!subject || !htmlTemplate) {
      return NextResponse.json(
        { error: 'subject and htmlTemplate are required' },
        { status: 400 }
      );
    }

    // Configuration resolution (environment variables + optional UI overrides)
    const host = process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com';
    const port = Number(process.env.BREVO_SMTP_PORT) || 587;
    const smtpUser = process.env.BREVO_SMTP_USER;
    const smtpPass = process.env.BREVO_SMTP_KEY;
    // Use REST API only with a real v3 API key (xkeysib-). Do not fall back to SMTP key (xsmtpsib-).
    const brevoApiKey = (customApiKey || process.env.BREVO_API_KEY || '').trim();
    const senderEmail = (customSenderEmail || process.env.BREVO_SENDER_EMAIL || 'contests@aiclub.org').trim();
    const senderName = (customSenderName || process.env.BREVO_SENDER_NAME || 'AI Club Contest Master').trim();
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');

    // Decide delivery engine:
    // When IP whitelisting is disabled in Brevo, the direct HTTPS REST API v3 (port 443)
    // is ideal: zero firewall blocking, universal cloud compatibility, and instant response.
    const hasApiKey = Boolean(brevoApiKey);
    const hasSmtpCredentials = Boolean(smtpUser && smtpPass);

    if (!hasApiKey && !hasSmtpCredentials) {
      return NextResponse.json(
        {
          error:
            'Brevo credentials not configured. Please provide a Brevo API Key (v3) or SMTP credentials (BREVO_SMTP_USER / BREVO_SMTP_KEY).',
        },
        { status: 500 }
      );
    }

    const preferRestApi = customDeliveryEngine === 'api' || (customDeliveryEngine !== 'smtp' && hasApiKey);

    if (customDeliveryEngine === 'smtp' && !hasSmtpCredentials) {
      return NextResponse.json(
        { error: 'SMTP engine selected but BREVO_SMTP_USER / BREVO_SMTP_KEY are not configured.' },
        { status: 500 }
      );
    }

    let sentCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // Helper: Replace dynamic participant variables in HTML or Subject
    const substituteVariables = (templateText: string, p: ParticipantRecipient) => {
      const participantName = (p.name || 'Contestant').trim();
      const participantToken = (p.token || '').trim();
      const participantTeam = (p.team_name || participantName).trim();
      const participantTeamSize = (p.team_size || 'Solo').trim();
      const accessLink = `${appUrl}/arena?token=${encodeURIComponent(participantToken)}`;
      const portalLink = `${appUrl}/token?tokenid=${encodeURIComponent(participantToken)}`;

      return templateText
        .replace(/\{\{name\}\}/gi, participantName)
        .replace(/\{\{participant_name\}\}/gi, participantName)
        .replace(/\{\{token\}\}/gi, participantToken)
        .replace(/\{\{access_token\}\}/gi, participantToken)
        .replace(/\{\{team_name\}\}/gi, participantTeam)
        .replace(/\{\{team\}\}/gi, participantTeam)
        .replace(/\{\{team_size\}\}/gi, participantTeamSize)
        .replace(/\{\{access_link\}\}/gi, accessLink)
        .replace(/\{\{arena_url\}\}/gi, accessLink)
        .replace(/\{\{portal_link\}\}/gi, portalLink)
        .replace(/\{\{portal_url\}\}/gi, portalLink)
        .replace(/\{\{email\}\}/gi, p.email);
    };

    // ── Delivery Option A: Brevo HTTPS REST API v3 ────────────────────────────
    if (preferRestApi && hasApiKey) {
      const CHUNK_SIZE = 10;
      for (let i = 0; i < participants.length; i += CHUNK_SIZE) {
        const chunk = participants.slice(i, i + CHUNK_SIZE);

        const promises = chunk.map(async (p: ParticipantRecipient) => {
          const personalizedHtml = substituteVariables(htmlTemplate, p);
          const personalizedSubject = substituteVariables(subject, p);

          try {
            const apiRes = await fetch('https://api.brevo.com/v3/smtp/email', {
              method: 'POST',
              headers: {
                'accept': 'application/json',
                'api-key': brevoApiKey,
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                sender: { name: senderName, email: senderEmail },
                to: [{ email: p.email.trim(), name: p.name || 'Contestant' }],
                subject: personalizedSubject,
                htmlContent: personalizedHtml,
              }),
            });

            const apiData = await apiRes.json().catch(() => ({}));

            if (!apiRes.ok) {
              const code = apiData?.code || '';
              const msg = apiData?.message || `Brevo HTTP status ${apiRes.status}`;

              if (msg.toLowerCase().includes('ip not authorized') || code === 'unauthorized') {
                throw new Error(
                  `Brevo IP Whitelist restriction active: ${msg}. Please disable IP Whitelisting in Brevo Dashboard > Security > Authorized IPs.`
                );
              }
              throw new Error(msg);
            }

            return { success: true, email: p.email };
          } catch (err: any) {
            return { success: false, email: p.email, error: err.message || 'Transmission failed' };
          }
        });

        const results = await Promise.all(promises);
        for (const res of results) {
          if (res.success) {
            sentCount++;
          } else {
            failedCount++;
            errors.push(`Failed for ${res.email}: ${res.error}`);
          }
        }
      }

      return NextResponse.json({
        engine: 'brevo-rest-api-v3',
        total: participants.length,
        sent: sentCount,
        failed: failedCount,
        errors: errors.slice(0, 10),
      });
    }

    // ── Delivery Option B: Nodemailer Pooled SMTP Relay ───────────────────────
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      pool: true,
      maxConnections: 5,
      maxMessages: Infinity,
      auth: {
        user: smtpUser!,
        pass: smtpPass!,
      },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 8000,
    });

    const CHUNK_SIZE = 25;
    for (let i = 0; i < participants.length; i += CHUNK_SIZE) {
      const chunk = participants.slice(i, i + CHUNK_SIZE);

      const sendPromises = chunk.map(async (p: ParticipantRecipient) => {
        const personalizedHtml = substituteVariables(htmlTemplate, p);
        const personalizedSubject = substituteVariables(subject, p);

        return transporter.sendMail({
          from: `"${senderName}" <${senderEmail}>`,
          to: p.email.trim(),
          subject: personalizedSubject,
          html: personalizedHtml,
        });
      });

      const results = await Promise.allSettled(sendPromises);

      for (let j = 0; j < results.length; j++) {
        const res = results[j];
        if (res.status === 'fulfilled') {
          sentCount++;
        } else {
          failedCount++;
          const errReason = res.reason?.message || 'SMTP transmission error';
          errors.push(`Failed for ${chunk[j].email}: ${errReason}`);
        }
      }
    }

    transporter.close();

    return NextResponse.json({
      engine: 'brevo-smtp-pooled',
      total: participants.length,
      sent: sentCount,
      failed: failedCount,
      errors: errors.slice(0, 10),
    });
  } catch (error: any) {
    console.error('[API POST /api/brevo/send error]:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to dispatch emails via Brevo' },
      { status: 500 }
    );
  }
}
