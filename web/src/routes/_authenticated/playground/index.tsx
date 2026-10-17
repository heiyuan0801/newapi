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
import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'

import { Main } from '@/components/layout'
import { Playground } from '@/features/playground'
import { DEFAULT_GROUP } from '@/features/playground/constants'
import { isSidebarModuleEnabled } from '@/lib/nav-modules'

export const playgroundSearchSchema = z.object({
  model: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .regex(/^[^\p{Cc}]+$/u)
    .optional()
    .catch(''),
  group: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[^\p{Cc}]+$/u)
    .optional()
    .catch(''),
})

export const Route = createFileRoute('/_authenticated/playground/')({
  validateSearch: playgroundSearchSchema,
  beforeLoad: () => {
    if (!isSidebarModuleEnabled('chat', 'playground')) {
      throw redirect({ to: '/dashboard' })
    }
  },
  component: PlaygroundPage,
})

export function getPlaygroundLaunchSelection(
  search: z.infer<typeof playgroundSearchSchema>
) {
  if (search.model === undefined && search.group === undefined) return undefined
  return { model: search.model ?? '', group: search.group ?? DEFAULT_GROUP }
}

function PlaygroundPage() {
  const search = Route.useSearch()
  const selection = getPlaygroundLaunchSelection(search)
  return (
    <Main className='p-0'>
      <Playground key={JSON.stringify(selection)} selection={selection} />
    </Main>
  )
}
