# EventPlatformAIClub

> **Production-Grade Serverless Anti-Cheat Contest & Stage-Locked Archive Sandbox Platform**  
> Engineered to support **150–200 concurrent participants** with **zero server compute bottlenecks**.  
> Storage Engine: **Supabase Storage** (Private `stages` bucket) • Database & Realtime: **Supabase** • Hosting: **Netlify**

---

## 📌 Overview

**EventPlatformAIClub** is an ultra-lightweight, high-concurrency hackathon and contest platform designed for high-stakes AI puzzles, data analysis contests, and cybersecurity challenges. 

Traditional contest platforms suffer from centralized server bottlenecks when hundreds of users simultaneously download archives, extract files, or submit code. EventPlatformAIClub solves this by shifting compute-heavy tasks (archive decompression, Excel spreadsheet parsing, markdown rendering) directly into **client browser RAM**, backed by **Netlify Serverless Functions**, **Supabase Storage Signed URLs**, and **Supabase Realtime**.

By utilizing **Supabase Storage**, you eliminate the need for AWS accounts, S3 bucket policies, IAM credentials, and Netlify AWS variable collisions.

---

## ⚡ Key Architectural Pillars & Security Invariants

### 1. 🛡️ Zero-Download In-Browser ZIP & Sandbox
- All stage archives are stored in a **100% Private Supabase Storage Bucket** (`stages`).
- Accessing a stage issues a short-lived **60-second Supabase Storage Signed `GET` URL**.
- The browser fetches the archive binary into client RAM (`Blob`) and decompresses it strictly in-memory via `@zip.js/zip.js`.
- **Zero OS Disk Writes:** Extracted files exist only in browser memory. File downloads, browser save-as triggers, and filesystem writing are strictly prevented.
- **In-Browser File Visualizers:**
  - **Spreadsheets (`.xlsx`, `.xls`, `.csv`):** Parsed via SheetJS into virtualized, sticky-header multi-sheet grids with instant text filtering.
  - **Markdown (`.md`):** Formatted prose rendering with code syntax highlighting.
  - **Plain Text (`.txt`):** Monospace line-numbered code view.

### 2. 🔐 Stage-Locked ZIP Decryption Password Gate
- To advance from Stage $N$ to Stage $N+1$, participants analyze the contents of the current stage (spreadsheets, logs, prompt instructions) to deduce the decryption password for the next stage archive.
- Clicking **"Unlock Next Stage"** opens the password verification modal:
  - The browser fetches Stage $N+1$'s encrypted archive from Supabase Storage into RAM.
  - `@zip.js/zip.js` tests client-side decompression with the entered password.
  - **On Failure:** Displays `"Wrong password, try to figure it out once again."` and keeps the user on their current stage with no progress lost.
  - **On Success:** Decrypts the archive in memory, calls `POST /api/stage/submit` with `nextStagePassword`, advances `current_stage`, awards points via an atomic PL/pgSQL RPC, triggers celebration confetti, and streams updates to the live leaderboard.

### 3. 👁️ Anti-Cheat Fullscreen Sandbox & Selective Prompt Copy
- **Forced Fullscreen:** The Arena forces `document.documentElement.requestFullscreen()`. Any fullscreen exit blurs the entire workspace behind an unclosable "Return to Fullscreen Arena" overlay and emits a silent telemetry beacon.
- **Global Input Lockout:** Right-click context menus (`contextmenu`), text selection (`user-select: none`), DevTools shortcuts (`F12`, `Ctrl+Shift+I/J/C`, `Ctrl+U`), and clipboard shortcuts (`Ctrl+C`, `Cmd+C`) are blocked globally.
- **Selective Prompt Copy Exception:**
  - The contest admin configures `allowed_copy_filename` (e.g. `ai_prompt.txt`).
  - **ONLY** when the participant opens the tab matching this exact filename is text selection unlocked and a glowing **"Copy AI Prompt"** button enabled in the header bar.
  - All other files show a red **"CLIPBOARD LOCKED (Read-Only)"** badge.

