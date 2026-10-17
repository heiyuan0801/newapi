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
import { useMemo } from 'react'

import { requireServerSuccess } from '@/lib/server-error-message'
import { computeTimeRange, toStartOfDay } from '@/lib/time'
import { useAuthStore } from '@/stores/auth-store'

import { getUserQuotaDates } from '../api'
import { calculateDashboardStats } from '../lib/stats'

export function useOverviewUsage() {
  const userId = useAuthStore((state) => state.auth.user?.id)
  const todayStart = toStartOfDay(Math.floor(Date.now() / 1000))
  const query = useQuery({
    queryKey: ['dashboard', 'overview', 'usage', userId],
    // Keep one shared rolling query and recalculate its window on every fetch.
    queryFn: async () =>
      requireServerSuccess(
        await getUserQuotaDates({
          ...computeTimeRange(6, undefined, undefined, true),
          default_time: 'hour',
        })
      ).data,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: (currentQuery) =>
      toStartOfDay(Math.floor(currentQuery.state.dataUpdatedAt / 1000)) <
      toStartOfDay(Math.floor(Date.now() / 1000))
        ? 'always'
        : true,
    enabled: Boolean(userId),
  })
  const todayStats = useMemo(
    () =>
      calculateDashboardStats(
        (query.data ?? []).filter((item) => item.created_at >= todayStart)
      ),
    [query.data, todayStart]
  )

  return { ...query, todayStats }
}
