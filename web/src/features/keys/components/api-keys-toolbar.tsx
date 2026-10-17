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
import type { Table } from '@tanstack/react-table'
import { Filter, RefreshCw, Search } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableToolbar } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { API_KEY_STATUS_OPTIONS } from '../constants'
import type { ApiKey } from '../types'
import { ApiKeysPrimaryButtons } from './api-keys-primary-buttons'
import { useApiKeys } from './api-keys-provider'

type ApiKeysToolbarProps = {
  table: Table<ApiKey>
  tokenFilter: string
  onSearch: (name: string, token: string) => void
  isFetching: boolean
}

export function ApiKeysToolbar(props: ApiKeysToolbarProps) {
  const { t } = useTranslation()
  const { triggerRefresh } = useApiKeys()
  const name = (props.table.getState().globalFilter as string) || ''
  const [draft, setDraft] = useState({
    baseName: name,
    baseToken: props.tokenFilter,
    name,
    token: props.tokenFilter,
  })
  const currentDraft =
    draft.baseName === name && draft.baseToken === props.tokenFilter
      ? draft
      : {
          baseName: name,
          baseToken: props.tokenFilter,
          name,
          token: props.tokenFilter,
        }
  const sorting = props.table.getState().sorting[0]
  const sortValue = sorting?.id ?? 'default'
  const sortItems = [
    { value: 'default', label: t('Default order') },
    { value: 'name', label: t('Name on this page') },
    { value: 'created_time', label: t('Newest on this page') },
  ]

  return (
    <DataTableToolbar
      table={props.table}
      hideViewOptions
      onReset={() =>
        setDraft({ baseName: '', baseToken: '', name: '', token: '' })
      }
      className='gap-2 [&_button]:shadow-none [&_input]:h-8'
      customSearch={
        <form
          className='flex min-w-0 flex-wrap items-center gap-2 max-sm:w-full'
          aria-label={t('Search API keys')}
          onSubmit={(event) => {
            event.preventDefault()
            const name = currentDraft.name.trim()
            const token = currentDraft.token.trim()
            setDraft({ baseName: name, baseToken: token, name, token })
            props.onSearch(name, token)
          }}
        >
          <Select
            items={sortItems}
            value={sortValue}
            onValueChange={(value) =>
              props.table.setSorting(
                value === 'default' || !value
                  ? []
                  : [{ id: value, desc: value === 'created_time' }]
              )
            }
          >
            <SelectTrigger className='w-32' aria-label={t('Sort API keys')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={currentDraft.name}
            onChange={(event) =>
              setDraft({ ...currentDraft, name: event.target.value })
            }
            placeholder={t('Name')}
            aria-label={t('Filter by name...')}
            className='w-36 max-sm:flex-1'
          />
          <Input
            value={currentDraft.token}
            onChange={(event) =>
              setDraft({ ...currentDraft, token: event.target.value })
            }
            placeholder='ApiKey'
            aria-label={t('Filter by API key...')}
            className='w-36 max-sm:flex-1'
            autoComplete='off'
          />
          <Button
            type='submit'
            variant='outline'
            size='sm'
            disabled={props.isFetching}
          >
            <Search className='size-4' aria-hidden='true' />
            {t('Search')}
          </Button>
        </form>
      }
      preActions={
        <>
          <Button
            variant='outline'
            size='icon-sm'
            aria-label={t('Refresh')}
            disabled={props.isFetching}
            onClick={triggerRefresh}
          >
            <RefreshCw className='size-4' aria-hidden='true' />
          </Button>
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  variant='outline'
                  size='icon-sm'
                  aria-label={t('Filters')}
                />
              }
            >
              <Filter className='size-4' aria-hidden='true' />
            </PopoverTrigger>
            <PopoverContent
              align='end'
              className='w-80 max-w-[calc(100vw-2rem)]'
            >
              <PopoverTitle>{t('Filters')}</PopoverTitle>
              <DataTableToolbar
                table={props.table}
                customSearch={null}
                filters={[
                  {
                    columnId: 'status',
                    title: t('Status'),
                    options: API_KEY_STATUS_OPTIONS,
                    singleSelect: true,
                  },
                ]}
              />
            </PopoverContent>
          </Popover>
          <ApiKeysPrimaryButtons showAddresses={false} />
        </>
      }
    />
  )
}
