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
import { Gift, HandCoins, LockKeyhole, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { getSelf } from '@/lib/api'
import { formatQuotaWithCurrency } from '@/lib/currency'
import {
  createServerError,
  requireServerSuccess,
} from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'
import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
} from '@/stores/system-config-store'

import { getTopupInfo } from '../api'
import { useAffiliate } from '../hooks/use-affiliate'
import type { UserWalletData } from '../types'
import { AffiliateDetails } from './affiliate-details'
import { AffiliateSummary } from './affiliate-summary'
import { TransferDialog } from './dialogs/transfer-dialog'

export function AffiliatePage() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const userId = useAuthStore((state) => state.auth.user?.id)
  const currency = useSystemConfigStore((state) => state.config.currency)
  const [transferOpen, setTransferOpen] = useState(false)
  const affiliate = useAffiliate()
  const userQuery = useQuery({
    queryKey: ['affiliate-user', userId],
    queryFn: async () => {
      const response = requireServerSuccess(await getSelf())
      if (!response.data) throw createServerError(response)
      return response.data as UserWalletData
    },
  })
  const configQuery = useQuery({
    queryKey: ['affiliate-compliance', userId],
    queryFn: async () => {
      const response = requireServerSuccess(await getTopupInfo())
      if (!response.data) throw createServerError(response)
      return response.data
    },
  })
  const minimumQuota = Math.ceil(
    currency.quotaPerUnit > 0
      ? currency.quotaPerUnit
      : DEFAULT_CURRENCY_CONFIG.quotaPerUnit
  )
  const complianceConfirmed =
    configQuery.isSuccess &&
    configQuery.data?.payment_compliance_confirmed !== false
  const canTransfer =
    !userQuery.isError &&
    complianceConfirmed &&
    (userQuery.data?.aff_quota ?? 0) >= minimumQuota

  return (
    <>
      <SectionPageLayout stackActionsOnMobile>
        <SectionPageLayout.Title>
          <span className='flex items-center gap-2'>
            <Gift className='size-5' aria-hidden='true' />
            {t('Referral Program')}
          </span>
        </SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <Button
            variant='outline'
            size='icon'
            aria-label={t('Refresh referral data')}
            disabled={userQuery.isFetching || affiliate.loading}
            onClick={() => {
              void userQuery.refetch()
              void configQuery.refetch()
              void affiliate.refetch()
            }}
          >
            <RefreshCw className='size-4' aria-hidden='true' />
          </Button>
          <Button
            disabled={!canTransfer || affiliate.transferring}
            onClick={() => setTransferOpen(true)}
          >
            <HandCoins className='size-4' aria-hidden='true' />
            {t('Transfer to Balance')}
          </Button>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <div className='space-y-5'>
            <AffiliateSummary
              user={userQuery.data}
              loading={userQuery.isPending}
            />
            {userQuery.isError ? (
              <ErrorState
                title={t('Unable to load your referral statistics')}
                onRetry={() => void userQuery.refetch()}
                className='rounded-2xl border'
              />
            ) : null}
            {configQuery.isError ? (
              <ErrorState
                title={t('Unable to verify reward transfer availability')}
                onRetry={() => void configQuery.refetch()}
                className='min-h-40 rounded-2xl border'
              />
            ) : null}
            {configQuery.data?.payment_compliance_confirmed === false ? (
              <Alert className='border-amber-200/60 bg-amber-50/60 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200'>
                <LockKeyhole aria-hidden='true' />
                <AlertDescription>
                  {t(
                    'Referral reward transfer is disabled until the administrator confirms compliance terms.'
                  )}
                </AlertDescription>
              </Alert>
            ) : null}
            <AffiliateDetails
              affiliateCode={affiliate.affiliateCode}
              affiliateLink={affiliate.affiliateLink}
              loading={affiliate.loading}
              onRetry={() => void affiliate.refetch()}
            />
            <p className='text-muted-foreground text-xs'>
              {t('Minimum:')}{' '}
              {formatQuotaWithCurrency(minimumQuota, { locale })}
            </p>
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>
      <TransferDialog
        open={transferOpen && canTransfer}
        onOpenChange={setTransferOpen}
        availableQuota={userQuery.data?.aff_quota ?? 0}
        transferring={affiliate.transferring}
        onConfirm={async (amount) => {
          if (!canTransfer || affiliate.transferring) return false
          const success = await affiliate.transferQuota(amount)
          if (success) await userQuery.refetch()
          return success
        }}
      />
    </>
  )
}
