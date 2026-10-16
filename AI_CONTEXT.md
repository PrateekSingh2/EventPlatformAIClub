# AI Agents & Engineering Context Guide

## 1. Mission & Prime Directives
This repository implements a **Serverless Anti-Cheat Contest & Stage-Locked Archive Sandbox Platform** engineered to support **150–200 concurrent hackathon participants** with **zero server compute bottlenecks**.

When modifying, extending, or maintaining this codebase, every AI Agent and engineer must adhere to the following principles:

---

## 2. Critical Architectural Rules & Invariants

### 2.1 The Netlify 10-Second Ceiling
- The backend runs as Next.js 15 Serverless Functions on Netlify.
- **NEVER** proxy large files or decompress archives on the server.
- **NEVER** execute long-running loops or sequential network calls.
- Heavy computational tasks (archive decompression, Excel spreadsheet parsing, markdown rendering) are strictly shifted to client browser RAM.

### 2.2 Unified Supabase Storage Engine (`stages` Bucket)
- **Zero AWS Dependency:** The platform uses **Supabase Storage** for private archive storage. No AWS S3, IAM user, or AWS credentials are required.
- **Private Bucket:** Archives live in the private `stages` bucket.
- **Signed URLs:**
  - Participant reads use **60-second Signed GET URLs** generated via `supabaseAdmin.storage.from('stages').createSignedUrl(storagePath, 60)`.
  - Admin uploads use **300-second Signed Upload URLs** via `createSignedUploadUrl(storagePath)`.
- Client browsers download and upload directly to Supabase Storage CDN, completely bypassing the Netlify server function runtime memory.

### 2.3 Zero-Download In-Memory File Sandbox
- When participants access a stage archive, the raw ZIP binary is fetched into RAM as a `Blob` and decompressed using `@zip.js/zip.js`.
- Files are parsed in-memory:
  - Spreadsheets (`.xlsx`, `.xls`, `.csv`) are parsed into 2D row/column arrays via `xlsx` (SheetJS) and rendered using virtualized/scrollable grids.
  - Text and markdown files are held as in-memory strings.
- **No file may be saved to disk.** Any code introducing OS download triggers (`a.download`, filesystem API, or server disk storage) is a violation of platform security.

### 2.4 Anti-Cheat & Selective Copy Invariants
- **Fullscreen Mode:** Required for the arena. Exiting fullscreen activates a high-contrast blurred lock overlay and dispatches a telemetry ping.
- **Global Lockouts:** Context menus, text selection, devtools shortcuts (`F12`, `Ctrl+Shift+I/J/C`, `Ctrl+U`), and clipboard shortcuts (`Ctrl+C`, `Cmd+C`) are blocked.
- **Selective Prompt Copy Exception:**
  - The admin configures `allowed_copy_filename` for each stage (e.g., `ai_prompt.txt`).
  - ONLY when the active open tab matches `stage.allowedCopyFilename` (case-insensitive basename match):
    - Text selection in the editor is enabled.
    - A dedicated glowing "Copy AI Prompt" button is unlocked to write content to `navigator.clipboard`.
  - On every other file, a red "CLIPBOARD LOCKED (Read-Only)" indicator is shown, and copy operations fail silently or show an alert.

### 2.5 Hidden Anti-Cheat Telemetry & Stage Password Progression
- Participant starts are recorded the moment they fetch the ZIP signed URL (`started_at = NOW()`), protected by `ON CONFLICT DO NOTHING`.
- Submissions (`POST /api/stage/submit`) validate `nextStagePassword` and compare elapsed time against `stages.min_expected_seconds`.
- If the participant completed the stage faster than expected, they are silently marked as `flagged_too_fast = true` with a detailed `flag_reason`. The participant is allowed to advance to stage $N+1$ so they are unaware they were flagged.
- If the password is wrong, the modal returns `"Wrong password, try to figure it out once again."` and keeps the user on the current stage.

### 2.6 Server/Client Supabase Security Boundary
- `apps/web/src/lib/supabase.ts` exports two clients:
  1. `supabase`: Browser-safe anonymous client with `NEXT_PUBLIC_SUPABASE_ANON_KEY`, used for Realtime leaderboard and telemetry subscriptions.
  2. `supabaseAdmin`: Server-only service-role client with `SUPABASE_SERVICE_ROLE_KEY`.
- `apps/web/src/lib/storage.ts` generates time-limited signed URLs using `supabaseAdmin`.
- **In-Memory Guard:** Client API requests must **never** return passwords or `min_expected_seconds` to the browser in `access-zip`. Stage password checks are executed on the server in `POST /api/stage/submit` alongside client-side ZIP decompression tests in RAM.

---

## 3. Tech Stack Directory Reference

```
apps/web/src/
├── app/
│   ├── (admin)/admin/page.tsx       # 4-Tab Admin Dashboard (Stages, Participants, Brevo, Telemetry)
│   ├── (arena)/arena/page.tsx       # Fullscreen Participant IDE & Contest Arena
│   └── api/
│       ├── auth/verify/             # Token authentication
│       ├── admin/storage-upload/    # Supabase Storage Signed Upload URL generator
│       ├── admin/stages/            # Stage metadata & zip_password persistence
│       ├── admin/participants/      # Bulk participant ingestion
│       ├── brevo/send/              # High-throughput pooled SMTP mailer
│       └── stage/
│           ├── access-zip/          # 60s Signed GET & clock initialization
│           ├── telemetry-ping/      # Background beacon for tab switches / fullscreen exits
│           └── submit/              # Password verification & speed audit
├── components/
│   ├── arena/                       # Arena UI modules (IDE, Sheets, Unlock Modal, Leaderboard)
│   └── admin/                       # Admin tab modules
└── lib/
    ├── storage.ts                   # Supabase Storage factory (signed URLs & bucket management)
    ├── s3.ts                        # Re-export adapter for storage.ts (backwards compatibility)
    ├── zip-engine.ts                # Client-side decompression & SheetJS parser
    ├── supabase.ts                  # Supabase clients (Anon + Service Role)
    └── types.ts                     # TypeScript schemas
```

---

## 4. Common Tasks & Extension Recipes

### Adding a New File Previewer
1. Update `apps/web/src/lib/zip-engine.ts` to detect the file extension and extract the buffer.
2. Add a rendering component inside `apps/web/src/components/arena/`.
3. Ensure user-select and copy-prevention rules are respected unless the file matches `allowed_copy_filename`.

### Adjusting SMTP Batching
1. Edit `apps/web/src/app/api/brevo/send/route.ts`.
2. Keep `maxConnections: 5` and batch size around 25 to guarantee delivery completes within 10 seconds.
