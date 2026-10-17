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
type TestableModel = {
  model_name: string
  enable_groups?: string[]
  supported_endpoint_types?: string[]
}

export function getPlaygroundTestGroup(
  model: TestableModel,
  selectedGroup?: string
): string | null {
  const endpoints = model.supported_endpoint_types ?? []
  if (
    endpoints.length > 0 &&
    !endpoints.some((endpoint) =>
      ['openai', 'openai-response', 'anthropic', 'gemini'].includes(endpoint)
    )
  ) {
    return null
  }
  const groups = (model.enable_groups ?? []).filter(
    (group) => group.trim() && !/[\p{Cc}]/u.test(group)
  )
  if (selectedGroup && groups.includes(selectedGroup)) return selectedGroup
  return groups.find((group) => group === 'default') ?? groups[0] ?? null
}
