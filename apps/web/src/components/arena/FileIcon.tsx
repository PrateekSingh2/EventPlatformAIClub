import React from 'react';

interface FileIconProps {
  filename: string;
  className?: string;
}

// 1. Python official two-tone snake logo
export function PythonIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M11.914 2C6.738 2 7.062 4.254 7.062 4.254l.006 2.338h4.912v.7H5.068S2 7.018 2 12.193c0 5.176 2.673 5.012 2.673 5.012h1.595v-2.254s-.086-2.684 2.637-2.684h4.887s2.551.041 2.551-2.51V4.509S16.738 2 11.914 2zm-2.7 1.711a.984.984 0 1 1 0 1.968.984.984 0 0 1 0-1.968z"
        fill="#387EB8"
      />
      <path
        d="M12.086 22c5.176 0 4.852-2.254 4.852-2.254l-.006-2.338H12.02v-.7h6.912S22 16.982 22 11.807c0-5.176-2.673-5.012-2.673-5.012h-1.595v2.254s.086 2.684-2.637 2.684H10.21s-2.551-.041-2.551 2.51v4.25S7.262 22 12.086 22zm2.7-1.711a.984.984 0 1 1 0-1.968.984.984 0 0 1 0 1.968z"
        fill="#FFE052"
      />
    </svg>
  );
}

// 2. Markdown official blue M↓ logo
export function MarkdownIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="22" height="15" x="1" y="4.5" rx="2" fill="#0288D1" />
      <path
        d="M3.5 15.5V8.5h2l2 2.6 2-2.6h2v7h-1.8v-4.2l-1.8 2.2h-.8l-1.8-2.2v4.2H3.5zm13 0l-3-3.6h1.8V8.5h2v3.4h1.8l-2.6 3.6z"
        fill="#ffffff"
      />
    </svg>
  );
}

// 3. Spreadsheet / CSV / Excel table icon
export function CsvIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="18" height="18" x="3" y="3" rx="2.5" fill="#107C41" />
      <path d="M3 8.5h18M3 14h18M9 3v18M15 3v18" stroke="#ffffff" strokeWidth="1.2" opacity="0.85" />
    </svg>
  );
}

// 4. Text document icon with blue lines
export function TextIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
        fill="#64748B"
        opacity="0.2"
      />
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
        stroke="#94A3B8"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6" stroke="#94A3B8" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 12h8M8 15h5M8 9h3" stroke="#38BDF8" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// 5. JSON yellow braces icon
export function JsonIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="18" height="18" x="3" y="3" rx="2.5" fill="#FBBF24" opacity="0.15" />
      <rect width="18" height="18" x="3" y="3" rx="2.5" stroke="#F59E0B" strokeWidth="1.4" />
      <path
        d="M9 8.5C8 8.5 7.5 9 7.5 10v1c0 .5-.5 1-1 1 .5 0 1 .5 1 1v1c0 1 .5 1.5 1.5 1.5M15 8.5c1 0 1.5.5 1.5 1.5v1c0 .5.5 1 1 1-.5 0-1 .5-1 1v1c0 1-.5 1.5-1.5 1.5"
        stroke="#F59E0B"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// 6. JavaScript JS yellow badge
export function JavaScriptIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="19" height="19" x="2.5" y="2.5" rx="2.5" fill="#F7DF1E" />
      <path
        d="M8.5 17c.5.8 1.1 1.2 2 1.2 1.1 0 1.6-.6 1.6-1.5v-5.8h-1.6v5.8c0 .3-.1.5-.4.5-.3 0-.5-.1-.6-.4L8.5 17zm5.5-4.2c-.7 0-1.2.4-1.2 1 0 .7.4 1 1.3 1.3 1.2.5 1.7 1.1 1.7 2 0 1.3-.9 2.1-2.4 2.1-1.1 0-1.8-.5-2.4-1.4l1.2-.9c.4.5.7.8 1.2.8.5 0 .8-.3.8-.7 0-.4-.3-.6-1.1-1-1.2-.5-1.8-1-1.8-1.9 0-1.1.9-1.9 2.2-1.9.9 0 1.6.4 2 1.1l-1.2.9c-.3-.4-.6-.6-1-.6z"
        fill="#000000"
      />
    </svg>
  );
}

// 7. TypeScript TS blue badge
export function TypeScriptIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="19" height="19" x="2.5" y="2.5" rx="2.5" fill="#3178C6" />
      <path
        d="M6.5 9h6.2v1.8h-2.1v6.2h-1.9v-6.2H6.5V9zm7.5 4c.6-.5 1.4-.8 2.2-.8 1.5 0 2.4.8 2.4 2 0 1.3-.8 2-2.3 2.4-.9.2-1.2.4-1.2.7 0 .3.3.5.9.5.6 0 1.2-.3 1.7-.7l.9 1.2c-.7.7-1.6 1-2.6 1-1.8 0-2.8-1-2.8-2.3 0-1.4.9-2.1 2.4-2.5.9-.2 1.2-.4 1.2-.7 0-.3-.3-.4-.7-.4-.5 0-1 .2-1.4.5l-.7-.9z"
        fill="#ffffff"
      />
    </svg>
  );
}

