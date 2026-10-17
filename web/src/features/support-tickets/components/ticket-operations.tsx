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
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  getSupportAssignees,
  type SupportTicket,
  type SupportPriority,
  type TicketChange,
} from '../api'
import { ticketPriorityLabels } from '../constants'

export function TicketOperations(props: {
  ticket: SupportTicket
  admin: boolean
  pending: boolean
  onChange: (change: TicketChange) => void
}) {
  const { t } = useTranslation()
  const agents = useQuery({
    queryKey: ['support-ticket-assignees'],
    queryFn: getSupportAssignees,
    enabled: props.admin,
    staleTime: 60000,
    retry: false,
  })
  const priority = props.ticket.priority || 'normal'
  const assigned = props.ticket.assigned_to_id || 0
  const agentItems = [
    { value: '0', label: t('Unassigned') },
    ...(agents.data?.items ?? []).map((agent) => ({
      value: String(agent.id),
      label: agent.display_name || agent.username,
    })),
  ]
  if (
    assigned > 0 &&
    !agentItems.some((item) => item.value === String(assigned))
  ) {
    agentItems.push({
      value: String(assigned),
      label: props.ticket.assigned_to_name || `#${assigned}`,
    })
  }
  const priorities = Object.entries(ticketPriorityLabels).map(
    ([value, key]) => ({ value, label: t(key) })
  )
  if (!props.admin) {
    return (
      <div className='flex flex-wrap items-center gap-3 text-sm'>
        <span>
          {t('Assignee')}: {props.ticket.assigned_to_name || t('Unassigned')}
        </span>
        <Badge variant='secondary'>{t(ticketPriorityLabels[priority])}</Badge>
      </div>
    )
  }
  return (
    <div className='grid grid-cols-1 gap-3 rounded-xl border p-3 sm:grid-cols-2'>
      <div className='space-y-2'>
        <Label>{t('Assignee')}</Label>
        <Select
          items={agentItems}
          value={String(assigned)}
          disabled={props.pending || agents.isPending || agents.isError}
          onValueChange={(value) => {
            if (value !== null) {
              props.onChange({ assigned_to_id: Number(value) })
            }
          }}
        >
          <SelectTrigger aria-label={t('Ticket assignee')} className='w-full'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {agentItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {agents.isError && (
          <p role='alert' className='text-destructive text-xs'>
            {t('Unable to load support assignees')}
          </p>
        )}
      </div>
      <div className='space-y-2'>
        <Label>{t('Priority')}</Label>
        <Select
          items={priorities}
          value={priority}
          disabled={props.pending}
          onValueChange={(value) => {
            if (value) props.onChange({ priority: value as SupportPriority })
          }}
        >
          <SelectTrigger aria-label={t('Ticket priority')} className='w-full'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {priorities.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
