import FileIcon from './FileIcon'

interface DriveFile {
  id: string
  name: string
  mimeType: string
  modifiedTime: string
  size?: string
}

interface FileListProps {
  files: DriveFile[]
  loading: boolean
  error?: string
}

function formatBytes(bytes: string | undefined): string {
  if (!bytes) return '—'
  const n = parseInt(bytes, 10)
  if (isNaN(n)) return '—'
  if (n === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(n) / Math.log(1024))
  return `${(n / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  } catch {
    return iso
  }
}

export default function FileList({ files, loading, error }: FileListProps): React.JSX.Element {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <svg
          className="animate-spin h-5 w-5 mr-2"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        Loading files...
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-4 text-sm text-red-400">
        {error}
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No files found in your Google Drive.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-700">
      <table className="w-full text-sm text-left">
        <thead className="bg-gray-800/70 text-gray-400 text-xs uppercase tracking-wider">
          <tr>
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Modified</th>
            <th className="px-4 py-3 text-right">Size</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-700/50">
          {files.map((file) => (
            <tr key={file.id} className="hover:bg-gray-800/30 transition-colors">
              <td className="px-4 py-3 font-medium text-gray-200">
                <FileIcon
                  mimeType={file.mimeType}
                  type={file.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file'}
                  size={18}
                  className="mr-2 inline-block align-text-bottom"
                />
                {file.name}
              </td>
              <td className="px-4 py-3 text-gray-400">{formatDate(file.modifiedTime)}</td>
              <td className="px-4 py-3 text-gray-400 text-right">{formatBytes(file.size)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
