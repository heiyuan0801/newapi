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
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { TruncatedCell } from '@/components/data-table'

export function TaskIdentifier(props: { value: string }) {
  const { t } = useTranslation()

  if (!props.value) {
    return <span className='text-muted-foreground/60 text-xs'>-</span>
  }

  return (
    <div className='flex max-w-52 min-w-0 items-center gap-1'>
      <TruncatedCell className='min-w-0 flex-1 font-mono text-xs'>
        {props.value}
      </TruncatedCell>
      <CopyButton
        value={props.value}
        aria-label={`${t('Copy to clipboard')}: ${t('Task ID')}`}
        className='size-7 rounded-md'
        iconClassName='size-3.5'
      />
    </div>
  )
}
