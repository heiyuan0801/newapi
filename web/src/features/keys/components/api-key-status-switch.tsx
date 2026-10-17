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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { handleServerError } from '@/lib/handle-server-error'

import { updateApiKeyStatus } from '../api'
import {
  API_KEY_STATUS,
  API_KEY_STATUSES,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
} from '../constants'
import type { ApiKey } from '../types'
import { useApiKeys } from './api-keys-provider'

export function ApiKeyStatusSwitch(props: { apiKey: ApiKey }) {
  const { t } = useTranslation()
  const { triggerRefresh } = useApiKeys()
  const [pending, setPending] = useState(false)
  const enabled = props.apiKey.status === API_KEY_STATUS.ENABLED
  const label = enabled ? t('Disable') : t('Enable')
  const status = API_KEY_STATUSES[props.apiKey.status]

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Switch
            checked={enabled}
            disabled={pending}
            aria-label={label}
            onCheckedChange={async () => {
              setPending(true)
              try {
                const result = await updateApiKeyStatus(
                  props.apiKey.id,
                  enabled ? API_KEY_STATUS.DISABLED : API_KEY_STATUS.ENABLED
                )
                if (result.success) {
                  toast.success(
                    t(
                      enabled
                        ? SUCCESS_MESSAGES.API_KEY_DISABLED
                        : SUCCESS_MESSAGES.API_KEY_ENABLED
                    )
                  )
                  triggerRefresh()
                } else {
                  handleServerError(
                    result,
                    t(ERROR_MESSAGES.STATUS_UPDATE_FAILED)
                  )
                }
              } catch (error) {
                handleServerError(error, t(ERROR_MESSAGES.UNEXPECTED))
              } finally {
                setPending(false)
              }
            }}
          />
        }
      />
      <TooltipContent>{status ? t(status.label) : label}</TooltipContent>
    </Tooltip>
  )
}
