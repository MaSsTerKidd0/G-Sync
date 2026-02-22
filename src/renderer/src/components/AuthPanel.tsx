interface AuthPanelProps {
  status: 'disconnected' | 'connecting' | 'connected'
  encryptionWarning?: string
  error?: string
  onLogin: () => void
  onDisconnect: () => void
}

export default function AuthPanel({
  status,
  encryptionWarning,
  error,
  onLogin,
  onDisconnect
}: AuthPanelProps): React.JSX.Element {
  return (
    <div className="rounded-xl bg-gray-800/50 border border-gray-700 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {status === 'disconnected' && (
            <svg className="w-5 h-5 text-gray-600" viewBox="0 0 87.3 78" fill="currentColor">
              <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5l5.4 9.35z" />
              <path d="M43.65 25.15L29.9 1.35c-1.35.8-2.5 1.9-3.3 3.3L1.2 52.35c-.8 1.4-1.2 2.95-1.2 4.5h27.5l16.15-31.7z" />
              <path d="M73.55 13.95c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 9.3c1.35.8 2.5 1.9 3.3 3.3l10.15 17.6h27.5c0-1.55-.4-3.1-1.2-4.5l-22.7-22.4z" opacity=".7" />
              <path d="M43.65 25.15l13.75 23.8h27.5c0-1.55-.4-3.1-1.2-4.5L60.5 4.65c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25.15z" />
            </svg>
          )}
          <div
            className={`h-3 w-3 rounded-full ${
              status === 'connected'
                ? 'bg-green-400'
                : status === 'connecting'
                  ? 'bg-yellow-400 animate-pulse'
                  : 'bg-gray-500'
            }`}
          />
          <span className="text-sm font-medium text-gray-300">
            {status === 'connected'
              ? 'Connected'
              : status === 'connecting'
                ? 'Connecting...'
                : 'Disconnected'}
          </span>
        </div>

        <div className="flex gap-2">
          {status !== 'connected' && (
            <button
              onClick={onLogin}
              disabled={status === 'connecting'}
              className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Login with Google
            </button>
          )}

          {status === 'connected' && (
            <button
              onClick={onDisconnect}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/20"
            >
              Disconnect
            </button>
          )}
        </div>
      </div>

      {encryptionWarning && (
        <div className="mt-3 rounded-md bg-yellow-500/10 border border-yellow-500/30 px-3 py-2 text-xs text-yellow-400">
          {encryptionWarning}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}
    </div>
  )
}
