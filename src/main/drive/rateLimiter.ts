import Bottleneck from 'bottleneck'

// ~10 req/sec with single concurrency for predictable throughput
const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 100 // ms between requests
})

/**
 * Wrap a Drive API call with rate limiting + exponential backoff for 429/5xx.
 */
export async function throttledDriveCall<T>(fn: () => Promise<T>): Promise<T> {
  return limiter.schedule(async () => {
    let attempt = 0
    const maxAttempts = 6 // ~32s max backoff

    while (true) {
      try {
        return await fn()
      } catch (err: unknown) {
        const status = (err as { status?: number }).status
        const retryable = status === 429 || (status !== undefined && status >= 500)

        attempt++
        if (!retryable || attempt >= maxAttempts) {
          throw err
        }

        // Truncated exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s + jitter
        const baseMs = Math.min(1000 * Math.pow(2, attempt - 1), 32000)
        const jitter = Math.random() * 1000
        const delayMs = baseMs + jitter
        console.warn(
          `[rateLimiter] ${status} on attempt ${attempt}, retrying in ${Math.round(delayMs)}ms`
        )
        await new Promise((r) => setTimeout(r, delayMs))
      }
    }
  })
}
