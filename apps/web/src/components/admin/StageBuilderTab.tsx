'use client';

import React, { useState, useEffect } from 'react';
import { Stage, Contest, PreflightValidationResult } from '@/lib/types';
import { validateArchiveDecryption, extractInnerZipBlob, countStagesInOuterArchive } from '@/lib/zip-engine';
import { mapWithConcurrency } from '@/lib/async-pool';
import { downloadTokensFile } from '@/lib/tokens';
import { supabase } from '@/lib/supabase';
import {
  Upload,
  Shuffle,
  Plus,
  Save,
  CheckCircle2,
  AlertCircle,
  Lock,
  Layers,
  FileCode,
  Clock,
  Loader2,
  Check,
  FileArchive,
  KeyRound,
  AlertTriangle,
  Trophy,
  Download,
  Trash2,
  Edit3,
  Users,
  Radio,
  ArrowLeft,
  Sparkles,
  RefreshCw,
  FileSpreadsheet,
  Eye,
  EyeOff,
  Database,
  ArrowUp,
  ArrowDown,
  Wand2,
  CheckCheck,
  ShieldCheck,
} from 'lucide-react';

interface StageBuilderTabProps {
  adminSecret: string;
}

export interface TeamRosterItem {
  teamKey: string;
  teamName: string;
  teamSize?: string;
  isSolo: boolean;
  memberCount: number;
  members: Array<{ name: string; email: string; token: string }>;
  tokens: string[];
  primaryToken: string;
}

type TabMode = 'bulk' | 'list' | 'create' | 'edit';
type BulkDistributionMode = 'pool' | 'unique';

const UPLOAD_CONCURRENCY = 4;
const MANUAL_POOL_OVERRIDE_STORAGE_KEY = 'stageBuilder:manualPoolOverrides';

function makeUniquePoolKey(fileName: string): string {
  const base = fileName
    .replace(/\.zip$/i, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return `${base || 'case-study'}-${suffix}`.toLowerCase().slice(0, 80);
}

type PoolCatalogItem = {
  poolKey: string;
  storagePath: string;
  displayName: string;
  uploadedAt?: string;
};

async function uploadZipToStorageTarget(
  file: File,
  target: { storagePath: string; token: string; uploadUrl?: string }
): Promise<void> {
  let uploaded = false;
  try {
    const { error: uploadErr } = await supabase.storage
      .from('stages')
      .uploadToSignedUrl(target.storagePath, target.token, file);
    if (!uploadErr) uploaded = true;
  } catch {}

  if (!uploaded && target.uploadUrl) {
    const res = await fetch(target.uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type || 'application/zip' },
    });
    if (!res.ok) {
      throw new Error(`Failed to upload ${file.name} to storage: ${res.statusText}`);
    }
    uploaded = true;
  }

  if (!uploaded) {
    throw new Error(`Failed to upload ${file.name}`);
  }
}

