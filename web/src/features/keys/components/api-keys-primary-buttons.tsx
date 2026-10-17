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
import { ChevronDown, Globe, MoreVertical, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item'
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useApiInfo } from '@/features/dashboard/hooks/use-status-data'
import { useStatus } from '@/hooks/use-status'

import { useApiKeys } from './api-keys-provider'

export function ApiKeysAddresses(props: { inline?: boolean }) {
  const { t } = useTranslation()
  const { status, loading } = useStatus()
  const { items } = useApiInfo()
  const serverAddress =
    (typeof status?.server_address === 'string' &&
      status.server_address.trim()) ||
    ''
  const addresses = items.length
    ? items
    : [
        {
          url: serverAddress || window.location.origin,
          route: serverAddress ? t('Default API address') : t('Current domain'),
          description: '',
        },
      ]

  return (
    <div className='flex min-w-0 items-center gap-2'>
      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant='outline'
              size='sm'
              aria-label={t('API Addresses')}
              className={
                props.inline
                  ? 'bg-muted/40 max-w-full min-w-0 font-mono font-normal'
                  : undefined
              }
            />
          }
        >
          {props.inline ? (
            <>
              <span className='min-w-0 truncate'>{addresses[0].url}</span>
              <MoreVertical aria-hidden='true' />
            </>
          ) : (
            <>
              <Globe aria-hidden='true' />
              {t('API Addresses')}
              <ChevronDown aria-hidden='true' />
            </>
          )}
        </PopoverTrigger>
        <PopoverContent
          align='end'
          className='max-h-[min(28rem,var(--available-height))] w-96 max-w-[calc(100vw-2rem)] overflow-y-auto'
        >
          <PopoverTitle>{t('API Addresses')}</PopoverTitle>
          {loading ? (
            <LoadingState inline size='sm' message={t('Loading...')} />
          ) : (
            <ItemGroup>
              {addresses.map((address) => (
                <Item
                  key={address.url}
                  role='listitem'
                  variant='muted'
                  size='xs'
                  className='flex-nowrap items-start'
                >
                  <ItemContent className='min-w-0 gap-1'>
                    <ItemTitle className='line-clamp-none break-all'>
                      {address.route}
                    </ItemTitle>
                    <code className='text-xs break-all select-text'>
                      {address.url}
                    </code>
                    {address.description && (
                      <ItemDescription className='line-clamp-none break-words'>
                        {address.description}
                      </ItemDescription>
                    )}
                  </ItemContent>
                  <ItemActions>
                    <CopyButton
                      value={address.url}
                      size='sm'
                      tooltip={t('Copy API URL')}
                      aria-label={`${t('Copy API URL')}: ${address.url}`}
                    />
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          )}
        </PopoverContent>
      </Popover>
      {props.inline && (
        <CopyButton
          value={addresses[0].url}
          variant='outline'
          className='size-8 rounded-lg'
          tooltip={t('Copy API URL')}
          aria-label={`${t('Copy API URL')}: ${addresses[0].url}`}
        />
      )}
    </div>
  )
}

export function ApiKeysPrimaryButtons(props: { showAddresses?: boolean }) {
  const { t } = useTranslation()
  const { setOpen } = useApiKeys()

  return (
    <div className='flex flex-wrap gap-2'>
      {props.showAddresses !== false && <ApiKeysAddresses />}
      <Button size='sm' onClick={() => setOpen('create')}>
        <Plus className='size-4' aria-hidden='true' />
        {t('Create API Key')}
      </Button>
    </div>
  )
}
