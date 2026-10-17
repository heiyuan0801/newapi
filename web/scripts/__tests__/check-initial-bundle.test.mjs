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
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { gzipSync } from 'node:zlib'

import { measureInitialBundle } from '../check-initial-bundle.mjs'

function fixture(t, html) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'new-api-bundle-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(path.join(root, 'index.html'), html)
  writeFileSync(path.join(root, 'entry.js'), 'console.log("entry")')
  writeFileSync(path.join(root, 'style.css'), 'body { color: black }')
  return root
}

test('measures unique initial scripts and styles and enforces the gzip budget', (t) => {
  const root = fixture(
    t,
    '<script src="/entry.js"></script><link rel="modulepreload" href="/entry.js"><link rel="stylesheet" href="/style.css">'
  )
  const expected =
    gzipSync('console.log("entry")', { level: 9 }).length +
    gzipSync('body { color: black }', { level: 9 }).length
  const report = measureInitialBundle(root, expected)
  assert.equal(report.initial_assets.length, 2)
  assert.equal(report.total_initial_gzip_bytes, expected)
  assert.equal(report.passed, true)
  assert.equal(measureInitialBundle(root, expected - 1).passed, false)
})

test('rejects missing scripts, missing files, remote URLs and path traversal', (t) => {
  for (const html of [
    '<div>No build assets</div>',
    '<script src="/missing.js"></script>',
    '<script src="https://example.invalid/entry.js"></script>',
    '<script src="//example.invalid/entry.js"></script>',
    '<script src="../entry.js"></script>',
    '<script src="/%2e%2e/entry.js"></script>',
  ]) {
    const root = fixture(t, html)
    assert.throws(() => measureInitialBundle(root))
  }
})

test('rejects symlink escapes outside the build directory', (t) => {
  const root = fixture(t, '<script src="/outside.js"></script>')
  const outside = mkdtempSync(path.join(os.tmpdir(), 'new-api-outside-'))
  t.after(() => rmSync(outside, { recursive: true, force: true }))
  const outsideFile = path.join(outside, 'outside.js')
  writeFileSync(outsideFile, 'outside the build directory')
  symlinkSync(outsideFile, path.join(root, 'outside.js'))
  assert.throws(() => measureInitialBundle(root))
})
