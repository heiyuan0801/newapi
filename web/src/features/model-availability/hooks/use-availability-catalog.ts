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

import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import { useStatus } from '@/hooks/use-status'
import { getUserGroups, getUserModels } from '@/lib/api'
import { getModuleAccessFromStatus } from '@/lib/nav-modules'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import type { AvailabilityCatalogModel } from '../lib/availability'

/** The authenticated model directory remains available with the public square disabled. */
export function useAvailabilityCatalog() {
  const { status, loading } = useStatus()
  const user = useAuthStore((state) => state.auth.user)
  const pricingEnabled = getModuleAccessFromStatus(status, 'pricing').enabled
  const pricing = usePricingData(!loading && pricingEnabled)
  const userCatalog = useQuery({
    queryKey: ['availability-catalog', user?.id, user?.group],
    queryFn: async () => {
      const userGroups = requireServerSuccess(await getUserGroups())
      const groups = Object.keys(userGroups.data ?? {}).sort()
      const groupModels = await Promise.all(
        groups.map(async (group) => ({
          group,
          response: requireServerSuccess(await getUserModels(group)),
        }))
      )

      // Commit the complete directory together so a failed new group cannot
      // replace the last loaded catalog with a partial or empty snapshot.
      const models = new Map<string, AvailabilityCatalogModel>()
      for (const { group, response } of groupModels) {
        for (const name of new Set(response.data ?? [])) {
          const existing = models.get(name)
          if (existing) {
            existing.enable_groups?.push(group)
          } else {
            models.set(name, { model_name: name, enable_groups: [group] })
          }
        }
      }
      return [...models.values()]
    },
    enabled: !loading && !pricingEnabled,
    staleTime: 60 * 1000,
    retry: false,
    meta: { errorToast: false },
  })
  if (pricingEnabled) {
    return { ...pricing, isLoading: loading || pricing.isLoading }
  }

  return {
    models: userCatalog.data ?? [],
    hasData: userCatalog.data !== undefined,
    isLoading: loading || userCatalog.isLoading,
    isFetching: userCatalog.isFetching,
    dataUpdatedAt: userCatalog.dataUpdatedAt,
    error: userCatalog.error,
    refetch: userCatalog.refetch,
  }
}
