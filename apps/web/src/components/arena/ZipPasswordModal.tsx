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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 select-none animate-in fade-in duration-150">
      <div className="bg-app-surface border border-app-border rounded-lg w-full max-w-sm p-5 space-y-4 shadow-xl">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded bg-app-muted border border-app-border flex items-center justify-center text-app-accent">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-app-text">
                Stage {stageNumber} Archive Encrypted
              </h3>
              <p className="text-[11px] text-app-subtext">
                Password required for in-memory extraction
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-app-subtext hover:text-app-text cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {(errorMessage || localError) && (
          <div className="p-2.5 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded font-medium">
            {localError || errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <label htmlFor={`archive-password-stage-${stageNumber}`} className="block text-[11px] font-medium text-app-subtext">
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
                className="w-full bg-app-bg border border-app-border rounded px-3 py-1.5 text-xs text-app-text focus:border-app-accent transition-colors"
              />
              <KeyRound className="w-3.5 h-3.5 text-app-subtext absolute right-2.5 top-2" />
            </div>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-app-border">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="px-3 py-1.5 rounded text-xs text-app-subtext hover:text-app-text hover:bg-app-hover transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !password.trim()}
              className="px-3.5 py-1.5 rounded bg-app-accent text-app-bg text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
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
