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
import { toCsvLine } from '@/features/usage-logs/lib/export'

import type { MonthlyWalletReport } from '../report-api'

type Translate = (key: string) => string

/** Preserve quota units and the collection limits in every exported row. */
export function buildMonthlyReportCsv(
  report: MonthlyWalletReport,
  t: Translate
): string[] {
  const start = new Date(report.window_start * 1000).toISOString()
  const end = new Date(report.window_end * 1000).toISOString()
  const context = [
    report.month,
    start,
    end,
    report.source,
    t(report.collection_enabled ? 'Yes' : 'No'),
  ]
  const suffix = [
    t(
      'Collected usage may be delayed or incomplete. This report is not a settlement ledger.'
    ),
  ]
  return [
    toCsvLine([
      t('Month (UTC)'),
      t('Start (UTC)'),
      t('End (UTC, exclusive)'),
      t('Source'),
      t('Collection enabled'),
      t('Record'),
      t('Model'),
      t('Group'),
      t('Token ID'),
      t('Token'),
      t('Requests'),
      t('Tokens'),
      t('Quota units'),
      t('Completed top-up orders'),
      t('Notes'),
    ]),
    toCsvLine([
      ...context,
      t('Summary'),
      '',
      '',
      '',
      '',
      String(report.summary.count),
      String(report.summary.token_used),
      String(report.summary.quota),
      '',
      ...suffix,
    ]),
    toCsvLine([
      ...context,
      t('Completed top-up orders'),
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      String(report.completed_topups),
      ...suffix,
    ]),
    ...report.rows.map((row) =>
      toCsvLine([
        ...context,
        t('Collected usage'),
        row.model_name,
        row.use_group,
        String(row.token_id),
        row.token_name,
        String(row.count),
        String(row.token_used),
        String(row.quota),
        '',
        ...suffix,
      ])
    ),
  ]
}
