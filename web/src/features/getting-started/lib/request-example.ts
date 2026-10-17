/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
// Shell arguments stay literal even when a configured path or model includes
// quotes, dollar signs, backticks or newlines. Credentials are never accepted.
function shellLiteral(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`
}

export function getGuideBaseUrl(
  configuredAddress: unknown,
  origin: string
): string {
  let url: URL
  try {
    url = new URL(
      typeof configuredAddress === 'string' && configuredAddress.trim()
        ? configuredAddress.trim()
        : origin
    )
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error('invalid API address')
    }
  } catch {
    url = new URL(origin)
  }
  const path = url.pathname.replace(/\/+$/, '')
  url.pathname = path.endsWith('/v1') ? path : `${path}/v1`
  return url.toString().replace(/\/$/, '')
}

export function buildGuideCurl(baseUrl: string, model: string): string {
  const body = JSON.stringify({
    model,
    messages: [{ role: 'user', content: 'Hello!' }],
  })
  return [
    `curl ${shellLiteral(`${baseUrl}/chat/completions`)} \\`,
    "  -H 'Content-Type: application/json' \\",
    '  -H "Authorization: Bearer $NEW_API_KEY" \\',
    `  --data ${shellLiteral(body)}`,
  ].join('\n')
}
