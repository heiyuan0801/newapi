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
import { execFileSync } from 'node:child_process'

import { expect, it } from 'vitest'

import { buildGuideCurl, getGuideBaseUrl } from '../lib/request-example'

it.each([
  ['https://api.example/', 'https://api.example/v1'],
  ['https://api.example/proxy/', 'https://api.example/proxy/v1'],
  ['https://api.example/proxy/v1/', 'https://api.example/proxy/v1'],
  [undefined, 'https://console.example/v1'],
  ['javascript:alert(1)', 'https://console.example/v1'],
  ['https://user:password@api.example/', 'https://console.example/v1'],
  ['https://api.example/?key=secret', 'https://console.example/v1'],
])(
  'normalizes configured BaseURL %s without credentials or duplicate v1',
  (configured, expected) => {
    expect(getGuideBaseUrl(configured, 'https://console.example')).toBe(
      expected
    )
  }
)

it('copies literal model and endpoint arguments while expanding only the key placeholder', () => {
  const model = 'model\'$(printf unsafe)`printf unsafe`"\\\nname'
  const base = "https://api.example/proxy'$(printf unsafe)/v1"
  const script = [
    'curl() { printf "%s\\0" "$@"; }',
    buildGuideCurl(base, model),
  ].join('\n')
  const args = execFileSync('/bin/sh', ['-c', script], {
    env: { NEW_API_KEY: 'fixture-placeholder' },
  })
    .toString()
    .split('\0')
    .filter(Boolean)
  expect(args[0]).toBe(`${base}/chat/completions`)
  expect(args[4]).toBe('Authorization: Bearer fixture-placeholder')
  expect(JSON.parse(args[6])).toEqual({
    model,
    messages: [{ role: 'user', content: 'Hello!' }],
  })
  expect(buildGuideCurl(base, model)).toContain('$NEW_API_KEY')
  expect(buildGuideCurl(base, model)).not.toContain('fixture-placeholder')
})
