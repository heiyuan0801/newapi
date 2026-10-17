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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useStatus } from '@/hooks/use-status'
import { cn } from '@/lib/utils'

interface HeroTerminalDemoProps {
  className?: string
}

export function HeroTerminalDemo(props: HeroTerminalDemoProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const configuredAddress = status?.server_address
  const baseUrl = (
    typeof configuredAddress === 'string' && configuredAddress
      ? configuredAddress
      : window.location.origin
  ).replace(/\/$/, '')
  const samples = [
    {
      id: 'chat',
      label: 'Chat',
      endpoint: '/v1/chat/completions',
      header: 'Authorization: Bearer YOUR_API_KEY',
      body: {
        model: 'YOUR_MODEL',
        messages: [{ role: 'user', content: 'Hello!' }],
      },
    },
    {
      id: 'responses',
      label: 'Responses',
      endpoint: '/v1/responses',
      header: 'Authorization: Bearer YOUR_API_KEY',
      body: { model: 'YOUR_MODEL', input: 'Hello!' },
    },
    {
      id: 'claude',
      label: 'Claude',
      endpoint: '/v1/messages',
      header: 'x-api-key: YOUR_API_KEY',
      body: {
        model: 'YOUR_MODEL',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hello!' }],
      },
    },
    {
      id: 'gemini',
      label: 'Gemini',
      endpoint: '/v1beta/models/YOUR_MODEL:generateContent',
      header: 'x-goog-api-key: YOUR_API_KEY',
      body: { contents: [{ parts: [{ text: 'Hello!' }] }] },
    },
  ]
  return (
    <div
      className={cn(
        'bg-background min-w-0 overflow-hidden rounded-[20px] border',
        props.className
      )}
    >
      <Tabs defaultValue='chat' className='gap-0'>
        <div className='bg-muted/30 overflow-x-auto border-b px-4 py-3'>
          <TabsList variant='line' className='gap-2'>
            {samples.map((sample) => (
              <TabsTrigger
                key={sample.id}
                value={sample.id}
                className='data-active:bg-foreground data-active:text-background rounded-full px-3 text-xs after:hidden'
              >
                {sample.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {samples.map((sample) => {
          const lines = [
            `curl -X POST "${baseUrl}${sample.endpoint}"`,
            '  -H "Content-Type: application/json"',
            `  -H "${sample.header}"`,
          ]
          if (sample.id === 'claude') {
            lines.push('  -H "anthropic-version: 2023-06-01"')
          }
          lines.push(`  -d '${JSON.stringify(sample.body, null, 2)}'`)
          const code = lines.join(' \\\n')
          return (
            <TabsContent key={sample.id} value={sample.id} className='mt-0'>
              <div className='text-muted-foreground flex items-center justify-between px-5 pt-4 text-xs'>
                <span>{t('Request example')}</span>
                <CopyButton value={code} className='size-7 rounded-full' />
              </div>
              <pre className='min-h-72 overflow-x-auto px-5 py-4 text-xs leading-6'>
                <code>{code}</code>
              </pre>
              <p className='text-muted-foreground bg-muted/20 border-t px-5 py-3 text-[11px] leading-5'>
                {t(
                  'Replace YOUR_API_KEY and YOUR_MODEL with your own key and an enabled model.'
                )}
              </p>
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}
