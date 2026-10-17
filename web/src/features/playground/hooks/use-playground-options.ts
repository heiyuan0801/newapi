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
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getUserGroups, getUserModels } from '../api'
import {
  getGroupFallback,
  getModelFallback,
  getOptionLoadErrorMessage,
  shouldClearModelForGroup,
} from '../lib'
import type { GroupOption, ModelOption, PlaygroundConfig } from '../types'

type UsePlaygroundOptionsParams = {
  currentGroup: string
  currentModel: string
  setGroups: (groups: GroupOption[]) => void
  setModels: (models: ModelOption[]) => void
  updateConfig: <K extends keyof PlaygroundConfig>(
    key: K,
    value: PlaygroundConfig[K]
  ) => void
  preserveSelection?: boolean
}

export function usePlaygroundOptions({
  currentGroup,
  currentModel,
  setGroups,
  setModels,
  updateConfig,
  preserveSelection = false,
}: UsePlaygroundOptionsParams) {
  const { t } = useTranslation()

  const {
    data: groupsData,
    error: groupsError,
    isError: isGroupsError,
  } = useQuery({
    queryKey: ['playground-groups'],
    queryFn: async () => requireServerSuccess(await getUserGroups()),
  })

  const groupAvailable = Boolean(
    groupsData?.some((group) => group.value === currentGroup)
  )
  const {
    data: modelsData,
    error: modelsError,
    isError: isModelsError,
    isFetching: isFetchingModels,
    isLoading: isLoadingModels,
  } = useQuery({
    queryKey: ['playground-models', currentGroup],
    queryFn: async () =>
      requireServerSuccess(await getUserModels(currentGroup)),
    enabled: currentGroup !== '' && (!preserveSelection || groupAvailable),
  })

  useEffect(() => {
    if (!isModelsError) return

    handleServerError(
      modelsError,
      getOptionLoadErrorMessage(
        modelsError,
        t('Failed to load playground models')
      )
    )
  }, [isModelsError, modelsError, t])

  useEffect(() => {
    if (!isGroupsError) return

    handleServerError(
      groupsError,
      getOptionLoadErrorMessage(
        groupsError,
        t('Failed to load playground groups')
      )
    )
  }, [isGroupsError, groupsError, t])

  useEffect(() => {
    if (!modelsData) {
      setModels([])
      return
    }

    setModels(modelsData)
    if (preserveSelection) return
    const fallback = getModelFallback(modelsData, currentModel)

    if (fallback) {
      updateConfig('model', fallback)
      return
    }

    if (shouldClearModelForGroup(modelsData, currentModel)) {
      updateConfig('model', '')
    }
  }, [
    modelsData,
    currentGroup,
    currentModel,
    setModels,
    updateConfig,
    preserveSelection,
  ])

  useEffect(() => {
    if (!groupsData) return

    setGroups(groupsData)
    if (preserveSelection) return
    const fallback = getGroupFallback(groupsData, currentGroup)

    if (fallback) {
      updateConfig('group', fallback)
    }
  }, [groupsData, currentGroup, setGroups, updateConfig, preserveSelection])

  return {
    isLoadingModels,
    selectionReady:
      groupAvailable &&
      !isModelsError &&
      !isGroupsError &&
      !isFetchingModels &&
      Boolean(modelsData?.some((model) => model.value === currentModel)),
    selectionUnavailable: Boolean(
      groupsData &&
      (!groupAvailable ||
        (modelsData &&
          !modelsData.some((model) => model.value === currentModel)))
    ),
  }
}
