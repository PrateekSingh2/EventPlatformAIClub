import React from 'react';
import Link from 'next/link';
import { ArrowLeft, FileQuestion } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-app-bg text-app-text p-6 text-center font-sans">
      <div className="p-8 max-w-md w-full bg-app-surface border border-app-border rounded-3xl shadow-xl space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-app-surface-raised border border-app-border flex items-center justify-center text-app-subtext mx-auto">
          <FileQuestion className="w-6 h-6" />
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-app-text font-mono">404</h1>
        <h2 className="text-base font-bold text-app-text">Page Not Found</h2>
        <p className="text-xs text-app-subtext leading-relaxed">
          The page or challenge node you are trying to access does not exist or has been relocated.
        </p>
        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center space-x-2 w-full py-2.5 px-4 rounded-xl bg-app-text text-app-bg text-xs font-semibold hover:opacity-90 transition-opacity min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Safety</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
