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

import { toIntlLocale } from '@/i18n/languages'

import type { TicketEvent, SupportStatus, SupportPriority } from '../api'
import { supportStatusLabels, ticketPriorityLabels } from '../constants'
import { TicketPagination } from './ticket-pagination'

export function TicketTimeline(props: {
  events: TicketEvent[]
  total: number
  page: number
  pending: boolean
  onPageChange: (page: number) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const names: Record<string, string> = {
    created: 'Ticket created',
    status: 'Status changed',
    priority: 'Priority changed',
    assigned: 'Assignee changed',
    reply: 'Reply added',
  }
  function value(event: TicketEvent) {
    if (event.kind === 'status') {
      return t(
        supportStatusLabels[event.new_value as SupportStatus] || event.new_value
      )
    }
    if (event.kind === 'priority') {
      return t(
        ticketPriorityLabels[event.new_value as SupportPriority] ||
          event.new_value
      )
    }
    if (event.kind === 'assigned') {
      return event.new_value === '0' ? t('Unassigned') : `#${event.new_value}`
    }
    return ''
  }
  return (
    <section
      className='space-y-3 rounded-xl border p-3'
      aria-label={t('Processing timeline')}
    >
      <h3 className='text-sm font-semibold'>{t('Processing timeline')}</h3>
      {props.events.length === 0 && (
        <p className='text-muted-foreground text-xs'>
          {t('Earlier ticket activity was not recorded in the timeline.')}
        </p>
      )}
      <ol className='space-y-3'>
        {props.events.map((event) => (
          <li key={event.id} className='border-s-2 ps-3 text-xs'>
            <p className='font-medium'>
              {t(names[event.kind] || 'Ticket updated')} {value(event)}
            </p>
            <p className='text-muted-foreground mt-1'>
              {event.actor_type === 'support'
                ? t('Support team')
                : t('Account owner')}{' '}
              ·{' '}
              <time dateTime={new Date(event.created_at * 1000).toISOString()}>
                {new Date(event.created_at * 1000).toLocaleString(locale)}
              </time>
            </p>
          </li>
        ))}
      </ol>
      <TicketPagination
        items={props.events}
        page={props.page}
        total={props.total}
        disabled={props.pending}
        onPageChange={props.onPageChange}
      />
    </section>
  )
}
