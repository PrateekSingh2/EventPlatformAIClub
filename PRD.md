# Product Requirements Document (PRD)

## Project Name
**Serverless Anti-Cheat Contest & Stage-Locked Archive Sandbox Platform** (`EventPlatformAIClub`)

---

## 1. Executive Summary & Problem Statement
High-stakes coding and AI puzzle hackathons with 150–200 concurrent participants frequently suffer from two fatal vulnerabilities:
1. **Server-Side Compute & Network Bottlenecks:** Centralized servers decompressing large zip files or executing untrusted user code suffer catastrophic lag, socket exhaustion, or crash under simultaneous traffic spikes.
2. **Cheat Vectors & Prompt Leaks:** Participants bypass restrictions by directly saving secret data files to their local file system, inspecting browser devtools, or distributing problem prompt texts across unauthorized channels without audit trails.

**The Solution:** An ultra-lightweight, high-concurrency serverless architecture deployed on **Netlify**, powered by **Next.js 15 App Router**, **Supabase PostgreSQL & Realtime**, **Supabase Storage Signed URLs**, and client-side in-memory browser sandbox decompression (`@zip.js/zip.js` and SheetJS `xlsx`). The backend performs **zero heavy compute or file proxying**; instead, all archive processing occurs strictly in participant RAM.

---

## 2. Target Audience & Personas

### 2.1 Participant
- **Entry Method:** Authenticates via 1-click magic link (`/arena?token=AX-XXXX-XXXX`) or manual token input.
- **Workflow:**
  - Enters forced Fullscreen Anti-Cheat Arena.
  - Explores stages and extracts password-locked or open ZIP archives strictly into browser RAM.
  - Views `.txt`, `.md`, and `.xlsx`/`.csv` datasets inside the browser IDE with zero OS disk writes.
  - Whitelisted AI prompt file allows copy to clipboard; all other files remain copy-locked and unselectable.
  - Inspects current stage files to deduce or discover the decryption password for the next stage archive.
  - Clicks **"Unlock Next Stage"**, enters the password, and validates in-browser decryption:
    - On success: unlocks Stage $N+1$, awards points, and updates the live leaderboard.
    - On failure: displays `"Wrong password, try to figure it out once again."` and participant resumes investigation in the current stage.

### 2.2 Admin / Contest Director
- **Entry Method:** Authenticates via secure Admin Secret Key (`ADMIN_SECRET_KEY`) at `/admin`.
- **Workflow:**
  - Configures stages: uploads ZIP archives directly to Supabase Storage using signed `PUT` URLs, defines `zip_password`, sets `allowed_copy_filename`, `min_expected_seconds`, and stage points.
  - Imports participant rosters via CSV or paste (`name, email`), issuing unique cryptographically secure tokens.
  - Dispatches branded HTML onboarding emails via pooled Brevo SMTP connection.
  - Monitors Live Telemetry Radar in real time: tracks stage completion durations, flags suspicious speed-runs, detects tab switches and fullscreen exits, with controls to review or disqualify participants.

---

## 3. Core Architectural & Security Invariants

### 3.1 Zero-Download In-Browser ZIP & Sandbox
1. All archives reside in a **100% Private Supabase Storage Bucket** (`stages`). No public read access is granted.
2. Participant requests access via `POST /api/stage/access-zip`. The server issues a short-lived **60-second Supabase Storage Signed GET URL**.
3. Browser downloads the archive binary into client RAM (`Blob`) and decompresses it strictly in-memory using `@zip.js/zip.js`.
4. Extracted files are held in state memory. No download triggers, anchor links (`<a>[download]`), or filesystem writes are allowed.
5. If the ZIP is encrypted (AES or ZipCrypto), the engine intercepts decryption failure and prompts the user for the password in a glassmorphic modal.
6. Supported in-browser file visualizers:
   - **Markdown (`.md`):** Formatted prose rendering via `react-markdown` with syntax-highlighted code blocks.
   - **Plain Text (`.txt`):** Monospace line-numbered code viewer.
   - **Spreadsheets (`.xlsx`, `.xls`, `.csv`):** Parsed via SheetJS into multi-sheet virtualized/scrollable grids with sticky column/row headers and instant text filtering.

### 3.2 Anti-Cheat Fullscreen Sandbox & Selective Prompt Copy
1. **Fullscreen Enforcement:** The Arena enforces `document.documentElement.requestFullscreen()`. Any exit immediately blurs the viewport and presents an unclosable "Return to Fullscreen Arena" overlay.
2. **Global Input Lockout:**
   - Context menus (`contextmenu`) disabled globally.
   - User text selection (`user-select: none`) disabled by default across the entire DOM.
   - Keyboard shortcuts for DevTools (`F12`, `Ctrl+Shift+I`, `Ctrl+Shift+J`, `Ctrl+Shift+C`, `Ctrl+U`) and clipboard shortcuts (`Ctrl+C`, `Ctrl+X`, `Cmd+C`, `Cmd+X`) intercepted and blocked.
3. **Selective Copy Exception:**
   - Each stage defines an `allowed_copy_filename` (e.g. `ai_prompt.txt`).
   - ONLY when the participant opens the tab matching this exact filename (case-insensitive basename match):
     - Text selection is unlocked for the editor content area.
     - A glowing cyan **"Copy AI Prompt"** button unlocks in the header bar, writing file content to `navigator.clipboard`.
   - On all other files, a red **"CLIPBOARD LOCKED (Read-Only)"** badge is shown, and copy actions are discarded.

