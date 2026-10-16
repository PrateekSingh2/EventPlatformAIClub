import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { verifyAdminSecret } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { adminSecret, subject, htmlTemplate, participants } = body;

    const secret = adminSecret || req.headers.get('x-admin-secret');
    if (!verifyAdminSecret(secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!Array.isArray(participants) || participants.length === 0) {
      return NextResponse.json(
        { error: 'participants array is required' },
        { status: 400 }
      );
    }

    if (!subject || !htmlTemplate) {
      return NextResponse.json(
        { error: 'subject and htmlTemplate are required' },
        { status: 400 }
      );
    }

    const host = process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com';
    const port = Number(process.env.BREVO_SMTP_PORT) || 587;
    const user = process.env.BREVO_SMTP_USER;
    const pass = process.env.BREVO_SMTP_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL || 'contests@aiclub.org';
    const senderName = process.env.BREVO_SENDER_NAME || 'AI Club Contest Master';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    if (!user || !pass) {
      return NextResponse.json(
        {
          error:
            'Brevo SMTP credentials (BREVO_SMTP_USER or BREVO_SMTP_KEY) not configured on server.',
        },
        { status: 500 }
      );
    }

    // Configure pooled transporter to reuse SMTP connections and minimize TLS handshake overhead
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true for 465, false for 587
      pool: true,
      maxConnections: 5,
      maxMessages: Infinity,
      auth: {
        user,
        pass,
      },
      connectionTimeout: 4000,
      greetingTimeout: 4000,
      socketTimeout: 5000,
    });

    let sentCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // Chunk participants into batches of 25 to guarantee execution completes within Netlify's 10-second limit
    const CHUNK_SIZE = 25;
    for (let i = 0; i < participants.length; i += CHUNK_SIZE) {
      const chunk = participants.slice(i, i + CHUNK_SIZE);

      const sendPromises = chunk.map(async (p: { name: string; email: string; token: string }) => {
        const participantName = p.name || 'Contestant';
        const participantToken = p.token || '';
        const accessLink = `${appUrl}/arena?token=${encodeURIComponent(participantToken)}`;

        // Replace template variables
        const personalizedHtml = htmlTemplate
          .replace(/\{\{name\}\}/g, participantName)
          .replace(/\{\{token\}\}/g, participantToken)
          .replace(/\{\{access_link\}\}/g, accessLink);

        return transporter.sendMail({
          from: `"${senderName}" <${senderEmail}>`,
          to: p.email,
          subject: subject.replace(/\{\{name\}\}/g, participantName),
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
          errors.push(
            `Failed for ${chunk[j].email}: ${res.reason?.message || 'SMTP transmission error'}`
          );
        }
      }
    }

    // Close the pooled transporter connections cleanly
    transporter.close();

    return NextResponse.json({
      total: participants.length,
      sent: sentCount,
      failed: failedCount,
      errors: errors.slice(0, 10), // return top 10 errors if any
    });
  } catch (error: any) {
    console.error('[API POST /api/brevo/send error]:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to dispatch emails via Brevo SMTP' },
      { status: 500 }
    );
  }
}
