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
import { Link } from '@tanstack/react-router'
import { Activity, Bell, Clock, Settings2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useIsAdmin } from '@/hooks/use-admin'
import { toIntlLocale } from '@/i18n/languages'

import type { AvailabilityMonitorResponse, AvailabilitySource } from '../api'

export function AvailabilityMonitorStatus(props: {
  source: AvailabilitySource
  data: AvailabilityMonitorResponse['data'] | undefined
  failed: boolean
  onSourceChange: (source: AvailabilitySource) => void
}) {
  const { t, i18n } = useTranslation()
  const isAdmin = useIsAdmin()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const lastProbe = props.data?.last_probe_at
  let checkedAt = t('Not checked yet')
  if (lastProbe && Number.isFinite(lastProbe)) {
    checkedAt = new Date(lastProbe * 1000).toLocaleString(locale, {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  return (
    <div className='min-w-0 space-y-3'>
      <div className='flex min-w-0 flex-wrap items-center justify-between gap-3'>
        <Tabs
          value={props.source}
          onValueChange={(value) =>
            props.onSourceChange(value === 'probe' ? 'probe' : 'real')
          }
        >
          <TabsList
            aria-label={t('Availability data source')}
            className='bg-background rounded-full border p-1 group-data-horizontal/tabs:h-9'
          >
            <TabsTrigger
              value='real'
              className='data-active:bg-foreground data-active:text-background rounded-full px-3 text-xs'
            >
              {t('Real requests')}
            </TabsTrigger>
            <TabsTrigger
              value='probe'
              className='data-active:bg-foreground data-active:text-background rounded-full px-3 text-xs'
            >
              {t('Active probes')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {isAdmin && (
          <Button
            variant='outline'
            size='sm'
            className='gap-2 rounded-lg'
            render={
              <Link
                to='/system-settings/operations/$section'
                params={{ section: 'availability' }}
              />
            }
          >
            <Settings2 aria-hidden className='size-3.5' />
            {t('Monitoring settings')}
          </Button>
        )}
      </div>
      {props.data && (
        <div
          className='text-muted-foreground flex min-w-0 flex-wrap gap-x-5 gap-y-2 text-xs'
          aria-label={t('Monitoring status')}
        >
          <span className='inline-flex items-center gap-1.5'>
            <Activity aria-hidden className='size-3.5' />
            {props.data.probe_enabled
              ? t('Probes enabled')
              : t('Probes disabled')}
            {props.data.running && props.data.probe_enabled && (
              <span>· {t('Checking now')}</span>
            )}
          </span>
          <span className='inline-flex items-center gap-1.5'>
            <Bell aria-hidden className='size-3.5' />
            {props.data.alerts_enabled
              ? t('Alerts enabled')
              : t('Alerts disabled')}
          </span>
          <span className='inline-flex items-center gap-1.5'>
            <Clock aria-hidden className='size-3.5' />
            {t('Last probe')}: {checkedAt}
          </span>
        </div>
      )}
      {props.failed && (
        <Alert>
          <AlertDescription>
            {t(
              'Monitoring status is temporarily unavailable. Request statistics are still shown separately.'
            )}
          </AlertDescription>
        </Alert>
      )}
      {props.source === 'probe' && props.data && !props.data.probe_enabled && (
        <Alert>
          <AlertTitle>{t('Active probes are disabled')}</AlertTitle>
          <AlertDescription>
            {t(
              'An administrator can enable probes in monitoring settings. Existing probe history is retained; missing samples stay gray.'
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
