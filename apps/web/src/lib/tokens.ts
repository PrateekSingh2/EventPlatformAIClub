/**
 * Industrial-grade Contest Token Generator & Exporter
 * Token format: AX-DEMO-2026
 * - First block: 2 uppercase letters [A-Z]{2}
 * - Second block: 4 uppercase letters [A-Z]{4}
 * - Third block: 4 numeric digits [0-9]{4}
 */

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';

export function generateContestToken(existingSet?: Set<string>): string {
  while (true) {
    let block1 = '';
    for (let i = 0; i < 2; i++) {
      block1 += LETTERS[Math.floor(Math.random() * LETTERS.length)];
    }

    let block2 = '';
    for (let i = 0; i < 4; i++) {
      block2 += LETTERS[Math.floor(Math.random() * LETTERS.length)];
    }

    let block3 = '';
    for (let i = 0; i < 4; i++) {
      block3 += DIGITS[Math.floor(Math.random() * DIGITS.length)];
    }

    const token = `${block1}-${block2}-${block3}`;
    if (!existingSet || !existingSet.has(token)) {
      if (existingSet) existingSet.add(token);
      return token;
    }
  }
}

export function generateContestTokenBatch(count: number, existingTokens?: string[]): string[] {
  const existingSet = new Set<string>(existingTokens || []);
  const tokens: string[] = [];

  for (let i = 0; i < count; i++) {
    tokens.push(generateContestToken(existingSet));
  }

  return tokens;
}

/**
 * Downloads a formatted plain text file containing all contest access tokens
 * and single-account activation instructions.
 */
export function downloadTokensFile(contestTitle: string, tokens: string[]): void {
  if (typeof window === 'undefined') return;

  const sanitizedTitle = contestTitle.replace(/[^a-zA-Z0-9_-]/g, '_') || 'contest';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `${sanitizedTitle}-tokens-${timestamp}.txt`;

  const header = [
    '================================================================================',
    `EVENTPLATFORM AI CLUB - CONTEST PARTICIPANT ACCESS TOKENS`,
    `Contest: ${contestTitle}`,
    `Total Generated Tokens: ${tokens.length}`,
    `Generated At: ${new Date().toLocaleString()}`,
    '================================================================================',
    '',
    'CRITICAL ACTIVATION & USAGE INSTRUCTIONS:',
    '1. One token is strictly valid for ONE account ID only.',
    '2. DO NOT attempt to use or share this token across multiple accounts.',
    '3. The first account activating this token will have permanent, exclusive access to this platform.',
    '4. Any subsequent attempt to activate an already-bound token will be rejected immediately.',
    '',
    '================================================================================',
    'CONTESTANT ACCESS TOKENS LIST:',
    '================================================================================',
    '',
  ].join('\r\n');

  const tokenList = tokens.map((token, index) => `${String(index + 1).padStart(4, ' ')}. ${token}`).join('\r\n');
  const fileContent = `${header}${tokenList}\r\n\r\n================================================================================\r\n`;

  const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
