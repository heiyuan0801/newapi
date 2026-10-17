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
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import {
  getWalletReconciliation,
  type ReconciliationReport,
} from '../report-api'

export function WalletReconciliationReport() {
  const { t } = useTranslation()
  const userID = useAuthStore((state) => state.auth.user?.id)
  const currentMonth = new Date().toISOString().slice(0, 7)
  const [draftMonth, setDraftMonth] = useState(currentMonth)
  const [month, setMonth] = useState(currentMonth)
  const validMonth =
    /^\d{4}-(0[1-9]|1[0-2])$/.test(draftMonth) &&
    draftMonth >= '2000-01' &&
    draftMonth <= currentMonth
  const query = useQuery({
    queryKey: ['wallet-reconciliation', userID, month],
    queryFn: () => getWalletReconciliation(month, 'all', ''),
    enabled: Boolean(userID),
    retry: false,
    staleTime: 30_000,
    meta: { errorToast: false },
  })
  const report = query.data
  return (
    <section
      aria-label={t('Wallet source reconciliation')}
      className='bg-card border-border/70 min-w-0 rounded-2xl border'
    >
      <div className='flex flex-wrap items-center justify-between gap-3 border-b p-4 sm:p-5'>
        <div className='min-w-0'>
          <h2 className='font-semibold'>{t('Wallet source reconciliation')}</h2>
          <p className='text-muted-foreground mt-1 text-xs'>
            {t(
              'Compare recorded sources by UTC month without changing account balances.'
            )}
          </p>
        </div>
        <div className='flex w-full flex-wrap items-center gap-2 sm:w-auto'>
          <Input
            type='month'
            aria-label={t('Reconciliation month (UTC)')}
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
              else setMonth(draftMonth)
            }}
          >
            <RefreshCw aria-hidden className='size-4' />
            {t('Query')}
          </Button>
        </div>
      </div>
      {!validMonth && (
        <p role='alert' className='text-destructive px-5 pt-3 text-sm'>
          {t('Choose a valid month up to the current UTC month.')}
        </p>
      )}
      {query.isPending && <LoadingState />}
      {query.isError && !report && (
        <ErrorState
          title={t('Unable to load wallet reconciliation')}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.isError && report && (
        <Alert className='m-4 w-auto'>
          <AlertDescription>
            {t(
              'Unable to refresh reconciliation. Showing the last loaded records.'
            )}
          </AlertDescription>
        </Alert>
      )}
      {report && (
        <div className='min-w-0 space-y-4 p-4 sm:p-5'>
          <p className='text-muted-foreground text-xs'>
            {t('Report month: {{month}} (UTC)', { month: report.month })}
          </p>
          <ReconciliationSummary report={report} />
          <SourceCoverage report={report} />
        </div>
      )}
    </section>
  )
}

function ReconciliationSummary(props: { report: ReconciliationReport }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  useSystemConfigStore((state) => state.config.currency)
  const summary = props.report.summary
  const metrics = [
    [
      t('Logged consumption'),
      formatQuotaWithCurrency(summary.consume_quota, { locale }),
    ],
    [
      t('Logged refunds'),
      formatQuotaWithCurrency(summary.refund_quota, { locale }),
    ],
    [
      t('Net logged usage'),
      formatQuotaWithCurrency(summary.net_log_quota, { locale }),
    ],
    [
      t('Collected usage'),
      formatQuotaWithCurrency(summary.collected_quota, { locale }),
    ],
    [
      t('Source difference'),
      formatQuotaWithCurrency(summary.collection_difference, { locale }),
    ],
    [
      t('Completed top-up orders'),
      formatNumber(summary.completed_topups, locale),
    ],
    [
      t('Recorded redemption quota'),
      formatQuotaWithCurrency(summary.redemption_quota, { locale }),
    ],
    [
      t('Recorded referral rewards'),
      formatQuotaWithCurrency(summary.reward_quota, { locale }),
    ],
  ]
  return (
    <dl
      aria-label={t('Reconciliation summary')}
      className='grid min-w-0 grid-cols-2 gap-4 lg:grid-cols-4'
    >
      {metrics.map(([label, value]) => (
        <div key={label} className='min-w-0'>
          <dt className='text-muted-foreground text-xs'>{label}</dt>
          <dd className='mt-2 text-xl font-semibold break-all tabular-nums'>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function SourceCoverage(props: { report: ReconciliationReport }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const coverage = props.report.coverage
  const descriptions: Record<string, string> = {
    logs_may_be_retained_or_disabled: t(
      'Logs can be disabled or removed by retention, so historical records may be missing.'
    ),
    collected_usage_may_lag: t(
      'Collected usage is asynchronous and can lag behind request logs.'
    ),
    historical_topup_credit_unknown: t(
      'Older top-up orders do not record credited quota consistently; their amounts are not reconstructed.'
    ),
    historical_rewards_untracked: t(
      'Detailed referral rewards only cover rewards recorded after the feature was introduced.'
    ),
    wallet_adjustments_not_fully_covered: t(
      'Manual balance changes are not fully covered; redemption records may have been edited after use.'
    ),
    funding_sources_mixed: t(
      'Consumption and refund logs may include wallet and subscription funding.'
    ),
    non_atomic_cross_database_snapshot: t(
      'Main and log databases are read separately; active requests may change the sources during this report.'
    ),
    pending_tasks_and_reservations_not_reconciled: t(
      'Pending tasks and in-flight reservations are not reconciled as final wallet movements.'
    ),
    legacy_log_events_without_identifiers: t(
      'Older log rows without stable IDs are included in summary amounts but cannot be paged reliably.'
    ),
  }
  return (
    <Alert>
      <AlertDescription className='space-y-3'>
        <p>
          {t(
            'This is a recorded-source comparison, not a complete settlement ledger.'
          )}
        </p>
        <p>
          {t(
            'Source difference is collected usage minus logged consumption. Refunds are listed separately.'
          )}
        </p>
        <p>
          {t(
            'Source differences can reflect retention or collection delays. They do not prove a wallet balance error.'
          )}
        </p>
        {(coverage.unlinked_log_events ?? 0) > 0 && (
          <p>
            {t(
              'Older logs without stable identifiers: {{records}}. Their amounts are included in totals; their events are omitted from pagination.',
              { records: formatNumber(coverage.unlinked_log_events, locale) }
            )}
          </p>
        )}
        <Collapsible>
          <CollapsibleTrigger
            render={
              <Button variant='ghost' size='sm' className='group h-auto px-0' />
            }
          >
            {t('Source coverage and limitations')}
            <ChevronDown
              aria-hidden
              className='size-4 transition-transform group-aria-expanded:rotate-180'
            />
          </CollapsibleTrigger>
          <CollapsibleContent className='space-y-2 pt-2'>
            <p>
              {coverage.consume_logs_enabled
                ? t('Consumption logging is currently enabled.')
                : t('Consumption logging is currently disabled.')}
            </p>
            <p>
              {coverage.collection_enabled
                ? t(
                    'Collection is enabled. Updates may take {{minutes}} minutes; periods with collection disabled are missing.',
                    { minutes: coverage.flush_interval_minutes }
                  )
                : t(
                    'Usage collection is disabled. Only previously collected usage is shown.'
                  )}
            </p>
            <ul className='list-disc space-y-1 pl-5'>
              {coverage.limitations.map((code) => (
                <li key={code}>
                  {descriptions[code] ??
                    t('Additional source limitations apply.')}
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      </AlertDescription>
    </Alert>
  )
}