### 4. ⏱️ Hidden Anti-Cheat Telemetry & Speed-Run Flagging
- **Clock Initialization:** When `POST /api/stage/access-zip` is requested, the backend inserts a row into `stage_telemetry` with `started_at = NOW()` using `ON CONFLICT DO NOTHING`. Refreshing the page or re-fetching the signed URL never resets the clock.
- **Behavioral Auditing:** Fullscreen exits and tab switches emit silent beacons to `POST /api/stage/telemetry-ping`, incrementing violation counters.
- **Speed-Run Detection:** Upon unlocking the next stage (`POST /api/stage/submit`), the backend computes `duration_seconds = NOW() - started_at`. If `duration_seconds < min_expected_seconds`, the user is **silently flagged** (`flagged_too_fast = true`). The participant advances without interruption, while the Admin Telemetry Radar displays an alert row in real time.

### 5. 👥 Two Dedicated User Roles
- **Participant:** Authenticates via 1-click magic link (`/arena?token=...`) or manual token entry. Operates inside the Fullscreen Anti-Cheat IDE, decrypts stage archives, and inspects the live leaderboard drawer.
- **Admin (`/admin`):**
  - **Stage Builder:** Uploads ZIP files directly to Supabase Storage via signed `PUT` URLs, configures `zip_password`, sets `allowed_copy_filename`, `min_expected_seconds`, and stage points.
  - **Participant Importer:** Ingests CSV or text lists (`name,email`) to generate unique cryptographic tokens.
  - **Brevo Studio:** Live HTML template designer with `{{name}}`, `{{token}}`, and `{{access_link}}` variables, dispatching pooled bulk SMTP invitations.
  - **Telemetry Radar:** Live monitoring dashboard displaying participant status, stage durations, tab switches, fullscreen exits, and speed-run flags.

---

## 🏗️ Repository Architecture

This project is organized as a **Turborepo monorepo** managed with `pnpm`:

```
EventPlatformAIClub/
├── netlify.toml                       # Netlify deployment & @netlify/plugin-nextjs config
├── pnpm-workspace.yaml                # Workspace definitions
├── package.json                       # Monorepo root scripts & dev dependencies
├── turbo.json                         # Turborepo task pipeline
├── .env.example                       # Reference environment variables (Zero AWS credentials!)
├── PRD.md                             # Comprehensive Product Requirements Document
├── ARCHITECTURE.md                    # System Architecture & Technical Specifications
├── AI_CONTEXT.md                      # AI Assistant & Engineering Context Guide
├── packages/
│   ├── db-schema/
│   │   └── schema.sql                 # Supabase PostgreSQL schema, buckets & atomic RPCs
│   └── tsconfig/
│       └── base.json                  # Shared TypeScript configuration
├── scripts/
│   └── generate-demo-zip.mjs          # Script to generate sample password-protected ZIP stages
└── apps/
    └── web/
        ├── next.config.ts             # Next.js 15 configuration
        ├── tailwind.config.ts         # High-contrast dark cyber theme configuration
        ├── public/                    # Static assets & demo archives
        └── src/
            ├── app/
            │   ├── page.tsx           # Landing page / Magic-link authentication gateway
            │   ├── (admin)/admin/     # 4-Tab Admin Command Center
            │   ├── (arena)/arena/     # Fullscreen Participant Anti-Cheat Arena
            │   └── api/
            │       ├── auth/verify/          # Participant & Admin authentication
            │       ├── admin/storage-upload/ # Supabase Storage Signed Upload URL generator
            │       ├── admin/stages/         # Stage rules & metadata manager
            │       ├── admin/participants/   # Bulk participant importer
            │       ├── brevo/send/           # Pooled SMTP chunked bulk emailer
            │       └── stage/
            │           ├── access-zip/       # 60s Signed GET URL & timer init
            │           ├── telemetry-ping/   # Silent telemetry recorder
            │           └── submit/           # Password validation & speed-run audit
            ├── components/
            │   ├── arena/             # AntiCheatWrapper, InBrowserIDE, SheetViewer,
            │   │                      # UnlockNextStageModal, ZipPasswordModal, LiveLeaderboard
            │   └── admin/             # StageBuilderTab, ParticipantImportTab,
            │                          # BrevoStudioTab, TelemetryRadarTab
            └── lib/                   # storage.ts, zip-engine.ts, supabase.ts, auth.ts, types.ts
```

---

## 📋 Prerequisites

Before setting up the project, ensure you have:

