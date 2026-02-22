# G-Sync

Google Drive sync desktop app built with Electron + React + TypeScript + Tailwind CSS.

**Phase 1** — Foundation & Auth: OAuth login via system browser, secure token storage, and Drive metadata display.

## Dev Setup

### Prerequisites

- Node.js 18+
- npm 9+

### Install

```bash
npm install
```

### Configure Environment

1. Copy the example env file:
   ```bash
   cp .env.example .env
   ```
2. Fill in your Google OAuth credentials (see Google Cloud Setup below):
   ```
   GSYNC_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GSYNC_GOOGLE_CLIENT_SECRET=your-client-secret
   ```

### Run in Development

```bash
npm run dev
```

### Build

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

## Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or select an existing one).
3. **Enable the Google Drive API:**
   - Navigate to **APIs & Services > Library**.
   - Search for "Google Drive API" and click **Enable**.
4. **Configure the OAuth consent screen:**
   - Go to **APIs & Services > OAuth consent screen**.
   - Choose **External** user type (for testing).
   - Fill in app name ("G-Sync"), support email, and developer contact.
   - Add the scope: `https://www.googleapis.com/auth/drive.metadata.readonly`.
   - Add your Google account as a test user under **Test users**.
5. **Create OAuth 2.0 credentials:**
   - Go to **APIs & Services > Credentials**.
   - Click **Create Credentials > OAuth client ID**.
   - Choose **Desktop app** as the application type.
   - Name it (e.g., "G-Sync Desktop").
   - Copy the **Client ID** and **Client Secret** into your `.env` file.

## Architecture

```
src/
  main/
    index.ts              — BrowserWindow, IPC handlers, startup
    auth/
      googleOAuth.ts      — OAuth flow: PKCE, loopback server, token exchange, refresh
      tokenStore.ts       — safeStorage encryption + file persistence
    drive/
      driveApi.ts         — Google Drive API calls (metadata only)
  preload/
    index.ts              — contextBridge: gsync.auth.*, gsync.drive.*
  renderer/
    src/
      App.tsx             — Main app component
      components/
        AuthPanel.tsx     — Login/disconnect UI + status indicator
        FileList.tsx      — Drive files table
```

**Security model:**
- `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`
- Tokens never touch the renderer — all API calls happen in the main process
- OAuth uses the system browser (not an embedded webview)
- Auth code captured via loopback HTTP server on `127.0.0.1` with a random port
- PKCE (S256) + state parameter for CSRF protection
- Tokens encrypted at rest via Electron `safeStorage`

## Troubleshooting

### `redirect_uri_mismatch`
Google does not require registering loopback redirect URIs for Desktop app credentials. If you see this error:
- Make sure you selected **Desktop app** (not Web application) when creating your OAuth client.
- Web app credentials require exact redirect URI matching; Desktop app credentials do not.

### `state` mismatch error
This means the `state` parameter returned from Google doesn't match what was sent. This is a CSRF protection check. Causes:
- Multiple login attempts in quick succession (the old loopback server may catch the wrong callback).
- Browser extensions modifying the redirect.
- Try logging in again with a single attempt.

### Encryption not available warning
On some Linux systems, `safeStorage` may fall back to `basic_text` backend, meaning tokens aren't strongly encrypted. The app will show a warning. To fix:
- Install `gnome-keyring`, `kwallet`, or another supported secret store.
- Ensure `libsecret` is available on your system.

### Token refresh failures
If refresh fails after a relaunch:
- Your refresh token may have been revoked. Click "Disconnect" and log in again.
- Google limits refresh token issuance — if too many are created, older ones stop working.
