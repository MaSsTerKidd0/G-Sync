/**
 * Phase 7: IPC Input Validation Helpers.
 *
 * Lightweight runtime assertion functions for IPC handler arguments.
 * Each function throws a descriptive Error on invalid input.
 * No external dependencies — plain TypeScript runtime checks.
 */

export function assertNonEmptyString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`IPC validation: ${name} must be a non-empty string`)
  }
}

export function assertOptionalString(value: unknown, name: string): asserts value is string | undefined {
  if (value !== undefined && typeof value !== 'string') {
    throw new Error(`IPC validation: ${name} must be a string or undefined`)
  }
}

export function assertStringArray(value: unknown, name: string): asserts value is string[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every((v) => typeof v === 'string' && v.length > 0)) {
    throw new Error(`IPC validation: ${name} must be a non-empty array of non-empty strings`)
  }
}

export function assertPositiveInt(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`IPC validation: ${name} must be a non-negative integer`)
  }
}

export function assertOptionalPositiveInt(value: unknown, name: string): asserts value is number | undefined {
  if (value !== undefined) assertPositiveInt(value, name)
}

export function assertBoolean(value: unknown, name: string): asserts value is boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`IPC validation: ${name} must be a boolean`)
  }
}

/**
 * Assert value is one of the allowed string values.
 */
export function assertOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  name: string
): asserts value is T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new Error(`IPC validation: ${name} must be one of: ${allowed.join(', ')}`)
  }
}

/**
 * Assert string does not exceed max length.
 */
export function assertMaxLength(value: string, maxLen: number, name: string): void {
  if (value.length > maxLen) {
    throw new Error(`IPC validation: ${name} exceeds max length of ${maxLen}`)
  }
}

/**
 * Clamp a numeric value to a maximum. Returns the clamped value.
 */
export function clampMax(value: number | undefined, max: number, defaultVal: number): number {
  if (value === undefined) return defaultVal
  return Math.min(value, max)
}
