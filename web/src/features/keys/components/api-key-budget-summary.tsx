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
import { useTranslation } from 'react-i18next'

import { QuotaDetailsPopover } from '@/components/quota-details-popover'
import { StatusBadge } from '@/components/status-badge'
import { Progress } from '@/components/ui/progress'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'

import type { ApiKey } from '../types'

export function ApiKeyBudgetSummary(props: { apiKey: ApiKey }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const periods = [
    {
      label: t('Daily budget'),
      limit: props.apiKey.daily_budget ?? 0,
      used: props.apiKey.daily_budget_used ?? 0,
    },
    {
      label: t('Monthly budget'),
      limit: props.apiKey.monthly_budget ?? 0,
      used: props.apiKey.monthly_budget_used ?? 0,
    },
  ].filter((period) => period.limit > 0)
  if (periods.length === 0) return null
  const paused = props.apiKey.budget_paused === true
  const percentage = Math.min(
    100,
    Math.max(...periods.map((period) => (period.used / period.limit) * 100))
  )

  return (
    <QuotaDetailsPopover
      title={t('Spending budgets')}
      triggerLabel={t('View spending budgets')}
      details={periods.map((period) => ({
        label: period.label,
        value: `${formatQuotaWithCurrency(period.used, { locale })} / ${formatQuotaWithCurrency(period.limit, { locale })}`,
      }))}
      description={t(
        'Daily resets at 00:00 UTC; monthly resets on the first day at 00:00 UTC. Usage includes in-flight reservations.'
      )}
      className='mt-2 space-y-1'
      afterTrigger={
        <Progress
          value={percentage}
          aria-label={t('Budget usage')}
          className={
            paused
              ? '[&_[data-slot=progress-indicator]]:bg-destructive'
              : undefined
          }
        />
      }
    >
      <span className='flex w-full min-w-0 flex-wrap items-center gap-1.5 text-xs'>
        <span className='text-muted-foreground'>{t('Budget')}</span>
        <StatusBadge variant={paused ? 'danger' : 'neutral'} size='sm'>
          {paused ? t('Budget paused') : t('Active')}
        </StatusBadge>
      </span>
    </QuotaDetailsPopover>
  )
}
