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

export type Delivery = {
  id: number
  event_key: string
  kind: string
  recipient_id: number
  incident_id: number
  status: string
  attempts: number
  max_attempts: number
  next_attempt_at: number
  created_at: number
  updated_at: number
  sent_at: number
  last_error_code: string
  channel: string
}
export async function getNotificationDeliveries(status: string, page: number) {
  return requireServerSuccess(
    (
      await api.get<{
        success: boolean
        message?: string
        data: {
          items: Delivery[]
          total: number
          page: number
          page_size: number
        }
      }>('/api/notification-deliveries', {
        params: { status, page, page_size: 20 },
      })
    ).data
  ).data
}
export async function testNotificationDelivery() {
  return requireServerSuccess(
    (
      await api.post<{ success: boolean; message?: string; data: Delivery }>(
        '/api/notification-deliveries/test'
      )
    ).data
  ).data
}
