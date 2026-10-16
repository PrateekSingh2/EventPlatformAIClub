import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Contest Sandbox - Developer Workspace',
  description: 'Serverless anti-cheat contest and stage-locked archive sandbox platform.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" id="app-root" data-theme="graphite" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const savedTheme = localStorage.getItem('contest_sandbox_theme') === 'light' ? 'light' : 'graphite';
                const el = document.getElementById('app-root');
                if (el) {
                  el.setAttribute('data-theme', savedTheme);
                  if (savedTheme === 'light') {
                    el.classList.remove('dark');
                    el.classList.add('light');
                  } else {
                    el.classList.remove('light');
                    el.classList.add('dark');
                  }
                }
              } catch (e) {}

              // Auto-recover if browser tries to fetch a stale Webpack HMR chunk
              window.addEventListener('error', function(e) {
                if (e.message && e.message.includes('Loading chunk') && !sessionStorage.getItem('chunk_retry')) {
                  sessionStorage.setItem('chunk_retry', 'true');
                  window.location.reload();
                }
              });
              window.addEventListener('load', function() {
                sessionStorage.removeItem('chunk_retry');
              });
            `,
          }}
        />
      </head>
      <body className="min-h-screen bg-app-bg text-app-text font-sans antialiased selection:bg-app-accentBg selection:text-app-text transition-colors duration-150">
        {children}
      </body>
    </html>
  );
}
