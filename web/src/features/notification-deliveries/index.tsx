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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Send } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { ServerPagination } from '@/components/server-pagination'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useIsAdmin } from '@/hooks/use-admin'
import { toIntlLocale } from '@/i18n/languages'
import { getServerErrorMessage } from '@/lib/server-error-message'

import { getNotificationDeliveries, testNotificationDelivery } from './api'
import { deliveryStatusLabels } from './constants'

const errorLabels: Record<string, string> = {
  destination_missing: 'Notification destination is not configured',
  unsupported_method: 'Unsupported notification method',
  recipient_unavailable: 'Recipient is unavailable',
  delivery_failed: 'Provider did not accept the notification',
  rate_limited: 'Notification rate limit reached',
  alerts_disabled: 'Alerts were disabled before delivery',
  alerts_silenced: 'Alerts were silenced before delivery',
  invalid_payload: 'Notification metadata is invalid',
  delivery_interrupted: 'Delivery was interrupted',
}
const kindLabels: Record<string, string> = {
  availability_fault: 'Availability incident',
  availability_recovery: 'Availability recovery',
  support_ticket_reply: 'Support ticket reply',
  test: 'Test notification',
}

export function NotificationDeliveriesPanel() {
  const admin = useIsAdmin()
  if (!admin) return null
  return <DeliveryPanelContent />
}
function DeliveryPanelContent() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const client = useQueryClient()
  const query = useQuery({
    queryKey: ['notification-deliveries', status, page],
    queryFn: () => getNotificationDeliveries(status, page),
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
    retry: false,
  })
  const test = useMutation({
    mutationFn: testNotificationDelivery,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['notification-deliveries'] })
    },
  })
  const items = query.data?.items ?? []
  const filters = [
    { value: 'all', label: t('All delivery statuses') },
    ...Object.entries(deliveryStatusLabels)
      .filter(([value]) => value !== 'not_requested')
      .map(([value, label]) => ({ value, label: t(label) })),
  ]
  function date(value: number) {
    return value ? new Date(value * 1000).toLocaleString(locale) : '—'
  }
  return (
    <section
      aria-label={t('Notification delivery records')}
      className='mt-6 space-y-4 rounded-2xl border p-4 sm:p-5'
    >
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <h3 className='font-semibold'>{t('Notification delivery records')}</h3>
        <div className='flex flex-wrap gap-2'>
          <Button
            variant='outline'
            size='icon'
            aria-label={t('Refresh deliveries')}
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw className='size-4' />
          </Button>
          <Button
            variant='outline'
            disabled={test.isPending}
            onClick={() => test.mutate()}
          >
            <Send className='size-4' />
            {t('Send test notification')}
          </Button>
        </div>
      </div>
      <p className='text-muted-foreground text-xs'>
        {t(
          'Incident records and notification delivery are separate. Provider accepted does not mean the recipient has read it. Tests use your current notification settings and are limited to one per minute.'
        )}
      </p>
      <Select
        items={filters}
        value={status}
        onValueChange={(value) => {
          if (value) {
            setStatus(value)
            setPage(1)
          }
        }}
      >
        <SelectTrigger
          aria-label={t('Delivery status')}
          className='w-full sm:w-56'
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {filters.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {test.isError && (
        <Alert variant='destructive'>
          <AlertDescription>
            {getServerErrorMessage(
              test.error,
              t('Unable to queue test notification')
            )}
          </AlertDescription>
        </Alert>
      )}
      {test.data && (
        <Alert>
          <AlertDescription>
            {t('Test notification recorded')}:{' '}
            {t(deliveryStatusLabels[test.data.status] || test.data.status)}
          </AlertDescription>
        </Alert>
      )}
      {query.isPending && <LoadingState />}
      {query.isError && (
        <ErrorState
          title={t('Unable to load notification deliveries')}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.data &&
        (items.length ? (
          <StaticDataTable
            data={items}
            getRowKey={(item) => item.id}
            tableProps={{ 'aria-label': t('Notification delivery records') }}
            columns={[
              {
                id: 'event',
                header: t('Event'),
                cell: (item) => (
                  <span>
                    {t(kindLabels[item.kind] || item.kind)} #{item.id}
                  </span>
                ),
              },
              {
                id: 'recipient',
                header: t('Recipient'),
                cell: (item) => `#${item.recipient_id}`,
              },
              {
                id: 'channel',
                header: t('Notification method'),
                cell: (item) => item.channel || '—',
              },
              {
                id: 'incident',
                header: t('Incident'),
                cell: (item) =>
                  item.incident_id ? `#${item.incident_id}` : '—',
              },
              {
                id: 'status',
                header: t('Delivery status'),
                cell: (item) => (
                  <Badge
                    variant={
                      item.status === 'failed' ? 'destructive' : 'secondary'
                    }
                  >
                    {t(deliveryStatusLabels[item.status] || item.status)}
                  </Badge>
                ),
              },
              {
                id: 'attempts',
                header: t('Attempts'),
                cell: (item) => `${item.attempts}/${item.max_attempts}`,
              },
              {
                id: 'updated',
                header: t('Updated'),
                cell: (item) => date(item.updated_at),
              },
              {
                id: 'retry',
                header: t('Next attempt'),
                cell: (item) =>
                  item.status === 'pending' || item.status === 'retry'
                    ? date(item.next_attempt_at)
                    : '—',
              },
              {
                id: 'reason',
                header: t('Delivery result'),
                cell: (item) =>
                  item.last_error_code
                    ? t(errorLabels[item.last_error_code] || 'Delivery failed')
                    : '—',
              },
            ]}
          />
        ) : (
          <EmptyState
            title={t('No notification deliveries')}
            className='min-h-32'
          />
        ))}
      {query.data && (
        <ServerPagination
          items={items}
          page={query.data.page}
          pageSize={query.data.page_size}
          total={query.data.total}
          disabled={query.isFetching}
          onPageChange={setPage}
        />
      )}
    </section>
  )
}
