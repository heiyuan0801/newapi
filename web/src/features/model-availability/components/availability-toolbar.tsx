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
import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  AVAILABILITY_STATUS_LABELS,
  type AvailabilityStatus,
} from '../lib/availability'

export function AvailabilityToolbar(props: {
  query: string
  status: AvailabilityStatus | 'all'
  group: string
  groups: string[]
  resetToken?: number
  onQueryChange: (value: string) => void
  onStatusChange: (value: AvailabilityStatus | 'all') => void
  onGroupChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const [queryDraft, setQueryDraft] = useState(props.query)
  const composing = useRef(false)
  useEffect(() => setQueryDraft(props.query), [props.query, props.resetToken])
  const items = [
    { value: 'all', label: t('All statuses') },
    ...Object.entries(AVAILABILITY_STATUS_LABELS).map(([value, label]) => ({
      value,
      label: t(label),
    })),
  ]
  const groupItems = [
    { value: '', label: t('All groups') },
    ...props.groups.map((group) => ({ value: group, label: group })),
  ]
  return (
    <div className='flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5'>
      <form
        role='search'
        className='flex min-w-0 items-center gap-2 sm:w-96'
        onSubmit={(event) => {
          event.preventDefault()
          if (composing.current) return
          const query = queryDraft.trim()
          setQueryDraft(query)
          props.onQueryChange(query)
        }}
      >
        <Input
          type='search'
          value={queryDraft}
          maxLength={200}
          onChange={(event) => setQueryDraft(event.target.value)}
          onCompositionStart={() => {
            composing.current = true
          }}
          onCompositionEnd={() => {
            composing.current = false
          }}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              (composing.current ||
                event.nativeEvent.isComposing ||
                event.nativeEvent.keyCode === 229)
            ) {
              event.preventDefault()
            }
          }}
          aria-label={t('Search models')}
          placeholder={t('Search models')}
          className='h-9 min-w-0'
        />
        <Button type='submit' size='sm' className='h-9 gap-1.5 rounded-lg'>
          <Search aria-hidden className='size-3.5' />
          {t('Search')}
        </Button>
      </form>
      <div className='grid min-w-0 grid-cols-2 gap-2 sm:flex sm:shrink-0'>
        <Select
          items={groupItems}
          value={props.group}
          onValueChange={(value) => {
            if (value !== null) props.onGroupChange(value)
          }}
        >
          <SelectTrigger
            aria-label={t('Group')}
            className='h-9 w-full min-w-0 sm:w-36'
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {groupItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={items}
          value={props.status}
          onValueChange={(value) => {
            if (value) props.onStatusChange(value as AvailabilityStatus | 'all')
          }}
        >
          <SelectTrigger
            aria-label={t('Model status')}
            className='h-9 w-full min-w-0 sm:w-36'
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
