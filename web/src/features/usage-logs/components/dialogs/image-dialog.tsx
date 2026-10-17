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

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

interface ImageDialogProps {
  imageUrl: string
  taskId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

function ImagePreview(props: { imageUrl: string }) {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [revision, setRevision] = useState(0)

  return (
    <div className='space-y-4'>
      <div
        className='bg-muted/30 relative flex min-h-56 min-w-0 items-center justify-center overflow-hidden rounded-xl border'
        aria-busy={isLoading}
      >
        {isLoading && <Skeleton className='absolute inset-0 rounded-xl' />}
        <img
          key={revision}
          src={props.imageUrl}
          alt={t('Generated image')}
          className={`max-h-[60dvh] w-full rounded-xl object-contain ${
            isLoading || hasError ? 'opacity-0' : 'opacity-100'
          }`}
          onLoad={() => {
            setIsLoading(false)
            setHasError(false)
          }}
          onError={() => {
            setIsLoading(false)
            setHasError(true)
          }}
          loading='lazy'
        />
        {hasError && (
          <div className='absolute inset-0 flex flex-col items-center justify-center gap-3 p-4'>
            <p role='alert' className='text-muted-foreground text-sm'>
              {t('Failed to load image')}
            </p>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => {
                setHasError(false)
                setIsLoading(true)
                setRevision((value) => value + 1)
              }}
            >
              {t('Retry')}
            </Button>
          </div>
        )}
      </div>
      <p className='bg-muted/30 rounded-lg border p-3 font-mono text-xs break-all'>
        {props.imageUrl}
      </p>
    </div>
  )
}

export function ImageDialog(props: ImageDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Image Preview')}
      description={
        props.taskId
          ? `${t('Task ID:')} ${props.taskId}`
          : t('View the generated image')
      }
      descriptionClassName='break-all'
      contentClassName='min-w-0 rounded-2xl sm:max-w-3xl'
      contentHeight='auto'
      bodyClassName='space-y-4'
    >
      {props.open && (
        <ImagePreview key={props.imageUrl} imageUrl={props.imageUrl} />
      )}
    </Dialog>
  )
}
