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
import { createFileRoute } from '@tanstack/react-router'
import z from 'zod'

import { ModelAvailabilityPage } from '@/features/model-availability'

export const modelAvailabilitySearchSchema = z.object({
  source: z.enum(['real', 'probe']).catch('real'),
  hours: z.coerce
    .number()
    .pipe(z.union([z.literal(24), z.literal(168)]))
    .catch(24),
  status: z
    .enum(['all', 'healthy', 'degraded', 'critical', 'unknown'])
    .catch('all'),
  q: z.string().trim().max(200).catch(''),
  group: z.string().max(128).catch(''),
  page: z.coerce.number().int().positive().catch(1),
})

export type ModelAvailabilitySearch = z.infer<
  typeof modelAvailabilitySearchSchema
>

export const Route = createFileRoute('/_authenticated/model-availability')({
  validateSearch: modelAvailabilitySearchSchema,
  component: ModelAvailabilityPage,
})
