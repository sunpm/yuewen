import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import lifecycle from '../ops/recovery-lifecycle.json'
import locks from '../ops/recovery-locks.json'

const ruleSet = z.object({ rules: z.array(z.looseObject({ id: z.string() })).optional() })
function sortedRules(value: unknown) {
  return (ruleSet.parse(value).rules ?? []).sort((a, b) => a.id.localeCompare(b.id))
}

async function storageStatus() {
  const config = z
    .object({
      RECOVERY_R2_ACCOUNT_ID: z.string().regex(/^[a-f0-9]{32}$/),
      RECOVERY_R2_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/),
      RECOVERY_SCOPE: z.literal('production'),
      RECOVERY_R2_API_TOKEN: z.string().trim().min(1),
    })
    .safeParse(process.env)
  if (!config.success)
    return {
      healthy: false,
      status: 'unavailable',
      invalidConfiguration: config.error.issues.map((issue) => issue.path[0]),
    }

  const {
    RECOVERY_R2_ACCOUNT_ID: account,
    RECOVERY_R2_BUCKET: bucket,
    RECOVERY_SCOPE: scope,
    RECOVERY_R2_API_TOKEN: token,
  } = config.data
  const checks = [
    {
      name: 'lifecycle',
      path: 'lifecycle',
      matches: (value: unknown) => isDeepStrictEqual(sortedRules(value), sortedRules(lifecycle)),
    },
    {
      name: 'locks',
      path: 'lock',
      matches: (value: unknown) => isDeepStrictEqual(sortedRules(value), sortedRules(locks)),
    },
    {
      name: 'managedDomain',
      path: 'domains/managed',
      matches: (value: unknown) => !z.object({ enabled: z.boolean() }).parse(value).enabled,
    },
    {
      name: 'customDomains',
      path: 'domains/custom',
      matches: (value: unknown) =>
        z
          .object({ domains: z.array(z.object({ enabled: z.boolean() })) })
          .parse(value)
          .domains.every((domain) => !domain.enabled),
    },
  ]
  const results = await Promise.all(
    checks.map(async (check) => {
      try {
        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${bucket}/${check.path}`,
          {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
            redirect: 'error',
            signal: AbortSignal.timeout(15_000),
          },
        )
        if (!response.ok) {
          await response.body?.cancel()
          return { name: check.name, status: 'unavailable', httpStatus: response.status }
        }
        const { result } = z
          .object({ success: z.literal(true), result: z.unknown() })
          .parse(await response.json())
        return { name: check.name, status: check.matches(result) ? 'ok' : 'mismatch' }
      } catch {
        // API bodies and errors can include credentials or account details; only emit fixed states.
        return { name: check.name, status: 'unavailable' }
      }
    }),
  )
  const healthy = results.every((check) => check.status === 'ok')
  return {
    healthy,
    status: results.some((check) => check.status === 'unavailable')
      ? 'unavailable'
      : healthy
        ? 'ok'
        : 'mismatch',
    account,
    bucket,
    scope,
    checks: results,
  }
}

try {
  const result = await storageStatus()
  console.log(JSON.stringify(result))
  process.exitCode = result.healthy ? 0 : 1
} catch {
  console.log(JSON.stringify({ healthy: false, status: 'unavailable' }))
  process.exitCode = 1
}
