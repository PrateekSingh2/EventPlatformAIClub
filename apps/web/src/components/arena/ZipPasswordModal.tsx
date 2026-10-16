'use client';

import React, { useState } from 'react';
import { Lock, KeyRound, AlertCircle, Loader2 } from 'lucide-react';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="relative w-full max-w-md p-6 glass-panel-highlight rounded-2xl border border-cyan-500/40 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Lock className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              Stage {stageNumber} Archive Encrypted
            </h2>
            <p className="text-xs text-slate-400">
              AES / ZipCrypto password required for in-memory extraction
            </p>
          </div>
        </div>

        {(errorMessage || localError) && (
          <div className="flex items-center gap-2 p-3 mb-4 text-xs font-medium text-rose-300 bg-rose-950/40 border border-rose-800/60 rounded-xl">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{localError || errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold tracking-wider text-slate-300 uppercase mb-1.5">
              Decryption Password
            </label>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password..."
                autoFocus
                className="w-full px-4 py-2.5 pl-10 text-sm text-white bg-slate-900/90 border border-slate-700/80 rounded-xl focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 font-mono transition-colors"
              />
              <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-xl transition-all shadow-neon-cyan disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Decrypting in RAM...
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
