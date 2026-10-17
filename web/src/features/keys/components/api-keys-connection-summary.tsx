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
import { CircleDollarSign, MessageSquareMore, Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { toIntlLocale } from '@/i18n/languages'
import { getSelf } from '@/lib/api'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'
import type { AuthUser } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { ApiKeysAddresses } from './api-keys-primary-buttons'
import { useApiKeys } from './api-keys-provider'

export function ApiKeysConnectionSummary() {
  const { t, i18n } = useTranslation()
  const { refreshTrigger } = useApiKeys()
  useSystemConfigStore((state) => state.config.currency)
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const { data: user } = useQuery({
    queryKey: ['keys-account-summary', refreshTrigger],
    queryFn: async () => requireServerSuccess(await getSelf()).data as AuthUser,
  })
  const stats = [
    {
      label: t('Account balance'),
      value: formatQuotaWithCurrency(user?.quota, { locale }),
      icon: Wallet,
    },
    {
      label: t('Total consumption'),
      value: formatQuotaWithCurrency(user?.used_quota, { locale }),
      icon: CircleDollarSign,
    },
    {
      label: t('Request count'),
      value:
        user?.request_count == null
          ? '-'
          : formatNumber(user.request_count, locale),
      icon: MessageSquareMore,
    },
  ]

  return (
    <section
      aria-label={t('API connection information')}
      className='bg-card border-border/70 flex min-w-0 flex-col justify-between gap-6 rounded-2xl border p-4 sm:p-5 lg:flex-row lg:items-center'
    >
      <div className='min-w-0 space-y-2 lg:max-w-[50%]'>
        <h3 className='text-sm font-semibold'>BaseURL</h3>
        <ApiKeysAddresses inline />
      </div>
      <dl className='grid grid-cols-3 gap-3 sm:gap-7 lg:gap-9'>
        {stats.map((stat) => (
          <div key={stat.label} className='flex min-w-0 items-center gap-2.5'>
            <span className='border-border/60 text-muted-foreground hidden size-10 shrink-0 items-center justify-center rounded-full border shadow-xs sm:flex'>
              <stat.icon className='size-5' aria-hidden='true' />
            </span>
            <div className='min-w-0'>
              <dt className='text-muted-foreground truncate text-xs'>
                {stat.label}
              </dt>
              <dd className='mt-1 truncate text-sm font-semibold tabular-nums'>
                {stat.value}
              </dd>
            </div>
          </div>
        ))}
      </dl>
    </section>
  )
}