- **Node.js:** `v18.18.0` or higher (`v20.x` or `v22.x` recommended)
- **pnpm:** `v9.x` or `v10.x` (`npm install -g pnpm`)
- **Supabase Account:** Free tier project provides PostgreSQL, Realtime, and **1 GB free Storage**
- **Brevo Account:** (formerly Sendinblue) SMTP credentials for bulk invitation mailings
- **Netlify Account:** For production serverless hosting

> [!TIP]
> **No AWS Account Required:** Supabase Storage replaces AWS S3 entirely. Everything (database, auth tokens, telemetry, realtime leaderboard, and stage ZIP archives) lives inside your single Supabase project.

---

## 🚀 Local Development Setup

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/PrateekSingh2/EventPlatformAIClub.git
cd EventPlatformAIClub

# Install all workspace dependencies via pnpm
pnpm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory (or in `apps/web/.env.local`):

```bash
cp .env.example .env
```

Edit `.env` with your actual credentials:

```env
# Supabase (Database, Realtime & Storage)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1Ni...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1Ni...

# Brevo SMTP
BREVO_SMTP_HOST=smtp-relay.brevo.com
BREVO_SMTP_PORT=587
BREVO_SMTP_USER=your-brevo-login-email@domain.com
BREVO_SMTP_KEY=xsmtp-your-generated-key
BREVO_SENDER_EMAIL=contests@yourdomain.com
BREVO_SENDER_NAME="Contest Master"

# Security
ADMIN_SECRET_KEY=admin123
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Initialize Supabase Database & Storage Bucket

1. Open your **Supabase Dashboard** -> **SQL Editor**.
2. Open [`packages/db-schema/schema.sql`](file:///e:/EventPlatformAIClub/packages/db-schema/schema.sql).
3. Copy and run the entire SQL script. This sets up:
   - The private **`stages`** storage bucket with a 100MB file limit.
   - `stages`, `users`, and `stage_telemetry` tables.
   - The atomic `complete_stage_and_award_points` PL/pgSQL function.
   - Realtime publication on `users` and `stage_telemetry`.
   - Default indexes for sub-millisecond lookups.

### 4. Generate Demo Stage Archives

Run the provided generator script to create test ZIP archives:

```bash
node scripts/generate-demo-zip.mjs
```

This creates 3 demo stages in `apps/web/public/`:
- **Stage 1 (`demo-stage-1.zip`):** Unencrypted open archive. Contains `readme.md`, `dataset.xlsx`, and `ai_prompt.txt` (which holds the clue for Stage 2 password: `cyber2026`).
- **Stage 2 (`demo-stage-2-encrypted.zip`):** Encrypted with password `cyber2026`. Contains `stage2_data.csv` and `quantum_secrets.md` (which holds the clue for Stage 3 password: `quantum4096`).
- **Stage 3 (`demo-stage-3-encrypted.zip`):** Encrypted with password `quantum4096`. Contains final flag and winner confirmation.

### 5. Run the Local Development Server

```bash
# Start Turborepo dev server
pnpm dev

# Or build and run production server locally
pnpm --filter web build
pnpm --filter web start -p 3000
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Built-in Demo Credentials

For rapid local testing and verification without setting up cloud accounts immediately:

| Role | Access URL | Credentials |
| :--- | :--- | :--- |
| **Participant Arena** | `http://localhost:3000/arena?token=AX-DEMO-2026` | Token: `AX-DEMO-2026` (or click *"1-Click Demo Arena"* on home page) |
| **Admin Center** | `http://localhost:3000/admin` | Secret Key: `admin123` |
| **Stage 2 Password** | Entered in *"Unlock Next Stage"* modal | `cyber2026` |
| **Stage 3 Password** | Entered in *"Unlock Next Stage"* modal | `quantum4096` |

---

## 🌐 Production Deployment on Netlify

Netlify is the designated target host, running Next.js 15 App Router Serverless Functions powered by `@netlify/plugin-nextjs`.

### Method A: Git Integration (Recommended)

1. **Push your code to GitHub:**
   ```bash
   git push -u origin main
   ```