// 8. HTML orange tag icon
export function HtmlIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 3l1.5 17 6.5 2 6.5-2L20 3H4zm13.3 4.5l-.2 2.2H9.8l.2 2.3h6.8l-.5 5.5-4.3 1.2-4.3-1.2-.3-3.3h2.2l.2 1.7 2.2.6 2.2-.6.3-2.7H7.3L6.7 7.5h10.6z" fill="#E44D26" />
    </svg>
  );
}

// 9. CSS blue tag icon
export function CssIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 3l1.5 17 6.5 2 6.5-2L20 3H4zm13.3 4.5l-.2 2.2H9.8l.2 2.3h6.8l-.5 5.5-4.3 1.2-4.3-1.2-.3-3.3h2.2l.2 1.7 2.2.6 2.2-.6.3-2.7H7.3L6.7 7.5h10.6z" fill="#264DE4" />
    </svg>
  );
}

// 10. Image purple picture icon
export function ImageIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="18" height="18" x="3" y="3" rx="2.5" stroke="#A855F7" strokeWidth="1.5" />
      <circle cx="8.5" cy="8.5" r="1.5" fill="#A855F7" />
      <path d="M21 15l-5-5L5 21" stroke="#A855F7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// 11. Shell / Bash green terminal icon
export function ShellIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="20" height="16" x="2" y="4" rx="2" fill="#0F172A" stroke="#4ADE80" strokeWidth="1.4" />
      <path d="M6 9l3 3-3 3M12 15h4" stroke="#4ADE80" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// 12. Config / YAML red sliders icon
export function ConfigIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="18" height="18" x="3" y="3" rx="2.5" fill="#EF4444" opacity="0.15" />
      <rect width="18" height="18" x="3" y="3" rx="2.5" stroke="#EF4444" strokeWidth="1.4" />
      <path d="M7 8h10M7 12h10M7 16h10" stroke="#EF4444" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="10" cy="8" r="1.5" fill="#EF4444" />
      <circle cx="14" cy="12" r="1.5" fill="#EF4444" />
      <circle cx="9" cy="16" r="1.5" fill="#EF4444" />
    </svg>
  );
}

/**
 * Main VS Code File Extension Icon Dispatcher
 * Returns the exact VS Code style extension icon based on filename
 */
export function FileExtensionIcon({ filename, className = 'w-3.5 h-3.5 shrink-0' }: FileIconProps) {
  const name = (filename || '').toLowerCase();

  // Python
  if (name.endsWith('.py') || name.endsWith('.pyw') || name.endsWith('.ipynb')) {
    return <PythonIcon className={className} />;
  }

  // Markdown
  if (name.endsWith('.md') || name.endsWith('.markdown')) {
    return <MarkdownIcon className={className} />;
  }

  // Spreadsheet / CSV / Excel
  if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return <CsvIcon className={className} />;
  }

  // JSON
  if (name.endsWith('.json') || name.endsWith('.jsonc') || name.endsWith('.json5')) {
    return <JsonIcon className={className} />;
  }

  // TypeScript / React TSX
  if (name.endsWith('.ts') || name.endsWith('.tsx')) {
    return <TypeScriptIcon className={className} />;
  }

  // JavaScript / React JSX
  if (name.endsWith('.js') || name.endsWith('.jsx') || name.endsWith('.mjs') || name.endsWith('.cjs')) {
    return <JavaScriptIcon className={className} />;
  }

  // HTML
  if (name.endsWith('.html') || name.endsWith('.htm')) {
    return <HtmlIcon className={className} />;
  }

  // CSS / SCSS
  if (name.endsWith('.css') || name.endsWith('.scss') || name.endsWith('.sass') || name.endsWith('.less')) {
    return <CssIcon className={className} />;
  }

  // Images
  if (
    name.endsWith('.png') ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    name.endsWith('.gif') ||
    name.endsWith('.svg') ||
    name.endsWith('.webp') ||
    name.endsWith('.ico')
  ) {
    return <ImageIcon className={className} />;
  }

  // Shell scripts
  if (name.endsWith('.sh') || name.endsWith('.bash') || name.endsWith('.zsh')) {
    return <ShellIcon className={className} />;
  }

  // YAML / Config / Environment
  if (name.endsWith('.yaml') || name.endsWith('.yml') || name.endsWith('.env') || name.endsWith('.config')) {
    return <ConfigIcon className={className} />;
  }

  // Prompt / Text / Default
  return <TextIcon className={className} />;
}
