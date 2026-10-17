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
import { useNavigate } from '@tanstack/react-router'
import { Check, KeyRound, Play, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CodeBlockFrame } from '@/components/ai-elements/code-block'
import { CopyButton } from '@/components/copy-button'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { ModelGroupSelector } from '@/components/model-group-selector'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { getApiKeys } from '@/features/keys/api'
import { ApiKeysMutateDrawer } from '@/features/keys/components/api-keys-mutate-drawer'
import {
  ApiKeysProvider,
  useApiKeys,
} from '@/features/keys/components/api-keys-provider'
import { getUserGroups, getUserModels } from '@/features/playground/api'
import { useIsSidebarModuleVisible } from '@/hooks/use-sidebar-config'
import { useStatus } from '@/hooks/use-status'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import { buildGuideCurl, getGuideBaseUrl } from './lib/request-example'

export function GettingStartedPage() {
  const navigate = useNavigate()
  return (
    <GettingStartedGuide
      onPlayground={(model, group) =>
        void navigate({ to: '/playground', search: { model, group } })
      }
      onManageKeys={() => void navigate({ to: '/keys' })}
    />
  )
}

export function GettingStartedGuide(props: {
  onPlayground: (model: string, group: string) => void
  onManageKeys?: () => void
}) {
  return (
    <ApiKeysProvider>
      <GuideContent {...props} />
    </ApiKeysProvider>
  )
}

