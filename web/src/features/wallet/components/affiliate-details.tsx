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
import { Gift, Link2, Share2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface AffiliateDetailsProps {
  affiliateCode: string
  affiliateLink: string
  loading: boolean
  onRetry: () => void
}

export function AffiliateDetails(props: AffiliateDetailsProps) {
  const { t } = useTranslation()

  if (props.loading) {
    return (
      <section
        aria-label={t('Referral Link')}
        aria-busy
        className='bg-card border-border/70 rounded-2xl border p-5'
      >
        <LoadingState />
      </section>
    )
  }

  if (!props.affiliateLink || !props.affiliateCode) {
    return (
      <section className='bg-card border-border/70 rounded-2xl border p-5'>
        <ErrorState
          title={t('Unable to load your referral link')}
          onRetry={props.onRetry}
        />
      </section>
    )
  }

  return (
    <section
      aria-label={t('Referral details')}
      className='bg-card border-border/70 min-w-0 rounded-2xl border p-4 sm:p-6'
    >
      <Tabs defaultValue='link' className='gap-7'>
        <TabsList className='bg-background h-9 rounded-full border p-1'>
          <TabsTrigger
            value='link'
            className='data-active:bg-foreground data-active:text-background rounded-full px-3'
          >
            <Link2 aria-hidden='true' />
            {t('Referral Link')}
          </TabsTrigger>
          <TabsTrigger
            value='rules'
            className='data-active:bg-foreground data-active:text-background rounded-full px-3'
          >
            <Gift aria-hidden='true' />
            {t('Reward rules')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value='link' className='min-w-0'>
          <div className='grid min-w-0 gap-7 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-10'>
            <div className='min-w-0 space-y-5'>
              <div className='space-y-2'>
                <Label htmlFor='affiliate-link'>{t('Referral Link')}</Label>
                <div className='flex min-w-0 items-center gap-2'>
                  <Input
                    id='affiliate-link'
                    value={props.affiliateLink}
                    readOnly
                    className='bg-muted/25 min-w-0 font-mono text-xs sm:text-sm'
                  />
                  <CopyButton
                    value={props.affiliateLink}
                    variant='outline'
                    className='size-9'
                    tooltip={t('Copy referral link')}
                  />
                </div>
              </div>
              <div className='flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-sm'>
                <span className='text-muted-foreground'>
                  {t('Referral code')}
                </span>
                <code className='bg-muted/40 max-w-full rounded-md px-2.5 py-1.5 break-all'>
                  {props.affiliateCode}
                </code>
                <CopyButton
                  value={props.affiliateCode}
                  className='size-8'
                  tooltip={t('Copy referral code')}
                />
              </div>
            </div>
            <div className='min-w-0 space-y-3'>
              <h3 className='flex items-center gap-2 font-semibold'>
                <Share2 className='size-4' aria-hidden='true' />
                {t('Invite friends')}
              </h3>
              <p className='text-muted-foreground text-sm leading-7'>
                {t(
                  'Share your referral link with friends. Their registrations will be linked to your account.'
                )}
              </p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value='rules'>
          <div className='max-w-3xl space-y-4'>
            <h3 className='font-semibold'>{t('Reward rules')}</h3>
            <ol className='text-muted-foreground list-decimal space-y-3 ps-5 text-sm leading-7'>
              <li>
                {t(
                  'Friends must register through your referral link to count as your invitations.'
                )}
              </li>
              <li>
                {t('Referral rewards are configured by the administrator.')}
              </li>
              <li>
                {t(
                  'Available rewards can be transferred to your account balance after reaching the minimum transfer amount.'
                )}
              </li>
            </ol>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  )
}