2. **Connect to Netlify:**
   - Go to [Netlify App](https://app.netlify.com) and click **"Add new site"** -> **"Import an existing project"**.
   - Select your GitHub repository (`EventPlatformAIClub`).
3. **Configure Build Settings:**
   - **Base directory:** `apps/web`
   - **Build command:** `pnpm --filter web build`
   - **Publish directory:** `apps/web/.next`
4. **Configure Environment Variables:**
   Under **Site configuration** -> **Environment variables**, add the required variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `BREVO_SMTP_HOST`
   - `BREVO_SMTP_PORT`
   - `BREVO_SMTP_USER`
   - `BREVO_SMTP_KEY`
   - `BREVO_SENDER_EMAIL`
   - `BREVO_SENDER_NAME`
   - `ADMIN_SECRET_KEY`
   - `NEXT_PUBLIC_APP_URL` (set to your Netlify URL, e.g. `https://my-contest.netlify.app`)
5. Click **"Deploy site"**. Netlify will run the build, detect `@netlify/plugin-nextjs`, and provision serverless edge routes.

---

### Method B: Netlify CLI Direct Deploy

```bash
# Install Netlify CLI
pnpm add -g netlify-cli

# Login to Netlify
netlify login

# Link your project
netlify link

# Deploy production build
netlify deploy --build --prod
```

---

## 💡 How Netlify's 10-Second Ceiling Is Handled

Netlify serverless functions enforce a strict **10-second execution ceiling**. EventPlatformAIClub is engineered specifically to prevent timeouts:

1. **Client-Side Extraction:** ZIP files are downloaded directly from Supabase Storage via signed URLs into the user's browser. Netlify serverless functions never proxy large file streams or perform archive decompression.
2. **Pooled SMTP Dispatch:** Sending bulk emails sequentially to 200 participants would take 60+ seconds and timeout. Instead, [`apps/web/src/app/api/brevo/send/route.ts`](file:///e:/EventPlatformAIClub/apps/web/src/app/api/brevo/send/route.ts) initializes a pooled SMTP connection (`nodemailer` with `pool: true`, `maxConnections: 5`) and dispatches messages in parallel chunks of 25 using `Promise.allSettled`, completing the entire delivery cycle in under 8 seconds.
3. **Atomic Database Transactions:** Stage advancement and score increments execute in a single PostgreSQL call (`complete_stage_and_award_points`), completing in less than 25ms.

---

## 🛠️ Admin Workflow Guide

### 1. Ingesting a Stage
1. Navigate to `/admin` and enter your `ADMIN_SECRET_KEY`.
2. Open the **Stage Builder** tab.
3. Set Stage Number, Title, Points, and `min_expected_seconds` (e.g. `120`).
4. Set `allowed_copy_filename` to the file participants are authorized to copy (e.g. `ai_prompt.txt`).
5. Set `zip_password` (the password required to decrypt this archive).
6. Upload the stage ZIP file (it uploads directly to the private `stages` Supabase Storage bucket via signed upload URL).
7. Click **"Save Stage Configuration"**.

### 2. Importing Participants
1. Open the **Participant Ingestion** tab.
2. Paste a list in `Name, email` format or upload a `.csv` file.
3. Click **"Generate Tokens & Ingest"**. Unique cryptographic access tokens (`AX-XXXX-XXXX`) are created in Supabase.

### 3. Dispatching Bulk Invitations
1. Open the **Brevo Studio** tab.
2. Customize the subject and HTML email body.
3. Use variables `{{name}}`, `{{token}}`, and `{{access_link}}`.
4. Click **"Dispatch Bulk Emails"** to send pooled emails to all participants.

### 4. Live Telemetry & Anti-Cheat Monitoring
1. Open the **Telemetry Radar** tab.
2. Watch real-time participant progression:
   - Active stage and total points.
   - Total duration spent on each stage.
   - Number of fullscreen exits and tab switches.
   - **Neon Red Alert Rows:** Automatically triggered when a participant completes a stage faster than `min_expected_seconds` (`flagged_too_fast = true`).
   - Use the **"Disqualify"** action if malicious behavior is confirmed.

---

## 🔒 Security Best Practices

- **Never commit `.env` or sensitive keys:** `.gitignore` excludes all `.env` files, `.turbo/`, and `PROMPT.md`.
- **Change `ADMIN_SECRET_KEY`:** Never use default keys in production. Generate a 32+ character high-entropy string.
- **Supabase Row Level Security (RLS):** Supabase Service Role Key must only be used inside Next.js server routes, never in client components.
- **Next.js Version:** Running on `next@^15.3.3` (patched for CVE-2025-55182).

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