function GuideContent(props: {
  onPlayground: (model: string, group: string) => void
  onManageKeys?: () => void
}) {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const userId = user?.id
  const { status, loading: statusLoading } = useStatus()
  const keysVisible = useIsSidebarModuleVisible('/keys')
  const playgroundVisible = useIsSidebarModuleVisible('/playground')
  const { refreshTrigger } = useApiKeys()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const groups = useQuery({
    queryKey: ['getting-started-groups', userId],
    queryFn: getUserGroups,
    retry: false,
    meta: { errorToast: false },
  })
  const currentGroup =
    groups.data?.find((item) => item.value === selectedGroup)?.value ??
    groups.data?.find((item) => item.value === 'default')?.value ??
    groups.data?.[0]?.value ??
    ''
  const models = useQuery({
    queryKey: ['getting-started-models', userId, currentGroup],
    queryFn: () => getUserModels(currentGroup),
    enabled: Boolean(currentGroup),
    retry: false,
    meta: { errorToast: false },
  })
  const currentModel =
    models.data?.find((item) => item.value === selectedModel)?.value ??
    models.data?.[0]?.value ??
    ''
  const keys = useQuery({
    queryKey: ['getting-started-keys', userId, refreshTrigger],
    queryFn: async () => {
      const response = requireServerSuccess(
        await getApiKeys({ p: 1, size: 100 })
      )
      // Retain metadata only; the guide never needs masked or decrypted keys.
      return (response.data?.items ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        group: item.group,
        status: item.status,
        expired_time: item.expired_time,
      }))
    },
    retry: false,
    enabled: keysVisible,
    meta: { errorToast: false },
  })
  const matchingKey = keys.data?.find(
    (key) =>
      key.status === 1 &&
      (key.expired_time === -1 || key.expired_time > Date.now() / 1000) &&
      (key.group || user?.group || 'default') === currentGroup
  )
  const baseUrl = getGuideBaseUrl(
    status?.server_address,
    window.location.origin
  )
  const example = buildGuideCurl(baseUrl, currentModel)
  const loading =
    statusLoading ||
    groups.isPending ||
    (Boolean(currentGroup) && models.isPending)
  const failed = groups.isError || models.isError
  const canTest = !loading && !failed && Boolean(currentModel && currentGroup)

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {t('API connection guide')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='mx-auto max-w-5xl min-w-0 space-y-5'>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Create a key, confirm the BaseURL, choose a model and group, then make your first request.'
            )}
          </p>
          <section
            aria-label={t('Create API Key')}
            className='space-y-4 rounded-2xl border p-4 sm:p-5'
          >
            <h2 className='text-sm font-semibold'>1. {t('Create API Key')}</h2>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Choose the model group below before creating a key. The new-key form will start with the same group.'
              )}
            </p>
            {keysVisible && keys.isPending && (
              <LoadingState inline message={t('Loading...')} />
            )}
            {keys.isError && (
              <ErrorState
                className='min-h-28'
                title={t('Unable to load your API key status')}
                onRetry={() => void keys.refetch()}
              />
            )}
            {matchingKey && (
              <p className='flex items-center gap-2 text-sm'>
                <Check aria-hidden className='size-4 text-emerald-600' />
                {t('Existing key for this group: {{name}}', {
                  name: matchingKey.name,
                })}
              </p>
            )}
            <div className='flex flex-wrap gap-2'>
              <Button
                onClick={() => setDrawerOpen(true)}
                disabled={!keysVisible || !currentGroup || groups.isPending}
                size='sm'
              >
                <KeyRound aria-hidden />
                {matchingKey
                  ? t('Create another API key')
                  : t('Create API Key')}
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={props.onManageKeys}
                disabled={!keysVisible}
              >
                {t('Manage and copy API keys')}
              </Button>
              <Button
                onClick={() => void keys.refetch()}
                variant='outline'
                size='sm'
                disabled={!keysVisible || keys.isFetching}
              >
                <RefreshCw aria-hidden />
                {t('Refresh key status')}
              </Button>
            </div>
          </section>
          <section
            aria-label='BaseURL'
            className='space-y-3 rounded-2xl border p-4 sm:p-5'
          >
            <h2 className='text-sm font-semibold'>2. BaseURL</h2>
            <div className='flex min-w-0 items-start gap-3'>
              <code className='bg-muted/40 min-w-0 flex-1 rounded-lg border p-3 text-xs break-all'>
                {baseUrl}
              </code>
              <CopyButton
                value={baseUrl}
                variant='outline'
                aria-label={t('Copy API URL')}
              />
            </div>
          </section>
          <section
            aria-label={t('Model and group')}
            className='space-y-4 rounded-2xl border p-4 sm:p-5'
          >
            <h2 className='text-sm font-semibold'>3. {t('Model and group')}</h2>
            {loading && (
              <div role='status'>
                <LoadingState inline message={t('Loading...')} />
              </div>
            )}
            {failed && (
              <ErrorState
                className='min-h-28'
                title={t('Unable to load available models and groups')}
                onRetry={() => {
                  void groups.refetch()
                  if (currentGroup) void models.refetch()
                }}
              />
            )}
            {!loading && !failed && groups.data?.length === 0 && (
              <EmptyState
                className='min-h-28'
                title={t('No available model groups')}
              />
            )}
            {!failed && Boolean(groups.data?.length) && (
              <ModelGroupSelector
                groups={groups.data ?? []}
                selectedGroup={currentGroup}
                onGroupChange={(group) => {
                  setSelectedGroup(group)
                  setSelectedModel('')
                }}
                models={models.data ?? []}
                selectedModel={currentModel}
                onModelChange={setSelectedModel}
                disabled={groups.isPending}
              />
            )}
            {!loading &&
              !failed &&
              currentGroup &&
              models.data?.length === 0 && (
                <EmptyState
                  className='min-h-28'
                  title={t('No available models in this group')}
                />
              )}
            <p className='text-muted-foreground text-xs'>
              {t(
                'The key group controls routing. Use a key from the selected group for this example.'
              )}
            </p>
          </section>
          <section
            aria-label={t('Request example')}
            className='min-w-0 space-y-3 rounded-2xl border p-4 sm:p-5'
          >
            <h2 className='text-sm font-semibold'>4. {t('Request example')}</h2>
            <Alert>
              <AlertDescription>
                {t(
                  'Set NEW_API_KEY in your local environment. The guide never reads or stores your full key. This example uses Chat Completions; confirm that your model supports it.'
                )}
              </AlertDescription>
            </Alert>
            {canTest && (
              <CodeBlockFrame
                showToolbar
                title='curl'
                endActions={
                  <CopyButton
                    value={example}
                    aria-label={t('Copy request example')}
                  />
                }
              >
                <pre
                  aria-label={t('Safe curl example')}
                  className='max-w-full overflow-x-auto p-4 text-xs leading-6'
                >
                  <code>{example}</code>
                </pre>
              </CodeBlockFrame>
            )}
          </section>
          <section
            aria-label={t('Test in Playground')}
            className='space-y-3 rounded-2xl border p-4 sm:p-5'
          >
            <h2 className='text-sm font-semibold'>
              5. {t('Test in Playground')}
            </h2>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Opening Playground only selects the model and group. Sending a request is manual and may consume your balance.'
              )}
            </p>
            <Button
              disabled={!canTest || !playgroundVisible}
              onClick={() => props.onPlayground(currentModel, currentGroup)}
            >
              <Play aria-hidden />
              {t('Open Playground with selection')}
            </Button>
          </section>
        </div>
        <ApiKeysMutateDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          initialGroup={currentGroup}
        />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
