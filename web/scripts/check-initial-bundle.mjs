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
import { readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { gzipSync } from 'node:zlib'

export function measureInitialBundle(distPath, maxGzipBytes = 1_100_000) {
  if (!Number.isSafeInteger(maxGzipBytes) || maxGzipBytes <= 0) {
    throw new Error('The initial bundle budget must be a positive integer')
  }
  const root = realpathSync(distPath)
  const html = readFileSync(path.join(root, 'index.html'), 'utf8')
  const urls = new Set()
  let hasScript = false
  for (const match of html.matchAll(/<(script|link)\b[^>]*>/gi)) {
    const tag = match[0]
    const attribute = match[1].toLowerCase() === 'script' ? 'src' : 'href'
    const value = tag.match(
      new RegExp(
        `\\b${attribute}\\s*=\\s*(?:"([^"]+)"|'([^']+)'|([^\\s>]+))`,
        'i'
      )
    )
    const url = value?.[1] ?? value?.[2] ?? value?.[3]
    if (!url || !/\.(?:m?js|css)(?:[?#]|$)/i.test(url)) continue
    if (attribute === 'src') hasScript = true
    if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//')) {
      throw new Error('Initial scripts and styles must be local build assets')
    }
    const pathname = decodeURIComponent(url.split(/[?#]/, 1)[0])
    if (
      pathname.includes('\\') ||
      pathname.includes('\0') ||
      pathname.split('/').includes('..')
    ) {
      throw new Error('Initial asset path traversal is not allowed')
    }
    const file = realpathSync(
      path.resolve(root, `.${pathname.startsWith('/') ? '' : '/'}${pathname}`)
    )
    const relative = path.relative(root, file)
    if (
      relative.startsWith('..') ||
      path.isAbsolute(relative) ||
      !statSync(file).isFile()
    ) {
      throw new Error('Initial assets must be files inside the build directory')
    }
    urls.add(file)
  }
  if (!hasScript || urls.size === 0) {
    throw new Error('No initial JavaScript build assets were found')
  }
  const assets = [...urls].map((file) => {
    const data = readFileSync(file)
    return {
      path: `/${path.relative(root, file).split(path.sep).join('/')}`,
      bytes: data.length,
      gzip_bytes: gzipSync(data, { level: 9 }).length,
    }
  })
  const totalGzip = assets.reduce((sum, asset) => sum + asset.gzip_bytes, 0)
  return {
    initial_assets: assets,
    largest_initial_assets: [...assets]
      .sort((left, right) => right.gzip_bytes - left.gzip_bytes)
      .slice(0, 10),
    total_initial_bytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
    total_initial_gzip_bytes: totalGzip,
    max_initial_gzip_bytes: maxGzipBytes,
    passed: totalGzip <= maxGzipBytes,
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const { values } = parseArgs({
      options: {
        dist: {
          type: 'string',
          default: fileURLToPath(new URL('../dist', import.meta.url)),
        },
        'max-gzip': { type: 'string', default: '1100000' },
        output: { type: 'string' },
      },
    })
    const report = measureInitialBundle(values.dist, Number(values['max-gzip']))
    const json = `${JSON.stringify(report, null, 2)}\n`
    if (values.output) writeFileSync(values.output, json)
    process.stdout.write(json)
    if (!report.passed) process.exitCode = 1
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : 'Unable to measure initial build assets'
    )
    process.exitCode = 1
  }
}
