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
  team_members?: Array<{ name: string; email: string }>;
}

function isValidRecipientEmail(email: unknown): email is string {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim();
  return trimmed.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderTeamMembersTableRows(
  members: Array<{ name: string; email: string }>,
  currentRecipientEmail: string
): string {
  if (!members || members.length === 0) {
    return `<tr><td colspan="4" style="padding: 12px; text-align: center; color: #64748b; font-size: 12px;">No team members registered</td></tr>`;
  }

  const cleanRecipientEmail = currentRecipientEmail.toLowerCase().trim();

  return members
    .map((member, idx) => {
      const isRecipient = member.email.toLowerCase().trim() === cleanRecipientEmail;
      const rowBg = isRecipient
        ? 'rgba(6, 182, 212, 0.08)'
        : (idx % 2 === 0 ? 'rgba(255, 255, 255, 0.02)' : 'transparent');
      const isLast = idx === members.length - 1;
      const borderBottom = isLast ? 'none' : '1px solid #1e293b';

      const roleBadge = isRecipient
        ? `<span style="display: inline-block; padding: 2px 8px; background: rgba(6, 182, 212, 0.15); border: 1px solid rgba(6, 182, 212, 0.4); border-radius: 6px; color: #22d3ee; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">YOU</span>`
        : `<span style="display: inline-block; padding: 2px 8px; background: #1e293b; border: 1px solid #334155; border-radius: 6px; color: #94a3b8; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">TEAMMATE</span>`;

      return `<tr style="background-color: ${rowBg};">
        <td style="padding: 11px 14px; text-align: center; font-size: 11px; font-weight: 700; color: ${isRecipient ? '#06b6d4' : '#64748b'}; border-bottom: ${borderBottom};">${idx + 1}</td>
        <td style="padding: 11px 14px; font-size: 13px; font-weight: 600; color: ${isRecipient ? '#ffffff' : '#f1f5f9'}; border-bottom: ${borderBottom};">
          ${escapeHtml(member.name || 'Participant')}
          ${isRecipient ? ' <span style="color: #22d3ee; font-size: 10px; font-weight: 700;">(Recipient)</span>' : ''}
        </td>
        <td style="padding: 11px 14px; font-size: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #94a3b8; border-bottom: ${borderBottom};">
          ${escapeHtml(member.email)}
        </td>
        <td style="padding: 11px 14px; text-align: center; border-bottom: ${borderBottom};">
          ${roleBadge}
        </td>
      </tr>`;
    })
    .join('');
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
    const participants = record.participants as ParticipantRecipient[] | undefined;
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
    const brevoApiKey = (customApiKey || process.env.BREVO_API_KEY || '').trim();
    const senderEmail = (customSenderEmail || process.env.BREVO_SENDER_EMAIL || 'contests@aiclub.org').trim();
    const senderName = (customSenderName || process.env.BREVO_SENDER_NAME || 'AI Club Contest Master').trim();
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');

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

    // Build fallback team map from batch participants if team_members not provided
    const teamMap = new Map<string, Array<{ name: string; email: string }>>();
    participants.forEach((p) => {
      const tKey = (p.team_name || p.name || 'Individual').trim().toLowerCase();
      if (!teamMap.has(tKey)) {
        teamMap.set(tKey, []);
      }
      const existing = teamMap.get(tKey)!;
      if (!existing.some((m) => m.email.toLowerCase() === p.email.toLowerCase())) {
        existing.push({ name: p.name, email: p.email });
      }
    });

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

      // Resolve all teammates on this participant's team
      const tKey = participantTeam.toLowerCase();
      const members =
        p.team_members && p.team_members.length > 0
          ? p.team_members
          : (teamMap.get(tKey) || [{ name: p.name, email: p.email }]);

      const tableRowsHtml = renderTeamMembersTableRows(members, p.email);

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
        .replace(/\{\{email\}\}/gi, p.email)
        .replace(/\{\{team_members_table\}\}/gi, tableRowsHtml)
        .replace(/\{\{team_members_rows\}\}/gi, tableRowsHtml)
        .replace(/\{\{members_table\}\}/gi, tableRowsHtml);
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
