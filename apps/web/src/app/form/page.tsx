'use client';

import React, { useState } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Users } from 'lucide-react';
import {
  TEAM_MEMBER_YEAR_OPTIONS,
  isThreeMemberSquadPrompt,
  type TeamMemberFormFields,
} from '@/lib/team-registration-form';

const EMPTY_MEMBER: TeamMemberFormFields = {
  name: '',
  enrollment_number: '',
  email: '',
  branch: '',
  year: '',
};

const MEMBER_LABELS = ['Member 1 (Team Lead)', 'Member 2', 'Member 3', 'Member 4'];

export default function TeamRegistrationFormPage() {
  const [teamName, setTeamName] = useState('');
  const [members, setMembers] = useState<TeamMemberFormFields[]>([
    { ...EMPTY_MEMBER },
    { ...EMPTY_MEMBER },
    { ...EMPTY_MEMBER },
    { ...EMPTY_MEMBER },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [squadPromptOpen, setSquadPromptOpen] = useState(false);

  const updateMember = (index: number, field: keyof TeamMemberFormFields, value: string) => {
    setMembers((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const submitRegistration = async (squadMergeOptIn?: boolean) => {
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const payload: Record<string, unknown> = { team_name: teamName, members };
      if (squadMergeOptIn !== undefined) {
        payload.squad_merge_opt_in = squadMergeOptIn;
      }

      const res = await fetch('/api/public/team-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const raw = await res.text();
      let data: { error?: string; message?: string } = {};
      try {
        data = raw ? (JSON.parse(raw) as { error?: string; message?: string }) : {};
      } catch {
        data = { error: raw.trim() || 'Submission failed' };
      }

      if (!res.ok) {
        setSquadPromptOpen(false);
        setError(data.error || 'Submission failed');
        return;
      }

      setSquadPromptOpen(false);
      setSuccess(data.message || 'Team merge submitted successfully.');
      setTeamName('');
      setMembers([
        { ...EMPTY_MEMBER },
        { ...EMPTY_MEMBER },
        { ...EMPTY_MEMBER },
        { ...EMPTY_MEMBER },
      ]);
    } catch {
      setSquadPromptOpen(false);
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isThreeMemberSquadPrompt(members)) {
      setSquadPromptOpen(true);
      return;
    }
    void submitRegistration();
  };

  const handleSquadChoice = (wantsFourthMember: boolean) => {
    void submitRegistration(wantsFourthMember);
  };

  return (
    <div className="min-h-screen bg-app-bg text-app-text px-4 py-10 sm:py-14">
      <div className="max-w-2xl mx-auto">
        <header className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-app-accent/15 border border-app-accent/30 mb-4">
            <Users className="w-7 h-7 text-app-accent" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Team Merge</h1>
          <p className="text-sm text-app-subtext mt-2 max-w-md mx-auto">
            Submit your merged team details below. You will stay on this page after submitting.
          </p>
        </header>

        {success && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-400">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-8 rounded-2xl border border-app-border bg-app-surface/80 p-6 sm:p-8 shadow-lg"
          autoComplete="off"
        >
          <div>
            <label htmlFor="team_name" className="block text-xs font-bold uppercase tracking-wider text-app-subtext mb-2">
              Team name
            </label>
            <input
              id="team_name"
              name="team_name"
              required
              maxLength={120}
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              className="w-full rounded-xl border border-app-border bg-app-bg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-app-accent/40"
              placeholder="Your team name"
            />
          </div>

          {members.map((member, index) => (
            <fieldset
              key={index}
              className="space-y-4 rounded-xl border border-app-border/80 bg-app-bg/40 p-4 sm:p-5"
            >
              <legend className="px-2 text-sm font-bold text-app-text">{MEMBER_LABELS[index]}</legend>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Name"
                  required={index === 0}
                  value={member.name}
                  onChange={(v) => updateMember(index, 'name', v)}
                  id={`m${index}_name`}
                />
                <Field
                  label="Enrollment number"
                  required={index === 0}
                  value={member.enrollment_number}
                  onChange={(v) => updateMember(index, 'enrollment_number', v)}
                  id={`m${index}_enrollment`}
                />
                <Field
                  label="Email"
                  required={index === 0}
                  type="email"
                  value={member.email}
                  onChange={(v) => updateMember(index, 'email', v)}
                  id={`m${index}_email`}
                />
                <Field
                  label="Branch"
                  required={index === 0}
                  value={member.branch}
                  onChange={(v) => updateMember(index, 'branch', v)}
                  id={`m${index}_branch`}
                />
                <YearSelect
                  label="Year"
                  required={index === 0}
                  value={member.year}
                  onChange={(v) => updateMember(index, 'year', v)}
                  id={`m${index}_year`}
                />
              </div>
            </fieldset>
          ))}

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-app-accent text-app-bg font-bold py-3.5 text-sm hover:opacity-95 disabled:opacity-60 transition-opacity"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting…
              </>
            ) : (
              'Submit team merge'
            )}
          </button>
        </form>
      </div>

      {squadPromptOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="squad-prompt-title"
        >
          <div className="max-w-md w-full rounded-2xl border border-app-border bg-app-surface shadow-2xl p-6">
            <h2 id="squad-prompt-title" className="text-lg font-bold text-app-text mb-2">
              Do you want 1 more teammate to become a squad?
            </h2>
            <p className="text-sm text-amber-600 dark:text-amber-400 font-medium mb-2">
              Note: we will assign your team 1 member!
            </p>
            <p className="text-xs text-app-subtext mb-6">
              If you choose No, your team will not be included in automatic or manual squad merging.
              If you choose Yes, your team can be merged and receive an assigned 4th member.
            </p>
            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setSquadPromptOpen(false)}
                className="sm:order-first py-3 rounded-xl border border-app-border font-semibold text-sm hover:bg-app-hover disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSquadChoice(false)}
                className="flex-1 py-3 rounded-xl border border-app-border font-semibold text-sm hover:bg-app-hover disabled:opacity-50"
              >
                No
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSquadChoice(true)}
                className="flex-1 py-3 rounded-xl bg-app-accent text-app-bg font-bold text-sm disabled:opacity-50"
              >
                Yes, make us a squad
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function YearSelect({
  label,
  id,
  value,
  onChange,
  required,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div className="sm:col-span-1">
      <label htmlFor={id} className="block text-[11px] font-semibold text-app-subtext mb-1.5">
        {label}
        {required ? ' *' : ''}
      </label>
      <select
        id={id}
        name={id}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-app-border bg-app-bg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-app-accent/40"
      >
        <option value="" disabled={required}>
          Select year
        </option>
        {TEAM_MEMBER_YEAR_OPTIONS.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    </div>
  );
}

function Field({
  label,
  id,
  value,
  onChange,
  required,
  type = 'text',
  placeholder,
  maxLength,
  inputMode,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
  maxLength?: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}) {
  return (
    <div className="sm:col-span-1">
      <label htmlFor={id} className="block text-[11px] font-semibold text-app-subtext mb-1.5">
        {label}
        {required ? ' *' : ''}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        inputMode={inputMode}
        maxLength={maxLength}
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-app-border bg-app-bg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-app-accent/40"
      />
    </div>
  );
}
