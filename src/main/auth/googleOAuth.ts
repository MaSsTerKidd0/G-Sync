import { shell } from 'electron'
import { createServer, IncomingMessage, ServerResponse } from 'http'
import { randomBytes, createHash } from 'crypto'
import { URL } from 'url'
import { TokenData, saveTokens, loadTokens, clearTokens, isTokenExpired } from './tokenStore'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'

function getClientId(): string {
  const id = process.env.GSYNC_GOOGLE_CLIENT_ID
  if (!id) {
    throw new Error(
      'GSYNC_GOOGLE_CLIENT_ID not set in environment. ' +
      'Make sure .env exists in the project root with your Google OAuth client ID.'
    )
  }
  return id
}

function getClientSecret(): string | undefined {
  const secret = process.env.GSYNC_GOOGLE_CLIENT_SECRET
  return secret && secret.trim() !== '' ? secret : undefined
}

function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url')
}

function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

function generateState(): string {
  return randomBytes(16).toString('hex')
}

export async function startLogin(): Promise<TokenData> {
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const state = generateState()
  const clientId = getClientId()

  return new Promise<TokenData>((resolve, reject) => {
    // Store the redirect URI once the server binds — this must be captured
    // BEFORE server.close() because server.address() returns null after close.
    let boundRedirectUri = ''

    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const reqUrl = new URL(req.url || '/', `http://127.0.0.1`)
        const returnedState = reqUrl.searchParams.get('state')
        const code = reqUrl.searchParams.get('code')
        const error = reqUrl.searchParams.get('error')

        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end(
            '<html><body><h2>Authentication failed</h2><p>You can close this window.</p></body></html>'
          )
          server.close()
          reject(new Error(`OAuth error: ${error}`))
          return
        }

        if (!code || !returnedState) {
          res.writeHead(400, { 'Content-Type': 'text/html' })
          res.end('<html><body><p>Missing code or state parameter.</p></body></html>')
          return
        }

        if (returnedState !== state) {
          res.writeHead(400, { 'Content-Type': 'text/html' })
          res.end(
            '<html><body><h2>Security error</h2><p>State mismatch. Please try again.</p></body></html>'
          )
          server.close()
          reject(new Error('OAuth state mismatch — possible CSRF attack'))
          return
        }

        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(
          '<html><body style="font-family:system-ui;text-align:center;padding:60px"><h2>Authentication successful!</h2><p>You can close this window and return to G-Sync.</p></body></html>'
        )
        server.close()

        // Use the redirect URI captured at bind time — server.address() is
        // null after close(), which was causing redirect_uri_mismatch.
        const tokens = await exchangeCodeForTokens(
          code,
          codeVerifier,
          boundRedirectUri,
          clientId
        )
        resolve(tokens)
      } catch (err) {
        server.close()
        reject(err)
      }
    })

    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      boundRedirectUri = `http://127.0.0.1:${port}`

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: boundRedirectUri,
        response_type: 'code',
        scope: DRIVE_SCOPE,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state: state,
        access_type: 'offline',
        prompt: 'consent'
      })

      const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`
      shell.openExternal(authUrl)
    })

    server.on('error', (err) => {
      reject(err)
    })

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close()
      reject(new Error('Login timed out — no response received within 5 minutes'))
    }, 5 * 60 * 1000)
  })
}

async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string,
  clientId: string
): Promise<TokenData> {
  const body = new URLSearchParams({
    client_id: clientId,
    code,
    code_verifier: codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri
  })

  const clientSecret = getClientSecret()
  if (clientSecret) {
    body.set('client_secret', clientSecret)
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Token exchange failed (${response.status}): ${errorBody}`)
  }

  const data = await response.json()

  const tokens: TokenData = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    scope: data.scope,
    token_type: data.token_type,
    obtained_at: Date.now()
  }

  saveTokens(tokens)
  return tokens
}

export async function refreshAccessToken(): Promise<TokenData | null> {
  const tokens = loadTokens()
  if (!tokens || !tokens.refresh_token) return null

  const clientId = getClientId()
  const body = new URLSearchParams({
    client_id: clientId,
    refresh_token: tokens.refresh_token,
    grant_type: 'refresh_token'
  })

  const clientSecret = getClientSecret()
  if (clientSecret) {
    body.set('client_secret', clientSecret)
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error('[OAuth] Token refresh failed:', response.status, errorBody)

    // Detect revoked consent / expired refresh token
    try {
      const errorJson = JSON.parse(errorBody)
      if (errorJson.error === 'invalid_grant') {
        console.warn('[OAuth] Refresh token revoked (invalid_grant) — clearing tokens')
        clearTokens()
      }
    } catch {
      // Error body is not JSON — treat as transient failure
    }

    return null
  }

  const data = await response.json()

  const updatedTokens: TokenData = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || tokens.refresh_token,
    expires_in: data.expires_in,
    scope: data.scope || tokens.scope,
    token_type: data.token_type || tokens.token_type,
    obtained_at: Date.now()
  }

  saveTokens(updatedTokens)
  return updatedTokens
}

export async function getValidAccessToken(): Promise<string | null> {
  const tokens = loadTokens()
  if (!tokens) return null

  if (!isTokenExpired(tokens)) {
    return tokens.access_token
  }

  const refreshed = await refreshAccessToken()
  return refreshed ? refreshed.access_token : null
}

export function getAuthStatus(): { connected: boolean; encryptionWarning?: string } {
  const tokens = loadTokens()
  return {
    connected: tokens !== null && !!tokens.refresh_token
  }
}

export function disconnect(): void {
  clearTokens()
}
