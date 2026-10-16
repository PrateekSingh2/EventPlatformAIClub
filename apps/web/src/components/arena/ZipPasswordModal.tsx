'use client';

import React, { useState } from 'react';
import { Lock, KeyRound, AlertCircle, Loader2, X } from 'lucide-react';

interface ZipPasswordModalProps {
  isOpen: boolean;
  stageNumber: number;
  errorMessage?: string | null;
  onSubmit: (password: string) => Promise<void>;
  onCancel: () => void;
}

export function ZipPasswordModal({
  isOpen,
  stageNumber,
  errorMessage,
  onSubmit,
  onCancel,
}: ZipPasswordModalProps) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setLocalError('Please enter the archive password');
      return;
    }
    setLoading(true);
    setLocalError(null);
    try {
      await onSubmit(password);
    } catch (err: any) {
      setLocalError(err.message || 'Decryption failed. Please check the password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl select-none animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-app-surface border border-app-border rounded-3xl w-full max-w-sm p-6 space-y-4 shadow-[0_25px_60px_rgba(0,0,0,0.6)] relative overflow-hidden"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-2xl bg-app-muted border border-app-border flex items-center justify-center text-app-accent shadow-xs">
              <Lock className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-app-text tracking-tight">
                Stage {stageNumber} Archive Encrypted
              </h3>
              <p className="text-[11px] text-app-subtext">
                Password required for in-memory extraction
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-app-subtext hover:text-app-text cursor-pointer p-1.5 rounded-xl hover:bg-app-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {(errorMessage || localError) && (
          <div className="p-3 text-xs text-rose-500 dark:text-rose-400 bg-rose-500/10 border border-rose-500/25 rounded-xl font-medium shadow-xs">
            {localError || errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor={`archive-password-stage-${stageNumber}`} className="block text-[11px] font-mono text-app-subtext">
              ARCHIVE_PASSWORD
            </label>
            <div className="relative">
              <input
                id={`archive-password-stage-${stageNumber}`}
                name="archivePassword"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password..."
                autoFocus
                disabled={loading}
                className="w-full bg-app-bg border border-app-border rounded-xl px-3 pr-9 py-2.5 text-xs text-app-text shadow-inner focus:border-app-accent focus:outline-none transition-colors placeholder:text-app-subtext/40 font-mono"
              />
              <KeyRound className="w-3.5 h-3.5 text-app-subtext absolute right-2.5 top-3" />
            </div>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-app-border">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="px-3.5 py-1.5 rounded-xl text-xs text-app-subtext hover:text-app-text hover:bg-app-hover transition-colors cursor-pointer font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !password.trim()}
              className="px-4 py-1.5 rounded-xl bg-app-accent text-app-bg text-xs font-semibold hover:opacity-95 active:scale-[0.98] shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" />
                  Decrypting...
                </>
              ) : (
                'Unlock Archive'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
