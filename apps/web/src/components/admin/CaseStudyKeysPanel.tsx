'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { readClientCache, writeClientCache } from '@/lib/client-cache';

const CACHE_KEY = 'admin_case_study_keys';
const CACHE_TTL_MS = 5 * 60_000;

type PackKey = {
  file: string;
  folder: string;
  title: string;
  passwords: Record<string, string>;
};

type KeyFile = {
  generated_at?: string;
  packs?: PackKey[];
};

interface CaseStudyKeysPanelProps {
  adminSecret: string;
}

export function CaseStudyKeysPanel({ adminSecret }: CaseStudyKeysPanelProps) {
  const [data, setData] = useState<KeyFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (force = false) => {
      if (!adminSecret) return;
      if (!force) {
        const cached = readClientCache<KeyFile>(CACHE_KEY, CACHE_TTL_MS);
        if (cached?.packs?.length) {
          setData(cached);
          setLoading(false);
        }
      }
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/case-study-keys?adminSecret=${encodeURIComponent(adminSecret)}`,
          { headers: { 'x-admin-secret': adminSecret } }
        );
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || 'Failed to load keys');
          return;
        }
        setData(json);
        writeClientCache(CACHE_KEY, json);
      } catch {
        setError('Network error loading answer keys');
      } finally {
        setLoading(false);
      }
    },
    [adminSecret]
  );

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="p-5 rounded-2xl bg-app-surface border border-amber-500/30 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-bold text-app-text flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-amber-400" />
            Case study answer keys (admin only)
          </h4>
          <p className="text-[11px] text-app-subtext mt-1 flex items-start gap-1">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-amber-500 mt-0.5" />
            Do not share with participants. Used for support, pool testing, and unlock verification.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          className="text-xs flex items-center gap-1 text-app-subtext hover:text-app-text"
        >
          <RefreshCw className="w-3 h-3" /> Reload
        </button>
      </div>

      {loading && !data && (
        <div className="flex items-center gap-2 text-xs text-app-subtext">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Loading keys…
        </div>
      )}
      {error && <p className="text-xs text-rose-400">{error}</p>}

      {data?.packs?.map((pack) => (
        <details key={pack.folder} className="rounded-xl border border-app-border bg-slate-900/40 open:pb-3">
          <summary className="cursor-pointer px-3 py-2.5 text-xs font-semibold text-app-text">
            {pack.title}{' '}
            <span className="text-app-subtext font-normal">({pack.file})</span>
          </summary>
          <div className="px-3 overflow-x-auto">
            <table className="w-full text-[11px] font-mono">
              <thead>
                <tr className="text-app-subtext text-left">
                  <th className="py-1 pr-3">Unlocks</th>
                  <th className="py-1">Password</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(pack.passwords || {})
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([stage, pw]) => (
                    <tr key={stage} className="border-t border-app-border/40">
                      <td className="py-1 pr-3 text-emerald-400/90">STAGE_{String(stage).padStart(2, '0')}.zip</td>
                      <td className="py-1">{pw}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </div>
  );
}