export function StageBuilderTab({ adminSecret }: StageBuilderTabProps) {
  // Mode State: 'list' (shows all contests), 'create' (new contest), 'edit' (edit existing)
  const [mode, setMode] = useState<TabMode>('bulk');

  // Bulk Token Archives State (Option 1: Pure Multi-Stage ZIPs, Zero CSV)
  const [bulkZipFiles, setBulkZipFiles] = useState<File[]>([]);
  const [bulkStageCount, setBulkStageCount] = useState<number>(12);
  const [detectingStages, setDetectingStages] = useState(false);
  const [bulkTeamMappings, setBulkTeamMappings] = useState<string[]>([]);
  const [distributionMode, setDistributionMode] = useState<BulkDistributionMode>('pool');
  const [poolCatalog, setPoolCatalog] = useState<PoolCatalogItem[]>([]);
  const [queuedPoolFiles, setQueuedPoolFiles] = useState<File[]>([]);
  const [loadingPoolCatalog, setLoadingPoolCatalog] = useState(false);
  /** teamKey → poolKey in storage (manual or random assignment) */
  const [teamPoolByKey, setTeamPoolByKey] = useState<Record<string, string>>({});
  /** Manual picks always win over random (persisted in browser) */
  const [manualPoolOverrides, setManualPoolOverrides] = useState<Record<string, string>>({});
  const [showManualPoolAssign, setShowManualPoolAssign] = useState(false);
  const [availableTeams, setAvailableTeams] = useState<TeamRosterItem[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkUploadProgress, setBulkUploadProgress] = useState<string | null>(null);
  const [bulkCommittedArchives, setBulkCommittedArchives] = useState<Array<{
    id: string;
    access_token: string;
    team_name?: string;
    storage_path: string;
    stage_count: number;
    uploaded_at: string;
  }>>([]);
  const [loadingCommittedArchives, setLoadingCommittedArchives] = useState(false);

  // Contests Directory State
  const [contests, setContests] = useState<Contest[]>([]);
  const [loadingContests, setLoadingContests] = useState(false);
  const [activeEditingContestId, setActiveEditingContestId] = useState<string | null>(null);

  // Contest Metadata State
  const [contestTitle, setContestTitle] = useState('Pixel and Anomaly CTF 2026');
  const [numberOfTeams, setNumberOfTeams] = useState<number>(50);

  // Stages List in current contest
  const [stages, setStages] = useState<Stage[]>([]);
  const [loadingStages, setLoadingStages] = useState(true);

  // Active Stage Form State
  const [stageNumber, setStageNumber] = useState<number>(1);
  const [title, setTitle] = useState('');
  const [s3Key, setS3Key] = useState('');
  const [isPasswordProtected, setIsPasswordProtected] = useState(false);
  const [zipPassword, setZipPassword] = useState('');
  const [allowedCopyFilename, setAllowedCopyFilename] = useState('ai_prompt.txt');
  const [minExpectedSeconds, setMinExpectedSeconds] = useState(60);
  const [points, setPoints] = useState(100);

  // Storage Upload State
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // Archive Decryption Preflight State
  const [preflightResult, setPreflightResult] = useState<PreflightValidationResult | null>(null);
  const [validatingArchive, setValidatingArchive] = useState(false);

  // Save / Deploy State
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Preflight validation effect: re-runs whenever selected archive or password changes
  useEffect(() => {
    if (!uploadFile) {
      setPreflightResult(null);
      return;
    }

    let isMounted = true;
    const runValidation = async () => {
      setValidatingArchive(true);
      try {
        const result = await validateArchiveDecryption(uploadFile, zipPassword);
        if (isMounted) {
          setPreflightResult(result);
          if (result.isEncrypted && !isPasswordProtected) {
            setIsPasswordProtected(true);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setPreflightResult({
            valid: false,
            isEncrypted: false,
            fileCount: 0,
            filenames: [],
            message: err.message || 'Validation error',
            error: 'ERROR',
          });
        }
      } finally {
        if (isMounted) {
          setValidatingArchive(false);
        }
      }
    };

    runValidation();
    return () => {
      isMounted = false;
    };
  }, [uploadFile, zipPassword, isPasswordProtected]);

  // Fetch available teams & participants for strict 1-to-1 unique ZIP mapping
  const fetchAvailableTokens = async () => {
    setLoadingTokens(true);
    try {
      const res = await fetch('/api/admin/participants', {
        headers: { 'x-admin-secret': adminSecret },
      });
      const data = await res.json();
      if (res.ok && data.participants) {
        const teamsMap = new Map<string, TeamRosterItem>();
        for (const p of data.participants as any[]) {
          const token = (p.access_token || '').trim().toUpperCase();
          if (!token) continue;

          const rawTeamName = (p.team_name || '').trim();
          const isSolo = !rawTeamName;
          const teamKey = isSolo ? `solo:${p.email.toLowerCase()}` : rawTeamName.toLowerCase();
          const displayTeamName = isSolo ? `${p.name || p.email} (Solo)` : rawTeamName;

          if (!teamsMap.has(teamKey)) {
            teamsMap.set(teamKey, {
              teamKey,
              teamName: displayTeamName,
              teamSize: p.team_size || (isSolo ? 'Solo' : undefined),
              isSolo,
              memberCount: 0,
              members: [],
              tokens: [],
              primaryToken: token,
            });
          }

          const team = teamsMap.get(teamKey)!;
          team.memberCount++;
          team.members.push({
            name: p.name || p.email.split('@')[0],
            email: p.email,
            token,
          });
          if (!team.tokens.includes(token)) {
            team.tokens.push(token);
          }
        }

        const teamsArray = Array.from(teamsMap.values());
        setAvailableTeams(teamsArray);

        // Auto-assign unique teams to zip files if files already loaded
        setBulkTeamMappings((prev) => {
          if (bulkZipFiles.length === 0) return prev;
          if (prev.length === bulkZipFiles.length && prev.some(Boolean)) return prev;
          return bulkZipFiles.map((_, i) => (i < teamsArray.length ? teamsArray[i].teamKey : ''));
        });
      }
    } catch (err) {
      console.warn('Failed to fetch participant tokens for bulk mapping', err);
    } finally {
      setLoadingTokens(false);
    }
  };

  // Fetch committed token archives from the database
  const fetchPoolCatalog = async () => {
    setLoadingPoolCatalog(true);
    try {
      const res = await fetch(
        `/api/admin/stages/bulk-upload?adminSecret=${encodeURIComponent(adminSecret)}&listPool=1`,
        { headers: { 'x-admin-secret': adminSecret } }
      );
      const data = await res.json();
      if (res.ok && Array.isArray(data.poolItems)) {
        setPoolCatalog(data.poolItems);
      }
    } catch (err) {
      console.warn('Failed to load case-study pool', err);
    } finally {
      setLoadingPoolCatalog(false);
    }
  };

  const fetchCommittedArchives = async () => {
    setLoadingCommittedArchives(true);
    try {
      const res = await fetch(`/api/admin/stages/bulk-upload?adminSecret=${encodeURIComponent(adminSecret)}`, {
        headers: { 'x-admin-secret': adminSecret },
      });
      const data = await res.json();
      if (res.ok && data.archives) {
        setBulkCommittedArchives(data.archives);
      }
    } catch (err) {
      console.warn('Failed to fetch committed archives', err);
    } finally {
      setLoadingCommittedArchives(false);
    }
  };

  // Handle selection of X ZIP files + auto-detect stage count in RAM
  const handleZipFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) => f.name.toLowerCase().endsWith('.zip'));
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    if (distributionMode === 'pool') {
      setQueuedPoolFiles((prev) => {
        const names = new Set(prev.map((f) => f.name));
        return [...prev, ...files.filter((f) => !names.has(f.name))];
      });
      if (files.length > 0) {
        setDetectingStages(true);
        try {
          const detected = await countStagesInOuterArchive(files[0]);
          if (detected > 1) setBulkStageCount(detected);
        } catch {
          /* optional */
        } finally {
          setDetectingStages(false);
        }
      }
      e.target.value = '';
      return;
    }

    setBulkZipFiles(files);
    if (availableTeams.length > 0) {
      const initialMappings = files.map((_, i) => (i < availableTeams.length ? availableTeams[i].teamKey : ''));
      setBulkTeamMappings(initialMappings);
    } else {
      setBulkTeamMappings(files.map(() => ''));
    }

    if (files.length > 0) {
      setDetectingStages(true);
      try {
        const detected = await countStagesInOuterArchive(files[0]);
        if (detected > 1) setBulkStageCount(detected);
      } catch (err) {
        console.warn('Could not inspect archive header in RAM', err);
      } finally {
        setDetectingStages(false);
      }
    }
  };

  const poolKeyIsValid = (poolKey: string) => poolCatalog.some((p) => p.poolKey === poolKey);

  const pickRandomPoolKey = () => {
    const pick = poolCatalog[Math.floor(Math.random() * poolCatalog.length)];
    return pick?.poolKey;
  };

  /** Random for every team; manual overrides stay fixed. */
  const buildRandomPoolAssignmentPreservingManual = (): Record<string, string> => {
    const next: Record<string, string> = {};
    for (const team of availableTeams) {
      const manual = manualPoolOverrides[team.teamKey];
      if (manual && poolKeyIsValid(manual)) {
        next[team.teamKey] = manual;
        continue;
      }
      const randomKey = pickRandomPoolKey();
      if (randomKey) next[team.teamKey] = randomKey;
    }
    return next;
  };

  /**
   * Deploy-ready map: manual override → keep preview in teamPoolByKey → random fill gaps.
   */
  const finalizePoolMapping = (source: Record<string, string> = {}): Record<string, string> => {
    const next: Record<string, string> = {};
    for (const team of availableTeams) {
      const manual = manualPoolOverrides[team.teamKey];
      if (manual && poolKeyIsValid(manual)) {
        next[team.teamKey] = manual;
        continue;
      }
      const preview = source[team.teamKey];
      if (preview && poolKeyIsValid(preview)) {
        next[team.teamKey] = preview;
        continue;
      }
      const randomKey = pickRandomPoolKey();
      if (randomKey) next[team.teamKey] = randomKey;
    }
    return next;
  };

  const handleRandomizePoolToAllTeams = () => {
    if (availableTeams.length === 0) {
      setStatusMessage({ type: 'error', text: 'No registered teams found. Refresh roster first.' });
      return;
    }
    if (poolCatalog.length === 0) {
      setStatusMessage({ type: 'error', text: 'Upload ZIPs to the pool first (stored in Supabase).' });
      return;
    }
    const next = buildRandomPoolAssignmentPreservingManual();
    setTeamPoolByKey(next);
    const manualCount = Object.keys(manualPoolOverrides).filter((k) => poolKeyIsValid(manualPoolOverrides[k])).length;
    setStatusMessage({
      type: 'success',
      text:
        manualCount > 0
          ? `Random mapping for ${availableTeams.length - manualCount} team(s); ${manualCount} manual override(s) kept. Click Save or Assign all to commit.`
          : `Random mapping: ${availableTeams.length} teams → ${poolCatalog.length} pool ZIP(s). Adjust manually if needed, then Assign.`,
    });
  };

  const handleUploadQueuedToPool = async () => {
    if (queuedPoolFiles.length === 0) {
      setStatusMessage({ type: 'error', text: 'Select ZIP files to add to the pool.' });
      return;
    }
    setBulkUploading(true);
    setStatusMessage(null);
    try {
      const items = queuedPoolFiles.map((file) => ({
        file,
        poolKey: makeUniquePoolKey(file.name),
      }));

      setBulkUploadProgress(`Reserving ${items.length} pool slot(s)...`);
      const presignRes = await fetch('/api/admin/stages/bulk-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'presign-pool',
          adminSecret,
          items: items.map((x) => ({ poolKey: x.poolKey })),
        }),
      });
      const presignData = await presignRes.json();
      if (!presignRes.ok || !presignData.poolTargets) {
        throw new Error(presignData.error || 'Failed to presign pool uploads');
      }

      const poolTargets = presignData.poolTargets as Array<{
        poolKey: string;
        storagePath: string;
        token: string;
        uploadUrl?: string;
      }>;

      await mapWithConcurrency(items, UPLOAD_CONCURRENCY, async (item, i) => {
        const target = poolTargets[i];
        if (!target) throw new Error(`Missing upload target for ${item.file.name}`);
        setBulkUploadProgress(`Storing in pool ${i + 1}/${items.length}: ${item.file.name}`);
        await uploadZipToStorageTarget(item.file, target);
      });

      setQueuedPoolFiles([]);
      await fetchPoolCatalog();
      setStatusMessage({
        type: 'success',
        text: `Added ${items.length} ZIP(s) to the case-study pool. Use Assign when ready.`,
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Pool upload failed' });
    } finally {
      setBulkUploading(false);
      setBulkUploadProgress(null);
    }
  };

  const handleDeployPoolAssignments = async (assignmentOverride?: Record<string, string>) => {
    if (poolCatalog.length === 0) {
      setStatusMessage({ type: 'error', text: 'Pool is empty. Upload ZIPs first.' });
      return;
    }
    if (availableTeams.length === 0) {
      setStatusMessage({ type: 'error', text: 'No registered teams found. Refresh roster first.' });
      return;
    }

    const mapping = assignmentOverride ?? finalizePoolMapping(teamPoolByKey);
    setTeamPoolByKey(mapping);

    const poolByKey = new Map(poolCatalog.map((p) => [p.poolKey, p]));
    const unassigned = availableTeams.filter((t) => !mapping[t.teamKey]);
    if (unassigned.length > 0) {
      setStatusMessage({
        type: 'error',
        text: `${unassigned.length} team(s) could not be mapped — check that the pool has at least one ZIP.`,
      });
      return;
    }

    setBulkUploading(true);
    setStatusMessage(null);
    try {
      setBulkUploadProgress(
        `Assigning ${availableTeams.length} teams (${availableTeams.reduce((n, t) => n + t.tokens.length, 0)} tokens)...`
      );

      const archives = availableTeams.map((team) => {
        const poolKey = mapping[team.teamKey];
        const item = poolByKey.get(poolKey);
        if (!item) throw new Error(`Unknown pool ZIP for team "${team.teamName}"`);
        return {
          teamKey: team.teamKey,
          teamName: team.teamName,
          tokens: team.tokens,
          storagePath: item.storagePath,
          stageCount: bulkStageCount,
          poolKey: item.poolKey,
        };
      });

      const commitRes = await fetch('/api/admin/stages/bulk-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'commit-pool',
          adminSecret,
          archives,
        }),
      });

      const commitData = await commitRes.json();
      if (!commitRes.ok || !commitData.success) {
        throw new Error(commitData.error || 'Failed to commit pool assignments');
      }

      const commitErrors = (commitData.errors || []) as Array<{ target: string; error: string }>;
      if (commitErrors.length > 0) {
        throw new Error(commitErrors.map((e) => `${e.target}: ${e.error}`).join('; '));
      }

      setStatusMessage({
        type: 'success',
        text: `Assigned pool ZIPs to ${availableTeams.length} teams. Participants can fetch archives from the arena.`,
      });
      await fetchCommittedArchives();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Assign failed' });
    } finally {
      setBulkUploading(false);
      setBulkUploadProgress(null);
    }
  };

  const handleAssignAllTeamsOneClick = async () => {
    if (poolCatalog.length === 0 || availableTeams.length === 0) {
      setStatusMessage({ type: 'error', text: 'Need pool ZIPs and registered teams before Assign.' });
      return;
    }
    const mapping = buildRandomPoolAssignmentPreservingManual();
    setTeamPoolByKey(mapping);
    await handleDeployPoolAssignments(mapping);
  };

  // Strictly distribute unique challenge archives across all registered teams (1 unique ZIP per team)
  const handleRandomizeAssignments = () => {
    if (availableTeams.length === 0) {
      setStatusMessage({ type: 'error', text: 'No registered teams found in database. Ingest participants first.' });
      return;
    }
    // Fisher-Yates random permutation across teams
    const shuffledTeams = [...availableTeams];
    for (let i = shuffledTeams.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledTeams[i], shuffledTeams[j]] = [shuffledTeams[j], shuffledTeams[i]];
    }

    // 1-to-1 unique mapping: no two teams get the same ZIP!
    const randomized = bulkZipFiles.map((_, i) => (i < shuffledTeams.length ? shuffledTeams[i].teamKey : ''));
    setBulkTeamMappings(randomized);
    setStatusMessage({
      type: 'success',
      text: `Strict 1-to-1 unique distribution applied: All ${Math.min(bulkZipFiles.length, availableTeams.length)} teams assigned a distinct challenge archive!`,
    });
  };

  // Move a ZIP file up or down in the roster
  const handleMoveZip = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= bulkZipFiles.length) return;

    setBulkZipFiles((prev) => {
      const updated = [...prev];
      const temp = updated[index];
      updated[index] = updated[targetIndex];
      updated[targetIndex] = temp;
      return updated;
    });
    setBulkTeamMappings((prev) => {
      const updated = [...prev];
      while (updated.length < bulkZipFiles.length) updated.push('');
      const temp = updated[index];
      updated[index] = updated[targetIndex];
      updated[targetIndex] = temp;
      return updated;
    });
  };

  // Sort ZIP files naturally (A-Z or Z-A)
  const handleSortZips = (direction: 'asc' | 'desc') => {
    setBulkZipFiles((prev) => {
      const indexed = prev.map((file, i) => ({ file, teamKey: bulkTeamMappings[i] || '' }));
      indexed.sort((a, b) =>
        direction === 'asc'
          ? a.file.name.localeCompare(b.file.name, undefined, { numeric: true, sensitivity: 'base' })
          : b.file.name.localeCompare(a.file.name, undefined, { numeric: true, sensitivity: 'base' })
      );
      setBulkTeamMappings(indexed.map((x) => x.teamKey));
      return indexed.map((x) => x.file);
    });
  };

  // Execute bulk upload with strict unique team distribution
  const handleExecuteBulkUpload = async () => {
    if (bulkZipFiles.length === 0) {
      setStatusMessage({ type: 'error', text: 'Please select the ZIP archives to deploy.' });
      return;
    }

    // Identify which teams are mapped to which ZIP archives
    const teamsToDeploy: Array<{
      team: TeamRosterItem;
      file: File;
      index: number;
    }> = [];

    for (let i = 0; i < bulkZipFiles.length; i++) {
      const teamKey = bulkTeamMappings[i];
      if (!teamKey) continue;
      const team = availableTeams.find((t) => t.teamKey === teamKey);
      if (team) {
        teamsToDeploy.push({ team, file: bulkZipFiles[i], index: i });
      }
    }

    if (teamsToDeploy.length === 0) {
      setStatusMessage({ type: 'error', text: 'Please assign at least one team to a challenge archive.' });
      return;
    }

    // STRICT INVARIANT: No two teams can share the same ZIP file, and no team can be assigned multiple ZIP files!
    const assignedKeys = teamsToDeploy.map((item) => item.team.teamKey);
    const uniqueKeys = new Set(assignedKeys);
    if (uniqueKeys.size !== assignedKeys.length) {
      setStatusMessage({
        type: 'error',
        text: 'Duplicate team assignment detected! Each team must receive exactly one unique ZIP archive, and no two teams can share an archive.',
      });
      return;
    }

    setBulkUploading(true);
    setStatusMessage(null);

    try {
      // 1. Request presigned upload targets for each team's unique archive
      setBulkUploadProgress(`Requesting storage endpoints for ${teamsToDeploy.length} unique team archives...`);
      const presignRes = await fetch('/api/admin/stages/bulk-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'presign',
          adminSecret,
          teams: teamsToDeploy.map((item) => ({
            teamKey: item.team.teamKey,
            teamName: item.team.teamName,
            tokens: item.team.tokens,
          })),
        }),
      });

      const presignData = await presignRes.json();
      if (!presignRes.ok || !presignData.uploadTargets) {
        throw new Error(presignData.error || 'Failed to generate signed upload targets');
      }

      const targets = presignData.uploadTargets as Array<{
        teamKey: string;
        storagePath: string;
        token: string;
        uploadUrl?: string;
      }>;
      const targetByTeamKey = new Map(targets.map((t) => [t.teamKey, t]));

      await mapWithConcurrency(teamsToDeploy, UPLOAD_CONCURRENCY, async (item, i) => {
        const { team, file } = item;
        const target = targetByTeamKey.get(team.teamKey);
        if (!target) {
          throw new Error(`Missing upload target for team "${team.teamName}"`);
        }

        setBulkUploadProgress(
          `Uploading archive ${i + 1} of ${teamsToDeploy.length}: ${file.name} for team "${team.teamName}" (${team.memberCount} members)...`
        );
        await uploadZipToStorageTarget(file, target);
      });

      // 3. Commit to database: maps the archive to all member tokens of that team
      setBulkUploadProgress('Registering team archive bindings in database...');
      const commitRes = await fetch('/api/admin/stages/bulk-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'commit',
          adminSecret,
          archives: teamsToDeploy.map((item) => {
            const target = targetByTeamKey.get(item.team.teamKey);
            if (!target) {
              throw new Error(`Missing storage path for team "${item.team.teamName}"`);
            }
            return {
              teamKey: item.team.teamKey,
              teamName: item.team.teamName,
              tokens: item.team.tokens,
              storagePath: target.storagePath,
              stageCount: bulkStageCount,
            };
          }),
        }),
      });

      const commitData = await commitRes.json();
      if (!commitRes.ok || !commitData.success) {
        throw new Error(commitData.error || 'Failed to commit team archives');
      }

      const commitErrors = (commitData.errors || []) as Array<{ target: string; error: string }>;
      if (commitErrors.length > 0) {
        throw new Error(
          commitErrors.map((e) => `${e.target}: ${e.error}`).join('; ') || 'Some team archives failed to commit'
        );
      }

      setStatusMessage({
        type: 'success',
        text: `Successfully deployed ${teamsToDeploy.length} unique challenge archives! Every team has a distinct ZIP, and all team members share their team's unique archive.`,
      });

      setBulkZipFiles([]);
      setBulkTeamMappings([]);
      await fetchCommittedArchives();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Bulk upload failed',
      });
    } finally {
      setBulkUploading(false);
      setBulkUploadProgress(null);
    }
  };

  // Delete an existing token archive
  const handlePurgeAllArchives = async () => {
    if (
      !window.confirm(
        'Remove ALL token archive bindings from the database? This does not delete files in storage, but participants will lose archive assignments until you redeploy a pool.'
      )
    ) {
      return;
    }
    try {
      const res = await fetch('/api/admin/stages/bulk-upload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminSecret, purgeAll: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Purge failed');
      await fetchCommittedArchives();
      setStatusMessage({
        type: 'success',
        text: 'All deployed archive records cleared from the database. You can upload a fresh pool now.',
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Purge failed' });
    }
  };

  const handleDeleteArchive = async (tokenToDelete: string) => {
    if (!window.confirm(`Are you sure you want to delete the stage archive for token "${tokenToDelete}"?`)) return;
    try {
      const res = await fetch('/api/admin/stages/bulk-upload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminSecret, accessToken: tokenToDelete }),
      });
      if (res.ok) {
        await fetchCommittedArchives();
        setStatusMessage({ type: 'success', text: `Deleted token archive for ${tokenToDelete}.` });
      } else {
        const d = await res.json();
        throw new Error(d.error || 'Failed to delete archive');
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Delete archive failed' });
    }
  };

  // Fetch all existing contests

  // Fetch all existing contests
  const fetchContests = async () => {
    try {
      setLoadingContests(true);
      const res = await fetch('/api/admin/contest/manage', {
        headers: { 'x-admin-secret': adminSecret },
      });
      const data = await res.json();
      if (res.ok && data.contests) {
        setContests(data.contests);
      }
    } catch (err) {
      console.error('Failed to fetch contests', err);
    } finally {
      setLoadingContests(false);
    }
  };

  // Fetch configured stages from server
  const fetchStages = async () => {
    try {
      setLoadingStages(true);
      const res = await fetch('/api/admin/stages', {
        headers: { 'x-admin-secret': adminSecret },
      });
      const data = await res.json();
      if (res.ok && data.stages) {
        setStages(data.stages);
        if (data.stages.length > 0) {
          const maxNum = Math.max(...data.stages.map((s: Stage) => s.stage_number));
          setStageNumber(maxNum + 1);
        }
      }
    } catch (err) {
      console.error('Failed to fetch stages', err);
    } finally {
      setLoadingStages(false);
    }
  };

  useEffect(() => {
    if (adminSecret) {
      fetchContests();
      fetchStages();
      fetchCommittedArchives();
      fetchAvailableTokens();
      fetchPoolCatalog();
    }
  }, [adminSecret]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(MANUAL_POOL_OVERRIDE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, string>;
        if (parsed && typeof parsed === 'object') {
          setManualPoolOverrides(parsed);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  const persistManualPoolOverrides = (next: Record<string, string>) => {
    setManualPoolOverrides(next);
    try {
      localStorage.setItem(MANUAL_POOL_OVERRIDE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  // Load existing stage into stage form
  const handleSelectStageToEdit = (stage: Stage) => {
    setStageNumber(stage.stage_number);
    setTitle(stage.title);
    setS3Key(stage.storage_path || stage.s3_key || '');
    setIsPasswordProtected(stage.is_password_protected);
    setZipPassword(stage.zip_password || '');
    setAllowedCopyFilename(stage.allowed_copy_filename);
    setMinExpectedSeconds(stage.min_expected_seconds);
    setPoints(stage.points);
    setStatusMessage(null);
  };

  // Clear stage form for adding a new stage
  const handleNewStage = () => {
    const nextNum = stages.length > 0 ? Math.max(...stages.map((s) => s.stage_number)) + 1 : 1;
    setStageNumber(nextNum);
    setTitle('');
    setS3Key('');
    setIsPasswordProtected(false);
    setZipPassword('');
    setAllowedCopyFilename('ai_prompt.txt');
    setMinExpectedSeconds(60);
    setPoints(100);
    setUploadFile(null);
    setPreflightResult(null);
    setStatusMessage(null);
  };

  // Direct Browser-to-Supabase Storage Upload via Signed Upload URL
  const handleDirectStorageUpload = async () => {
    if (!uploadFile) {
      setStatusMessage({ type: 'error', text: 'Please select a ZIP file to upload.' });
      return;
    }

    setUploading(true);
    setUploadProgress('Requesting Supabase Signed Upload URL...');
    setStatusMessage(null);

    try {
      const presignRes = await fetch('/api/admin/storage-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminSecret,
          stageNumber,
          filename: uploadFile.name,
        }),
      });

      const presignData = await presignRes.json();
      if (!presignRes.ok || !presignData.uploadUrl) {
        throw new Error(presignData.error || 'Failed to generate storage upload URL');
      }

      setUploadProgress('Uploading archive directly to Supabase Storage...');

      let uploadSuccess = false;
      let lastErrMsg = '';

      // 1. Primary: Official Supabase Storage SDK uploadToSignedUrl (handles multipart/form-data & tokens)
      try {
        const targetPath = presignData.storagePath || presignData.s3Key;
        const { error: uploadErr } = await supabase.storage
          .from('stages')
          .uploadToSignedUrl(targetPath, presignData.token, uploadFile);

        if (!uploadErr) {
          uploadSuccess = true;
        } else {
          lastErrMsg = uploadErr.message;
        }
      } catch (sdkErr: any) {
        lastErrMsg = sdkErr.message || 'SDK upload error';
      }

      // 2. Fallback: Raw binary PUT to signed storage URL
      if (!uploadSuccess && presignData.uploadUrl) {
        try {
          const rawUploadRes = await fetch(presignData.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': uploadFile.type || 'application/zip' },
            body: uploadFile,
          });
          if (rawUploadRes.ok) {
            uploadSuccess = true;
          } else {
            lastErrMsg = `Storage upload failed with status ${rawUploadRes.status}`;
          }
        } catch (fetchErr: any) {
          lastErrMsg = fetchErr.message || lastErrMsg;
        }
      }

      if (!uploadSuccess) {
        throw new Error(lastErrMsg || 'Storage upload failed');
      }

      const savedPath = presignData.storagePath || presignData.s3Key;
      setS3Key(savedPath);
      setUploadProgress(null);
      setStatusMessage({
        type: 'success',
        text: `Archive uploaded directly to Supabase Storage: ${savedPath}`,
      });
    } catch (err: any) {
      setUploadProgress(null);
      setStatusMessage({
        type: 'error',
        text: err.message || 'Direct storage upload failed',
      });
    } finally {
      setUploading(false);
    }
  };

  // Save single stage configuration
  const handleSaveStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !s3Key.trim()) {
      setStatusMessage({
        type: 'error',
        text: 'Stage Title and Storage Path (ZIP) are required before saving stage.',
      });
      return;
    }

    setSaving(true);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/admin/stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminSecret,
          stageNumber,
          title: title.trim(),
          storagePath: s3Key,
          s3Key,
          isPasswordProtected,
          zipPassword,
          allowedCopyFilename,
          minExpectedSeconds,
          points,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save stage configuration');
      }

      setStatusMessage({
        type: 'success',
        text: `Stage ${stageNumber} successfully saved to contest manifest!`,
      });
      await fetchStages();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to persist stage configuration',
      });
    } finally {
      setSaving(false);
    }
  };

  // Save and Deploy Contest
  const handleSaveAndDeployContest = async () => {
    if (!contestTitle.trim()) {
      setStatusMessage({ type: 'error', text: 'Please provide a valid Contest Title.' });
      return;
    }
    if (numberOfTeams <= 0) {
      setStatusMessage({ type: 'error', text: 'Number of teams must be at least 1.' });
      return;
    }

    setSaving(true);
    setStatusMessage(null);

    try {
      if (mode === 'create') {
        // Create brand new contest -> generates tokens = numberOfTeams and downloads them
        const res = await fetch('/api/admin/contest/manage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            adminSecret,
            action: 'create',
            title: contestTitle.trim(),
            teamsCount: numberOfTeams,
            stages,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to deploy new contest');
        }

        // AUTOMATICALLY DOWNLOAD TOKENS TEXT FILE AS REQUESTED
        if (data.tokens && Array.isArray(data.tokens) && data.tokens.length > 0) {
          downloadTokensFile(contestTitle.trim(), data.tokens);
        }

        setStatusMessage({
          type: 'success',
          text: `Contest "${contestTitle}" deployed! Generated and downloaded ${data.tokens?.length || numberOfTeams} unique team tokens in AX-DEMO-2026 format.`,
        });

        if (data.contest?.id) {
          setActiveEditingContestId(data.contest.id);
          setMode('edit');
        }

        await fetchContests();
      } else {
        // Edit existing contest -> DOES NOT regenerate tokens, keeps previous tokens
        const res = await fetch('/api/admin/contest/manage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            adminSecret,
            action: 'update',
            contestId: activeEditingContestId,
            title: contestTitle.trim(),
            stages,
            teamsCount: numberOfTeams,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to update contest');
        }

        setStatusMessage({
          type: 'success',
          text: `Contest "${contestTitle}" updated successfully! Existing team tokens preserved.`,
        });

        await fetchContests();
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Contest operation failed',
      });
    } finally {
      setSaving(false);
    }
  };

  // Switch to editing an existing contest
  const handleStartEditingContest = (contest: Contest) => {
    setActiveEditingContestId(contest.id);
    setContestTitle(contest.title);
    setNumberOfTeams(contest.teams_count || contest.tokens?.length || 50);
    if (contest.stages && contest.stages.length > 0) {
      setStages(contest.stages);
    }
    setMode('edit');
    setStatusMessage(null);
  };

  // Delete a contest
  const handleDeleteContest = async (contest: Contest) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete contest "${contest.title}"? This cannot be undone.`
    );
    if (!confirmDelete) return;

    try {
      const res = await fetch('/api/admin/contest/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminSecret,
          action: 'delete',
          contestId: contest.id,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete contest');
      }

      await fetchContests();
      setStatusMessage({
        type: 'success',
        text: `Contest "${contest.title}" has been deleted.`,
      });
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to delete contest',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Navigation & Contest Mode Switcher */}
      <div className="p-4 sm:p-5 rounded-2xl bg-app-surface border border-app-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            Contest & Stage Rule Manager
          </h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Configure tournament stages, cryptographic zip archives, and automated team access token generation.
          </p>
        </div>

        {/* Mode Switcher Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setMode('bulk');
              setStatusMessage(null);
              fetchCommittedArchives();
              fetchAvailableTokens();
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer min-h-[36px] ${
              mode === 'bulk'
                ? 'bg-app-text text-app-bg'
                : 'bg-app-surface text-app-subtext hover:text-app-text border border-app-border'
            }`}
          >
            <FileArchive className="w-3.5 h-3.5" />
            <span>Bulk Challenge Archives (Pure ZIPs)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('create');
              setActiveEditingContestId(null);
              setContestTitle('Pixel and Anomaly CTF 2026');
              setNumberOfTeams(50);
              setStatusMessage(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer min-h-[36px] ${
              mode === 'create'
                ? 'bg-app-text text-app-bg'
                : 'bg-app-surface text-app-subtext hover:text-app-text border border-app-border'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Single Stages & Contest</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('list');
              setStatusMessage(null);
              fetchContests();
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer min-h-[36px] ${
              mode === 'list'
                ? 'bg-app-text text-app-bg'
                : 'bg-app-surface text-app-subtext hover:text-app-text border border-app-border'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Contests ({contests.length})</span>
          </button>
        </div>
      </div>

      {/* Status Feedback Banner */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-2xl border text-xs flex items-center gap-2 animate-in fade-in duration-200 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
              : 'bg-rose-950/60 border-rose-500/50 text-rose-300'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* =========================================================================
          VIEW 0: BULK TOKEN ARCHIVES (Pure ZIP Architecture — Zero CSV)
         ========================================================================= */}
      {mode === 'bulk' && (
        <div className="space-y-6">
          {/* Header Description Banner */}
          <div className="p-5 rounded-2xl bg-app-surface border border-app-border">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <FileArchive className="w-4 h-4 text-emerald-400" />
                  Native Challenge Stage Deployment — Pure ZIPs (No CSV Required)
                </h3>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  Each ZIP is fully self-contained: <span className="text-emerald-400 font-bold">Stage 1 is unlocked</span> by default, and <span className="text-app-text font-bold">Stages 2..Y are pre-encrypted</span> inside. Decryption is performed natively in the contestant's browser RAM upon entering the correct password (just like Windows File Explorer). <span className="text-slate-400 italic">No passwords or CSV comparison files are ever needed.</span>
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    fetchCommittedArchives();
                    fetchAvailableTokens();
                    fetchPoolCatalog();
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-slate-800 hover:bg-slate-700 border border-app-border text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh Roster</span>
                </button>
              </div>
            </div>

            {/* Architecture Highlights */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-app-surface-raised border border-app-border space-y-1">
                <div className="font-bold text-slate-200 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[11px] font-mono">1</span>
                  Drag & Drop X Archives
                </div>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Upload all X multi-stage challenge ZIPs at once. Each ZIP is delivered uniquely to one contestant/team token.
                </p>
              </div>
              <div className="p-3 rounded-xl bg-app-surface-raised border border-app-border space-y-1">
                <div className="font-bold text-slate-200 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-lg bg-app-surface-raised text-app-text flex items-center justify-center text-[11px] font-mono">2</span>
                  Native RAM Decryption
                </div>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Like Windows or WinRAR, the browser decrypts the nested ZIP using the ZIP's internal CRC/HMAC headers directly in client RAM.
                </p>
              </div>
              <div className="p-3 rounded-xl bg-app-surface-raised border border-app-border space-y-1">
                <div className="font-bold text-slate-200 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center text-[11px] font-mono">3</span>
                  Zero Password Clashing
                </div>
                <p className="text-[11px] text-slate-400 leading-normal">
                  No CSV means zero ordering mismatch risk. Whatever password was used to encrypt the ZIP unlocks it instantly.
                </p>
              </div>
            </div>
          </div>

          {/* Upload & Stage Configuration Card */}
          <div className="p-5 rounded-2xl bg-app-surface border border-app-border space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-app-border">
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Upload className="w-4 h-4 text-emerald-400" />
                  Select Challenge ZIP Archives
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Upload multiple case-study ZIPs into a pool, then randomly distribute to every registered team.
                </p>
              </div>

              <div className="flex items-center gap-2 bg-slate-900 border border-app-border px-2 py-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setDistributionMode('pool')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                    distributionMode === 'pool'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Pool (recommended)
                </button>
                <button
                  type="button"
                  onClick={() => setDistributionMode('unique')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                    distributionMode === 'unique'
                      ? 'bg-app-accent text-app-bg'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  1:1 unique ZIP
                </button>
              </div>

              {/* Stage Count Configuration */}
              <div className="flex items-center gap-2.5 bg-slate-900 border border-app-border px-3 py-1.5 rounded-xl">
                <span className="text-[11px] text-slate-400 font-medium" title="Nested archives automatically discover each stage dynamically from decrypted inner ZIPs">Nested Stages Architecture:</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={bulkStageCount}
                  onChange={(e) => setBulkStageCount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-12 px-2 py-0.5 bg-app-bg border border-app-border text-app-text rounded text-center text-xs font-bold text-emerald-400 font-mono"
                />
                {detectingStages && (
                  <span className="text-[10px] text-app-text flex items-center gap-1 font-mono">
                    <Loader2 className="w-3 h-3 animate-spin" /> Auto-detecting...
                  </span>
                )}
              </div>
            </div>

            {/* Drop Zone */}
            <label className="block border-2 border-dashed border-app-border hover:border-emerald-500/60 rounded-2xl p-6 text-center cursor-pointer transition-colors bg-slate-900/40 hover:bg-slate-900/70">
              <Upload className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
              <span className="text-xs font-bold text-slate-200 block">
                {distributionMode === 'pool'
                  ? queuedPoolFiles.length === 0
                    ? 'Add case-study ZIPs to the pool (stored in Supabase until you Assign)'
                    : `${queuedPoolFiles.length} queued (${(queuedPoolFiles.reduce((a, f) => a + f.size, 0) / 1024 / 1024).toFixed(1)} MB) · ${poolCatalog.length} already in pool`
                  : bulkZipFiles.length === 0
                    ? 'Click or drag & drop all X multi-stage ZIP archives here'
                    : `${bulkZipFiles.length} ZIP archive(s) selected (${(bulkZipFiles.reduce((acc, f) => acc + f.size, 0) / 1024 / 1024).toFixed(1)} MB total)`}
              </span>
              <span className="text-[11px] text-slate-400 block mt-1">
                {distributionMode === 'pool'
                  ? 'Step 1: Upload to pool · Step 2: Assign teams (random or manual)'
                  : 'Select all participant archives simultaneously • *.zip only'}
              </span>
              <input
                type="file"
                multiple
                accept=".zip,application/zip"
                onChange={handleZipFilesChange}
                className="hidden"
              />
            </label>
          </div>

          {/* Token Assignment & Archive Preview Table */}
          {distributionMode === 'pool' && (
            <div className="p-5 rounded-2xl bg-app-surface border border-emerald-500/30 space-y-4 animate-in fade-in duration-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-400" />
                  Stored pool ({poolCatalog.length} ZIPs)
                  {loadingPoolCatalog && <Loader2 className="w-3.5 h-3.5 animate-spin text-app-subtext" />}
                </h4>
                <button
                  type="button"
                  onClick={fetchPoolCatalog}
                  className="text-[11px] text-app-text hover:underline flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Refresh pool
                </button>
              </div>

              {queuedPoolFiles.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-slate-900/50 border border-app-border">
                  <span className="text-[11px] text-slate-400">{queuedPoolFiles.length} file(s) ready to store:</span>
                  <button
                    type="button"
                    disabled={bulkUploading}
                    onClick={handleUploadQueuedToPool}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white disabled:opacity-50"
                  >
                    Upload to pool
                  </button>
                  <button
                    type="button"
                    onClick={() => setQueuedPoolFiles([])}
                    className="text-xs text-rose-400 px-2"
                  >
                    Clear queue
                  </button>
                </div>
              )}

              <ul className="text-[11px] text-slate-300 space-y-1 font-mono max-h-36 overflow-y-auto border border-app-border rounded-xl p-3 bg-slate-900/40">
                {poolCatalog.length === 0 ? (
                  <li className="text-slate-500 text-center py-2">No ZIPs in pool yet — select files above, then Upload to pool.</li>
                ) : (
                  poolCatalog.map((item) => {
                    const teamCount = availableTeams.filter((t) => teamPoolByKey[t.teamKey] === item.poolKey).length;
                    return (
                      <li key={item.poolKey} className="flex justify-between gap-2">
                        <span className="truncate" title={item.storagePath}>
                          {item.displayName}
                        </span>
                        <span className="text-emerald-400 shrink-0">{teamCount} team(s)</span>
                      </li>
                    );
                  })
                )}
              </ul>

              {poolCatalog.length > 0 && availableTeams.length > 0 && (
                <>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Every team gets a random pool ZIP. Manual picks below override random and persist in this browser until
                    you clear them.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-app-border">
                    <button
                      type="button"
                      onClick={handleAssignAllTeamsOneClick}
                      disabled={bulkUploading}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
                    >
                      <Shuffle className="w-4 h-4" />
                      Assign all teams (random + save)
                    </button>
                    <button
                      type="button"
                      onClick={handleRandomizePoolToAllTeams}
                      className="px-3 py-2 rounded-xl text-xs border border-app-border hover:bg-app-hover"
                    >
                      Random map only
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeployPoolAssignments()}
                      disabled={bulkUploading}
                      className="px-3 py-2 rounded-xl text-xs border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50"
                    >
                      Save manual mapping
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowManualPoolAssign((v) => !v)}
                      className="px-3 py-2 rounded-xl text-xs border border-app-border hover:bg-app-hover"
                    >
                      {showManualPoolAssign ? 'Hide manual assign' : 'Manual assign per team'}
                    </button>
                  </div>

                  {showManualPoolAssign && (
                    <div className="max-h-64 overflow-y-auto border border-app-border rounded-xl divide-y divide-app-border/60">
                      {availableTeams.map((team) => (
                        <div
                          key={team.teamKey}
                          className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2 text-xs bg-app-bg/30"
                        >
                          <span className="font-semibold text-app-text min-w-[140px] truncate">
                            {team.teamName}
                            {manualPoolOverrides[team.teamKey] && poolKeyIsValid(manualPoolOverrides[team.teamKey]) ? (
                              <span className="ml-1 text-[10px] text-amber-400 font-normal">(manual)</span>
                            ) : null}
                          </span>
                          <select
                            value={
                              manualPoolOverrides[team.teamKey] && poolKeyIsValid(manualPoolOverrides[team.teamKey])
                                ? manualPoolOverrides[team.teamKey]
                                : teamPoolByKey[team.teamKey] || ''
                            }
                            onChange={(e) => {
                              const pk = e.target.value;
                              setTeamPoolByKey((prev) => {
                                const next = { ...prev };
                                if (pk) next[team.teamKey] = pk;
                                else delete next[team.teamKey];
                                return next;
                              });
                              const nextManual = { ...manualPoolOverrides };
                              if (pk) nextManual[team.teamKey] = pk;
                              else delete nextManual[team.teamKey];
                              persistManualPoolOverrides(nextManual);
                            }}
                            className="flex-1 px-2 py-1.5 rounded-lg border border-app-border bg-slate-900 text-xs"
                          >
                            <option value="">— pick case study ZIP —</option>
                            {poolCatalog.map((p) => (
                              <option key={p.poolKey} value={p.poolKey}>
                                {p.displayName}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  )}

                  {bulkUploadProgress && (
                    <div className="flex items-center gap-2 text-[11px] text-app-text font-mono">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{bulkUploadProgress}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {bulkZipFiles.length > 0 && distributionMode === 'unique' && (
            <div className="p-5 rounded-2xl bg-app-surface border border-app-border space-y-4 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-app-border">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-amber-400" />
                      Unique Team Challenge Archive Binding ({bulkZipFiles.length} Archives)
                    </h4>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold">
                      Strict 1:1 Unique Distribution
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-2xl leading-relaxed">
                    <strong>Rule:</strong> No two different teams can receive the same ZIP archive. All members belonging to the same team will download and verify against their team's exact assigned archive.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleRandomizeAssignments}
                    disabled={availableTeams.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-app-surface hover:bg-app-hover border border-app-border text-app-text transition-colors cursor-pointer disabled:opacity-50 font-medium min-h-[34px]"
                    title="Randomly distribute unique challenge archives across all registered teams (1-to-1 bijection)"
                  >
                    <Shuffle className="w-3.5 h-3.5 text-emerald-400" />
                    <span>🎲 Randomize Unique Distribution ({availableTeams.length} Teams)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setBulkZipFiles([]);
                      setBulkTeamMappings([]);
                    }}
                    className="px-2.5 py-1.5 rounded-xl text-xs text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 transition-colors cursor-pointer"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {/* Validation & Team Shortage Banner */}
              {availableTeams.length > 0 && bulkZipFiles.length < availableTeams.length && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <span className="font-bold">Team Shortage Warning:</span> You have{' '}
                    <strong>{availableTeams.length} registered teams</strong>, but selected only{' '}
                    <strong>{bulkZipFiles.length} ZIP archives</strong>. Because no two teams can share an archive, you must provide at least{' '}
                    <strong>{availableTeams.length} unique ZIP files</strong> so every team receives a distinct challenge.
                  </div>
                </div>
              )}

              {/* Duplicate Team Conflict Banner */}
              {(() => {
                const assigned = bulkTeamMappings.slice(0, bulkZipFiles.length).filter(Boolean);
                const dupes = assigned.filter((item, index) => assigned.indexOf(item) !== index);
                if (dupes.length > 0) {
                  const dupeTeamNames = Array.from(new Set(dupes))
                    .map((k) => availableTeams.find((t) => t.teamKey === k)?.teamName || k)
                    .join(', ');
                  return (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div className="leading-relaxed">
                        <span className="font-bold">Duplicate Team Conflict:</span> Team(s) <strong>{dupeTeamNames}</strong> are assigned to multiple archives. No two ZIP archives can be given to the same team. Please make each assignment unique.
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Roster Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-app-border text-[11px] font-mono text-slate-400">
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Challenge Archive</th>
                      <th className="py-2.5 px-3">Stages</th>
                      <th className="py-2.5 px-3 min-w-[220px]">Assigned Team (1:1 Unique)</th>
                      <th className="py-2.5 px-3">Team Members & Access Tokens</th>
                      <th className="py-2.5 px-3 text-right">Distribution Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {bulkZipFiles.map((zipFile, idx) => {
                      const currentTeamKey = bulkTeamMappings[idx] || '';
                      const matchedTeam = availableTeams.find((t) => t.teamKey === currentTeamKey);

                      // Check if this team is duplicated on any other row
                      const isDuplicate =
                        Boolean(currentTeamKey) &&
                        bulkTeamMappings.filter((k, kIdx) => kIdx < bulkZipFiles.length && k === currentTeamKey).length > 1;

                      return (
                        <tr key={idx} className="hover:bg-slate-900/50 transition-colors">
                          <td className="py-2.5 px-3 text-slate-400 font-bold whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className="w-5 text-right font-mono">{idx + 1}</span>
                              <div className="flex flex-col gap-0.5">
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={() => handleMoveZip(idx, 'up')}
                                  className="text-[9px] text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer p-0.5 leading-none rounded hover:bg-slate-800"
                                  title="Move ZIP Up"
                                >
                                  ▲
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === bulkZipFiles.length - 1}
                                  onClick={() => handleMoveZip(idx, 'down')}
                                  className="text-[9px] text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer p-0.5 leading-none rounded hover:bg-slate-800"
                                  title="Move ZIP Down"
                                >
                                  ▼
                                </button>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-200">
                            <div className="flex items-center gap-2">
                              <FileArchive className="w-4 h-4 text-emerald-400 shrink-0" />
                              <span className="truncate max-w-[180px] font-semibold">{zipFile.name}</span>
                              <span className="text-[10px] text-slate-500">({(zipFile.size / 1024 / 1024).toFixed(1)} MB)</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold">
                              {bulkStageCount} Stages
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <select
                              value={currentTeamKey}
                              onChange={(e) => {
                                const newKey = e.target.value;
                                setBulkTeamMappings((prev) => {
                                  const updated = [...prev];
                                  updated[idx] = newKey;
                                  return updated;
                                });
                              }}
                              className={`w-full px-2.5 py-1.5 rounded-xl border text-xs font-sans transition-colors cursor-pointer bg-slate-900 ${
                                isDuplicate
                                  ? 'border-rose-500 text-rose-400'
                                  : currentTeamKey
                                  ? 'border-emerald-500/40 text-slate-100 font-semibold'
                                  : 'border-app-border text-slate-400'
                              }`}
                            >
                              <option value="">-- Choose Unique Team --</option>
                              {availableTeams.map((team) => (
                                <option key={team.teamKey} value={team.teamKey}>
                                  {team.teamName} ({team.memberCount} {team.memberCount === 1 ? 'member' : 'members'})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2.5 px-3 text-slate-300">
                            {matchedTeam ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <Users className="w-3.5 h-3.5 text-app-text shrink-0" />
                                  <span className="font-bold text-white text-xs">{matchedTeam.teamName}</span>
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    ({matchedTeam.memberCount} {matchedTeam.memberCount === 1 ? 'member' : 'members'})
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-400 flex flex-wrap gap-1 font-sans">
                                  {matchedTeam.members.map((m, mIdx) => (
                                    <span key={m.email || mIdx} className="bg-slate-800/80 px-1.5 py-0.2 rounded text-[10px] border border-app-border">
                                      {m.name} <code className="text-emerald-400 font-mono">[{m.token}]</code>
                                    </span>
                                  ))}
                                </div>
                                <div className="text-[9px] text-emerald-400/80 font-mono">
                                  All {matchedTeam.memberCount} member(s) will access this exact archive.
                                </div>
                              </div>
                            ) : (
                              <span className="text-[11px] text-amber-400 italic">No team assigned</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {isDuplicate ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-rose-500/10 border border-rose-500/30 text-rose-400 font-bold">
                                ⚠ Duplicate Team
                              </span>
                            ) : currentTeamKey ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold">
                                ✓ Unique Team (1:1)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold">
                                Pending Selection
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Deploy Action Bar */}
              <div className="pt-3 border-t border-app-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-[11px] text-slate-400">
                  {bulkUploadProgress ? (
                    <div className="flex items-center gap-2 text-app-text font-mono">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{bulkUploadProgress}</span>
                    </div>
                  ) : (
                    <span>
                      {bulkTeamMappings.filter(Boolean).length} of {bulkZipFiles.length} archives assigned to unique teams.
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleExecuteBulkUpload}
                  disabled={
                    bulkUploading ||
                    bulkZipFiles.length === 0 ||
                    bulkTeamMappings.slice(0, bulkZipFiles.length).some((k) => !k) ||
                    (() => {
                      const assigned = bulkTeamMappings.slice(0, bulkZipFiles.length).filter(Boolean);
                      return new Set(assigned).size !== assigned.length;
                    })()
                  }
                  className="flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors disabled:opacity-50 cursor-pointer min-h-[40px]"
                >
                  {bulkUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Deploying Unique Team Archives...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Deploy All {bulkZipFiles.length} Unique Team Archives</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Active Deployed Token Archives Table */}
          <div className="p-5 rounded-2xl bg-app-surface border border-app-border space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Database className="w-4 h-4 text-app-text" />
                Active Deployed Token Archives in Database ({bulkCommittedArchives.length})
              </h4>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fetchCommittedArchives}
                  className="text-xs text-app-text hover:underline cursor-pointer flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Refresh</span>
                </button>
                {bulkCommittedArchives.length > 0 && (
                  <button
                    type="button"
                    onClick={handlePurgeAllArchives}
                    className="text-xs text-rose-400 hover:text-rose-300 font-semibold px-2 py-1 rounded-lg border border-rose-500/30 hover:bg-rose-500/10"
                  >
                    Clear all from DB
                  </button>
                )}
              </div>
            </div>

            {loadingCommittedArchives ? (
              <div className="p-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-app-text" />
                <span>Loading committed archives...</span>
              </div>
            ) : bulkCommittedArchives.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 bg-slate-950/40 rounded-xl border border-app-border">
                No token archives deployed yet. Upload your multi-stage ZIP archives above to deploy.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-app-border text-[11px] font-mono text-slate-400">
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Access Token</th>
                      <th className="py-2.5 px-3">Storage Path</th>
                      <th className="py-2.5 px-3">Stages</th>
                      <th className="py-2.5 px-3">Deployed At</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {bulkCommittedArchives.map((arch, idx) => (
                      <tr key={arch.id} className="hover:bg-slate-900/50 transition-colors">
                        <td className="py-2.5 px-3 text-slate-400 font-bold">{idx + 1}</td>
                        <td className="py-2.5 px-3">
                          <div className="space-y-0.5">
                            <span className="font-bold text-white text-xs block">
                              {arch.team_name || 'Individual Participant'}
                            </span>
                            <span className="font-mono text-emerald-400 text-[11px] block">
                              Token: {arch.access_token}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-300 text-[11px] font-mono truncate max-w-[200px]" title={arch.storage_path}>
                          {arch.storage_path}
                        </td>
                        <td className="py-2.5 px-3 text-app-text font-bold">
                          {arch.stage_count} Stages
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                          {new Date(arch.uploaded_at).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteArchive(arch.access_token)}
                            className="px-2 py-1 rounded-lg text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 text-[11px] transition-colors cursor-pointer"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          VIEW 1: LIST OF EXISTING CONTESTS (Edit or Delete)
         ========================================================================= */}
      {mode === 'list' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-app-text" />
              Available Contests in Database ({contests.length})
            </h3>
            <button
              onClick={fetchContests}
              className="text-xs text-app-text hover:underline cursor-pointer"
            >
              Refresh Contests
            </button>
          </div>

          {loadingContests ? (
            <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2 text-xs">
              <Loader2 className="w-4 h-4 animate-spin text-app-text" />
              <span>Loading contests directory...</span>
            </div>
          ) : contests.length === 0 ? (
            <div className="p-8 text-center text-slate-400 bg-app-surface border border-app-border rounded-2xl text-xs space-y-2">
              <p>No contests found in database.</p>
              <button
                onClick={() => setMode('create')}
                className="px-4 py-2 rounded-xl bg-app-text text-app-bg font-semibold text-xs cursor-pointer inline-flex items-center gap-1.5 hover:opacity-90 transition-opacity"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Your First Contest</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {contests.map((c) => (
                <div
                  key={c.id}
                  className="p-4 sm:p-5 rounded-2xl bg-app-surface border border-app-border space-y-3 relative hover:border-app-border transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-sm text-white">{c.title}</h4>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {c.id}</p>
                    </div>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${
                        c.status === 'LIVE'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : c.status === 'FROZEN'
                          ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono text-slate-300">
                    <div className="p-2 rounded-xl bg-app-surface-raised border border-app-border flex items-center gap-2">
                      <Users className="w-3.5 h-3.5 text-app-text" />
                      <span>{c.teams_count || c.tokens?.length || 0} Teams</span>
                    </div>
                    <div className="p-2 rounded-xl bg-app-surface-raised border border-app-border flex items-center gap-2">
                      <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                      <span>{c.tokens?.length || 0} Tokens</span>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex items-center justify-between pt-2 border-t border-app-border text-xs">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleStartEditingContest(c)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-app-surface hover:bg-app-hover border border-app-border text-app-text font-medium transition-colors cursor-pointer"
                        title="Edit stages and rules without regenerating tokens"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit Contest</span>
                      </button>

                      {c.tokens && c.tokens.length > 0 && (
                        <button
                          onClick={() => downloadTokensFile(c.title, c.tokens)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                          title="Download all tokens as a formatted text file"
                        >
                          <Download className="w-3 h-3 text-emerald-400" />
                          <span>Tokens (.txt)</span>
                        </button>
                      )}
                    </div>

                    <button
                      onClick={() => handleDeleteContest(c)}
                      className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors cursor-pointer"
                      title="Delete Contest"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          VIEW 2 & 3: CREATE NEW CONTEST / EDIT CONTEST FORM
         ========================================================================= */}
      {(mode === 'create' || mode === 'edit') && (
        <div className="space-y-6">
          {/* Contest Global Parameters Section */}
          <div className="p-4 sm:p-5 rounded-2xl bg-app-surface border border-app-border space-y-4">
            <div className="flex items-center justify-between border-b border-app-border pb-2">
              <div className="flex items-center gap-2">
                {mode === 'edit' && (
                  <button
                    onClick={() => setMode('list')}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors mr-1 cursor-pointer"
                    title="Back to Contests List"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                )}
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-app-text" />
                  {mode === 'create' ? 'Step 1: Setup New Contest Parameters' : `Editing Contest: ${contestTitle}`}
                </h3>
              </div>
              <span className="text-[11px] font-mono text-app-text">
                {mode === 'create' ? 'New Deployment' : 'Preserving Tokens Mode'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Contest Name / Event Title *
                </label>
                <input
                  type="text"
                  value={contestTitle}
                  onChange={(e) => setContestTitle(e.target.value)}
                  placeholder="e.g. Pixel and Anomaly CTF 2026"
                  className="w-full px-3 py-2 text-xs text-app-text bg-app-bg border border-app-border rounded-xl focus:outline-none focus:border-zinc-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Number of Teams / Tokens *
                </label>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={numberOfTeams}
                  onChange={(e) => setNumberOfTeams(Math.max(1, parseInt(e.target.value) || 1))}
                  disabled={mode === 'edit'}
                  className="w-full px-3 py-2 text-xs font-mono text-app-text bg-app-bg border border-app-border rounded-xl focus:outline-none focus:border-zinc-400 disabled:opacity-50"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  {mode === 'create'
                    ? 'Generates N unique tokens on deploy'
                    : 'Tokens locked (edit mode preserves tokens)'}
                </span>
              </div>
            </div>

            {/* Instruction Callout */}
            <div className="p-3 rounded-xl bg-app-surface-raised border border-app-border text-xs text-slate-300 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Tokens format: <code className="text-app-text font-bold font-mono">AX-DEMO-2026</code> (2 letters, 4 letters, 4 digits). One token is valid for one ID only.
                </span>
              </div>
              <button
                type="button"
                onClick={handleSaveAndDeployContest}
                disabled={saving || !contestTitle.trim()}
                className="px-4 py-2 text-xs font-semibold text-app-bg bg-app-text hover:opacity-90 rounded-xl transition-opacity disabled:opacity-50 cursor-pointer shrink-0 flex items-center gap-1.5 min-h-[38px]"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deploying...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Save & Deploy Contest</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Main Stage Builder Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Configured Stages in Contest */}
            <div className="lg:col-span-1 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-app-border">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-app-text" />
                  Stages Manifest ({stages.length})
                </h3>
                <button
                  onClick={handleNewStage}
                  className="flex items-center gap-1 text-xs text-app-text hover:text-app-text transition-colors font-semibold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Stage</span>
                </button>
              </div>

              {loadingStages ? (
                <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2 text-xs">
                  <Loader2 className="w-4 h-4 animate-spin text-app-text" />
                  <span>Loading stages...</span>
                </div>
              ) : stages.length === 0 ? (
                <div className="p-6 text-center text-slate-400 bg-app-surface border border-app-border rounded-2xl text-xs space-y-2">
                  <p>No stages configured yet.</p>
                  <p className="text-[11px] text-slate-400">Use the form to configure Stage 1 with problem files.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {stages.map((stage) => {
                    const isSelected = stage.stage_number === stageNumber;
                    return (
                      <div
                        key={stage.stage_number}
                        onClick={() => handleSelectStageToEdit(stage)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-app-surface-raised border-app-text text-app-text'
                            : 'bg-app-surface border-app-border text-app-subtext hover:text-app-text hover:bg-app-hover'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-app-text">
                              STAGE {stage.stage_number}
                            </span>
                            {stage.is_password_protected && (
                              <span title="Password Protected">
                                <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-semibold truncate mt-0.5">{stage.title}</div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">
                            {stage.storage_path || stage.s3_key}
                          </div>
                        </div>
                        <span className="text-xs font-mono font-bold text-emerald-400 shrink-0 ml-2">
                          +{stage.points} PTS
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Column: Stage Configuration Form (WITHOUT quiz questions) */}
            <div className="lg:col-span-2">
              <form onSubmit={handleSaveStage} className="space-y-5">
                {/* Section 1: General Stage Metadata */}
                <div className="p-4 sm:p-5 rounded-2xl bg-app-surface border border-app-border space-y-4">
                  <div className="flex items-center justify-between border-b border-app-border pb-2">
                    <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-app-text" />
                      Stage {stageNumber} Parameters
                    </h3>
                    <span className="text-[10px] text-app-text font-mono">Archive & Rules</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Stage Number *
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={stageNumber}
                        onChange={(e) => setStageNumber(parseInt(e.target.value) || 1)}
                        className="w-full px-3 py-2 text-xs font-mono text-app-text bg-app-bg border border-app-border rounded-xl focus:outline-none focus:border-zinc-400"
                        required
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Stage Title *
                      </label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g. Neural Anomaly Extraction & Data Decryption"
                        className="w-full px-3 py-2 text-xs text-app-text bg-app-bg border border-app-border rounded-xl focus:outline-none focus:border-zinc-400"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Points Awarded *
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="10"
                        value={points}
                        onChange={(e) => setPoints(parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 text-xs font-mono text-app-text bg-app-bg border border-app-border rounded-xl focus:outline-none focus:border-zinc-400"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Min Expected (Secs)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={minExpectedSeconds}
                        onChange={(e) => setMinExpectedSeconds(parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 text-xs font-mono text-app-text bg-app-bg border border-app-border rounded-xl focus:outline-none focus:border-zinc-400"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Allowed Copy File
                      </label>
                      <input
                        type="text"
                        value={allowedCopyFilename}
                        onChange={(e) => setAllowedCopyFilename(e.target.value)}
                        placeholder="ai_prompt.txt"
                        className="w-full px-3 py-2 text-xs font-mono text-app-text bg-app-bg border border-app-border rounded-xl focus:outline-none focus:border-zinc-400"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 2: ZIP Archive & Encryption Settings */}
                <div className="p-4 sm:p-5 rounded-2xl bg-app-surface border border-app-border space-y-4">
                  <div className="flex items-center justify-between border-b border-app-border pb-2">
                    <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                      <FileArchive className="w-4 h-4 text-app-text" />
                      Stage ZIP Archive & Storage
                    </h3>
                    <span className="text-[10px] text-slate-400 font-mono">In-Memory Preflight Verified</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2 pt-2">
                      <input
                        type="checkbox"
                        id="isPasswordProtected"
                        checked={isPasswordProtected}
                        onChange={(e) => setIsPasswordProtected(e.target.checked)}
                        className="w-4 h-4 rounded text-cyan-500 focus:ring-cyan-400 bg-slate-900 border-app-border cursor-pointer"
                      />
                      <label
                        htmlFor="isPasswordProtected"
                        className="text-xs font-semibold text-slate-200 cursor-pointer"
                      >
                        Requires Decryption Password
                      </label>
                    </div>

                    {isPasswordProtected && (
                      <div>
                        <label className="block text-xs font-semibold text-amber-300 mb-1 flex items-center gap-1">
                          <KeyRound className="w-3.5 h-3.5" />
                          Archive Password *
                        </label>
                        <input
                          type="text"
                          value={zipPassword}
                          onChange={(e) => setZipPassword(e.target.value)}
                          placeholder="e.g. quantum-anomaly-2026"
                          className="w-full px-3 py-2 text-xs font-mono text-amber-200 bg-slate-900 border border-amber-500/50 rounded-xl focus:border-amber-400"
                        />
                      </div>
                    )}
                  </div>

                  {/* ZIP Archive Upload & Preflight Checks */}
                  <div className="space-y-3">
                    <label className="block text-xs font-semibold text-slate-300">
                      Problem ZIP Archive Upload *
                    </label>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <input
                        type="file"
                        accept=".zip"
                        onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                        className="flex-1 text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-slate-800 file:text-app-text hover:file:bg-slate-700 cursor-pointer bg-slate-900 rounded-xl border border-app-border p-1"
                      />

                      <button
                        type="button"
                        onClick={handleDirectStorageUpload}
                        disabled={
                          !uploadFile ||
                          uploading ||
                          validatingArchive ||
                          (preflightResult !== null && !preflightResult.valid)
                        }
                        className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-app-bg bg-app-text hover:opacity-90 rounded-xl transition-opacity disabled:opacity-50 cursor-pointer shrink-0 min-h-[38px]"
                      >
                        {uploading ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Uploading...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-3.5 h-3.5" />
                            <span>Upload to Storage</span>
                          </>
                        )}
                      </button>
                    </div>

                    {uploadProgress && (
                      <p className="text-[11px] text-app-text font-mono">{uploadProgress}</p>
                    )}

                    {/* Preflight Validation Status Display */}
                    {validatingArchive && (
                      <div className="p-3 rounded-xl bg-slate-900 border border-app-border flex items-center gap-2 text-xs text-slate-300 font-mono">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-app-text" />
                        <span>Running in-memory decryption pre-flight check...</span>
                      </div>
                    )}

                    {preflightResult && !validatingArchive && (
                      <div
                        className={`p-3 rounded-xl border text-xs space-y-1 ${
                          preflightResult.valid
                            ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-300'
                            : 'bg-rose-950/50 border-rose-500/50 text-rose-300'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-bold">
                          {preflightResult.valid ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              <span>Archive Pre-Flight Validated</span>
                            </>
                          ) : (
                            <>
                              <AlertCircle className="w-4 h-4 text-rose-400" />
                              <span>Archive Pre-Flight Failed</span>
                            </>
                          )}
                        </div>
                        <p className="text-[11px] font-mono leading-relaxed">{preflightResult.message}</p>
                        {preflightResult.valid && preflightResult.filenames.length > 0 && (
                          <p className="text-[10px] text-emerald-400/80 font-mono">
                            Contains {preflightResult.fileCount} file(s): {preflightResult.filenames.slice(0, 4).join(', ')}
                            {preflightResult.filenames.length > 4 ? ` (+${preflightResult.filenames.length - 4} more)` : ''}
                          </p>
                        )}
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Storage Path (Supabase Storage Key)
                      </label>
                      <input
                        type="text"
                        value={s3Key}
                        onChange={(e) => setS3Key(e.target.value)}
                        placeholder="e.g. stage-1/1729000000-dataset.zip"
                        className="w-full px-3 py-2 text-xs font-mono text-slate-300 bg-app-bg border border-app-border rounded-xl focus:outline-none focus:border-zinc-400"
                      />
                    </div>
                  </div>
                </div>

                {/* Submit / Action Buttons */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={handleNewStage}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    Reset Form
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={
                        saving ||
                        validatingArchive ||
                        (uploadFile !== null && preflightResult !== null && !preflightResult.valid)
                      }
                      className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-app-border rounded-xl transition-all cursor-pointer"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving Stage...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-3.5 h-3.5" />
                          <span>Save Stage {stageNumber}</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveAndDeployContest}
                      disabled={saving || !contestTitle.trim()}
                      className="flex items-center gap-2 px-6 py-2.5 text-xs font-semibold text-app-bg bg-app-text hover:opacity-90 rounded-xl transition-opacity disabled:opacity-50 cursor-pointer min-h-[40px]"
                    >
                      <Trophy className="w-3.5 h-3.5" />
                      <span>{mode === 'create' ? 'Save & Deploy Contest' : 'Update Contest'}</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