### 3.3 Silent Telemetry & Speed-Run Flagging
1. **Clock Initialization:** When `POST /api/stage/access-zip` is called, the server silently creates a record in `stage_telemetry` with `started_at = NOW()` using `ON CONFLICT DO NOTHING`. Refreshing the browser or requesting the download URL multiple times does not reset `started_at`.
2. **Behavioral Telemetry:** Window blur events and fullscreen exit events dispatch background `navigator.sendBeacon` or `fetch` pings to `POST /api/stage/telemetry-ping`, incrementing `fullscreen_exits` and `tab_switches`.
3. **Submission & Speed Detection:** When unlocking the next stage (`POST /api/stage/submit`), the backend calculates:
   $$\text{duration\_seconds} = \text{NOW}() - \text{started\_at}$$
   If $\text{duration\_seconds} < \text{min\_expected\_seconds}$, the user is **silently flagged** (`flagged_too_fast = true`, `flag_reason = 'Completed in X seconds, expected minimum Y seconds'`).
4. The user is allowed to proceed to the next stage uninterrupted, avoiding revealing detection methods, while the Admin Telemetry Radar displays a neon-red alert row in real time.

### 3.4 Stage-Locked ZIP Decryption Password Gate & Realtime Leaderboard
1. **Clue Deduction:** To advance from Stage $N$ to Stage $N+1$, participants analyze datasets, logs, or encrypted hints inside the current stage's in-memory files to deduce the password for Stage $N+1$'s ZIP archive.
2. **In-Browser Decryption Test:** Clicking **"Unlock Next Stage"** opens `UnlockNextStageModal`. The browser fetches Stage $N+1$'s signed GET URL, streams the ZIP binary into RAM, and tests client-side decompression using `@zip.js/zip.js` with the entered password.
3. **Validation & Progression:** If decryption succeeds, the client invokes `POST /api/stage/submit` with `nextStagePassword`. The server validates the password, audits time taken against `min_expected_seconds`, and executes the atomic PL/pgSQL function `complete_stage_and_award_points`.
4. **Error Handling & State Resilience:** If the entered password fails to decrypt the archive, the modal displays: `"Wrong password, try to figure it out once again."` and keeps the user on the current stage without losing state.
5. **Realtime Leaderboard:** Supabase Realtime broadcast updates the Live Leaderboard across all 150–200 connected clients without polling the database.

---

## 4. Non-Functional Requirements & Performance SLAs

| Dimension | Specification | Rationale |
| :--- | :--- | :--- |
| **Concurrency** | 150–200 simultaneous active users | Zero server CPU for file extraction; traffic served through Netlify CDN & direct Supabase Storage URLs. |
| **Serverless Execution** | $\le 10$ seconds per API invocation | Mandatory Netlify serverless execution limit. File processing is offloaded to client; SMTP connections are pooled. |
| **Database Concurrency** | Up to 200 concurrent real-time sockets | Supabase Realtime handles websocket broadcasting efficiently without connection exhaustion. |
| **Security & Privacy** | Private Supabase Storage + Signed URLs (60s) | No public bucket permissions; links expire quickly after client fetch. |
| **Infrastructure Simplicity** | Unified Supabase stack (DB + Storage) | Zero AWS IAM setup; eliminates Netlify `AWS_*` variable collisions. |

---

## 5. User Stories & Acceptance Criteria

### US-1: Participant Authentication & Magic Link Access
- **Given** a participant with token `AX-9281-4820`
- **When** they visit `/arena?token=AX-9281-4820`
- **Then** the platform validates the token against Supabase `users`, sets a client session, and loads the active stage.

### US-2: In-Memory Decompression of Encrypted Archives
- **Given** an encrypted ZIP stage archive hosted on Supabase Storage
- **When** the participant accesses the stage
- **Then** the browser requests a signed GET URL, fetches the binary into an in-memory `Blob`, attempts extraction, catches encryption error, and prompts for decryption password.
- **When** valid password is entered, files render in the IDE without touching the local disk.

### US-3: Anti-Cheat Enforcement & Selective Prompt Copy
- **Given** an active stage with `allowed_copy_filename = 'ai_prompt.txt'`
- **When** the participant views `dataset.csv`, text selection and clipboard operations are blocked.
- **When** the participant switches to `ai_prompt.txt`, text selection is enabled and clicking "Copy AI Prompt" writes content to the OS clipboard.
- **When** the user exits fullscreen or switches tabs, the screen blurs and a telemetry ping increments exit counters.

### US-4: Stage Progression via Next Stage ZIP Password Decryption
- **Given** a participant in Stage 1 who found the password clue for Stage 2
- **When** they click "Unlock Next Stage" and submit the password
- **Then** the browser fetches the Stage 2 archive into RAM and validates decryption with `@zip.js/zip.js`.
- **When** the password is valid, the server awards points, advances `current_stage` to 2, and renders Stage 2 files.
- **When** the password is wrong, the modal displays `"Wrong password, try to figure it out once again."` and returns the participant to Stage 1.

### US-5: Admin Bulk Mailer & Brevo Pooled SMTP
- **Given** an Admin with 150 participant accounts.
- **When** the Admin clicks "Dispatch Bulk Emails".
- **Then** the backend pools the Brevo SMTP connection, executes mail delivery in batches of 25 with `Promise.allSettled`, and returns completion metrics without timing out.
