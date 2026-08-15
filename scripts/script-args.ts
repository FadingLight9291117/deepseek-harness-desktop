/**
 * Shared argv plumbing for artifact scripts: parseArgs with the repo's
 * help/parse-error exit convention (usage + exit 1 on malformed flags,
 * usage + exit 0 on --help). Callers cast the returned values to their own
 * flag table — the widened config here is what keeps the convention in one
 * place.
 * @module script-args
 */

import { parseArgs, type ParseArgsConfig } from 'node:util'

/**
 * Parse argv and own the help and parse-error exits.
 * @param config - the parseArgs config (callers pass `{ args: argv, options }`).
 * @param usage - this script's usage text.
 * @param prefix - this script's log/error prefix.
 * @returns the parsed values (cast to the caller's flag table).
 */
export function parseScriptArgs(
  config: ParseArgsConfig,
  usage: () => string,
  prefix: string,
): ReturnType<typeof parseArgs>['values'] {
  let result: ReturnType<typeof parseArgs>
  try {
    result = parseArgs(config)
  } catch (error) {
    console.error(`${prefix}: ${error instanceof Error ? error.message : String(error)}\n`)
    console.error(usage())
    process.exit(1)
  }
  if (result.values.help) {
    console.log(usage())
    process.exit(0)
  }
  return result.values
}

/**
 * Parse a comma-separated `--targets` list, defaulting to the host target.
 * @param raw - the raw targets value (absent selects the host).
 * @param parse - one target spec parser.
 * @param host - the host-target constructor.
 * @returns the parsed targets (never empty).
 */
export function parseTargetList<T>(
  raw: string | undefined,
  parse: (spec: string) => T,
  host: () => T,
): T[] {
  if (raw === undefined) return [host()]
  return raw.split(',').map(part => part.trim()).filter(part => part !== '').map(parse)
}
