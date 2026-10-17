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
import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

export type SupportStatus = 'open' | 'in_progress' | 'awaiting_user' | 'closed'
export type SupportTicket = {
  id: number
  user_id: number
  title: string
  status: SupportStatus
  reference_type: '' | 'request' | 'order'
  reference_id: string
  model_name: string
  group_name: string
  reference_status: string
  reference_created_at: number
  created_at: number
  updated_at: number
}
export type SupportMessage = {
  id: number
  ticket_id: number
  author_type: 'user' | 'support'
  body: string
  created_at: number
}
type Envelope<T> = { success: boolean; message?: string; data: T }
export type TicketList = {
  items: SupportTicket[]
  total: number
  page: number
  page_size: number
}
export type TicketDetail = {
  ticket: SupportTicket
  messages: SupportMessage[]
  total: number
  page: number
  page_size: number
}
export type TicketDraft = {
  title: string
  body: string
  reference_type: string
  reference_id: string
}

export async function listSupportTickets(params: {
  scope: 'mine' | 'all'
  status: SupportStatus | 'all'
  page: number
  page_size: number
}) {
  return requireServerSuccess(
    (await api.get<Envelope<TicketList>>('/api/support-tickets', { params }))
      .data
  ).data
}
export async function getSupportTicket(id: number, page: number) {
  return requireServerSuccess(
    (
      await api.get<Envelope<TicketDetail>>(`/api/support-tickets/${id}`, {
        params: { page, page_size: 20 },
      })
    ).data
  ).data
}
export async function createSupportTicket(draft: TicketDraft) {
  return requireServerSuccess(
    (await api.post<Envelope<SupportTicket>>('/api/support-tickets', draft))
      .data
  ).data
}
export async function replySupportTicket(id: number, body: string) {
  return requireServerSuccess(
    (
      await api.post<Envelope<SupportTicket>>(
        `/api/support-tickets/${id}/replies`,
        { body }
      )
    ).data
  ).data
}
export async function updateSupportTicket(id: number, status: SupportStatus) {
  return requireServerSuccess(
    (
      await api.patch<Envelope<SupportTicket>>(`/api/support-tickets/${id}`, {
        status,
      })
    ).data
  ).data
}
