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
import { useMutation, useQuery } from '@tanstack/react-query'
import { Download, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { downloadBlob } from '@/features/usage-logs/lib/export'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import {
  getServerErrorMessage,
  requireServerSuccess,
} from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import {
  exportMonthlyWalletReport,
  getMonthlyWalletReport,
} from '../report-api'

export function MonthlyUsageReport() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  useSystemConfigStore((state) => state.config.currency)
  const userID = useAuthStore((state) => state.auth.user?.id)
  const currentMonth = new Date().toISOString().slice(0, 7)
  const [month, setMonth] = useState(currentMonth)
  const exportController = useRef<AbortController | null>(null)
  useEffect(() => () => exportController.current?.abort(), [])
  const exporting = useMutation({
    mutationFn: async (exportMonth: string) => {
      exportController.current = new AbortController()
      return exportMonthlyWalletReport(
        exportMonth,
        exportController.current.signal
      )
    },
    onSuccess: (blob, exportMonth) =>
      downloadBlob(`monthly-usage-${exportMonth}.csv`, blob),
    onSettled: () => {
      exportController.current = null
    },
    meta: { errorToast: false },
  })
  const [draftMonth, setDraftMonth] = useState(currentMonth)
  const validMonth =
    /^\d{4}-(0[1-9]|1[0-2])$/.test(draftMonth) &&
    draftMonth >= '2000-01' &&
    draftMonth <= currentMonth
  const query = useQuery({
    queryKey: ['monthly-wallet-report', userID, month],
    queryFn: async () =>
      requireServerSuccess(await getMonthlyWalletReport(month)),
    retry: false,
    staleTime: 60_000,
    meta: { errorToast: false },
  })
  const report = query.data?.data
  const canExport =
    report &&
    validMonth &&
    draftMonth === month &&
    !query.isFetching &&
    !query.isError &&
    !report.truncated &&
    !exporting.isPending

  return (
    <section
      aria-label={t('Monthly usage report')}
      className='bg-card border-border/70 min-w-0 rounded-2xl border'
    >
      <div className='flex flex-wrap items-center justify-between gap-3 border-b p-4 sm:p-5'>
        <div className='min-w-0'>
          <h2 className='font-semibold'>{t('Monthly usage report')}</h2>
          <p className='text-muted-foreground mt-1 text-xs'>
            {t(
              'Calendar months use UTC. Usage is grouped by model, group and API token.'
            )}
          </p>
        </div>
        <div className='flex w-full flex-wrap items-center gap-2 sm:w-auto'>
          <Input
            type='month'
            aria-label={t('Month (UTC)')}
            min='2000-01'
            max={currentMonth}
            value={draftMonth}
            onChange={(event) => setDraftMonth(event.target.value)}
            className='w-full min-w-0 flex-1 sm:w-40 sm:flex-none'
          />
          <Button
            variant='outline'
            disabled={!validMonth || query.isFetching}
            onClick={() => {
              if (draftMonth === month) void query.refetch()
              else {
                setMonth(draftMonth)
              }
            }}
          >
            <RefreshCw aria-hidden className='size-4' />
            {t('Query')}
          </Button>
          <Button
            variant='outline'
            disabled={!canExport}
            onClick={() => {
              if (canExport) exporting.mutate(month)
            }}
          >
            <Download aria-hidden className='size-4' />
            {exporting.isPending ? t('Exporting...') : t('Export CSV')}
          </Button>
        </div>
      </div>
      {exporting.isError && (
        <Alert variant='destructive' className='m-4 w-auto'>
          <AlertDescription>
            {getServerErrorMessage(
              exporting.error,
              t('Unable to export monthly usage report')
            )}
          </AlertDescription>
        </Alert>
      )}
      {!validMonth && (
        <p role='alert' className='text-destructive px-5 pt-3 text-sm'>
          {t('Choose a valid month up to the current UTC month.')}
        </p>
      )}
      {query.isPending && <LoadingState />}
      {query.isError && !report && (
        <ErrorState
          title={t('Unable to load monthly usage report')}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.isError && report && (
        <Alert className='m-4 w-auto'>
          <AlertDescription>
            {t(
              'Unable to refresh this report. Export is disabled until it refreshes successfully.'
            )}
          </AlertDescription>
        </Alert>
      )}
      {report && (
        <div className='space-y-4 p-4 sm:p-5'>
          <p className='text-muted-foreground text-xs'>
            {t('Report month: {{month}} (UTC)', { month: report.month })}
          </p>
          <dl
            aria-label={t('Monthly usage summary')}
            className='grid min-w-0 grid-cols-2 gap-4 lg:grid-cols-4'
          >
            {[
              [
                t('Collected usage'),
                formatQuotaWithCurrency(report.summary.quota, { locale }),
              ],
              [t('Requests'), formatNumber(report.summary.count, locale)],
              [t('Tokens'), formatNumber(report.summary.token_used, locale)],
              [
                t('Completed top-up orders'),
                formatNumber(report.completed_topups, locale),
              ],
            ].map(([label, value]) => (
              <div key={label} className='min-w-0'>
                <dt className='text-muted-foreground text-xs'>{label}</dt>
                <dd className='mt-2 text-xl font-semibold break-all tabular-nums'>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <p className='text-muted-foreground text-xs'>
            {t(
              'Payment amounts and credited units vary by provider and are not summed.'
            )}
          </p>
          <Alert>
            <AlertDescription className='space-y-1'>
              <p>
                {t(
                  'Collected usage may be delayed or incomplete. This report is not a settlement ledger.'
                )}
              </p>
              <p>
                {report.collection_enabled
                  ? t(
                      'Collection is enabled. Updates may take {{minutes}} minutes; periods with collection disabled are missing.',
                      { minutes: report.flush_interval_minutes }
                    )
                  : t(
                      'Usage collection is disabled. Only previously collected usage is shown.'
                    )}
              </p>
              <p>
                {t(
                  'Refunds and manual balance adjustments are not included in collected usage.'
                )}
              </p>
            </AlertDescription>
          </Alert>
          {report.truncated && (
            <Alert>
              <AlertDescription>
                {t(
                  'More than {{count}} usage groups exist. This view is truncated and CSV export is disabled.',
                  { count: report.row_limit }
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </section>
  )
}
