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
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

import { VIEW_MODES, type ViewMode } from '../constants'

export interface LoadingSkeletonProps {
  viewMode?: ViewMode
}

export function LoadingSkeleton(props: LoadingSkeletonProps) {
  return (
    <div aria-busy='true' className='flex flex-col gap-6'>
      <div className='flex flex-col justify-between gap-3 border-b pb-4 sm:flex-row'>
        <div className='flex flex-wrap gap-3'>
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className='h-8 w-24' />
          ))}
        </div>
        <Skeleton className='h-8 w-full sm:w-64' />
      </div>
      <div className='mx-auto flex w-full max-w-2xl flex-col items-center py-8 sm:py-10'>
        <Skeleton className='h-10 w-48 sm:w-56' />
        <Skeleton className='mt-4 h-5 w-full' />
      </div>
      <div className='flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4'>
        <Skeleton className='h-8 w-40' />
        <div className='flex flex-wrap gap-2'>
          <Skeleton className='h-8 w-32' />
          <Skeleton className='h-8 w-20' />
          <Skeleton className='h-8 w-24' />
        </div>
      </div>
      {props.viewMode === VIEW_MODES.TABLE ? (
        <div className='overflow-hidden rounded-xl border'>
          {Array.from({ length: 10 }, (_, index) => (
            <div key={index} className='flex gap-4 border-b p-4 last:border-0'>
              <Skeleton className='h-5 w-40 max-w-full' />
              <Skeleton className='h-5 flex-1' />
              <Skeleton className='h-5 w-20' />
            </div>
          ))}
        </div>
      ) : (
        <div className='grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3'>
          {Array.from({ length: 6 }, (_, index) => (
            <Card key={index} className='gap-4 py-5'>
              <CardHeader className='flex flex-col items-center gap-3'>
                <Skeleton className='size-10' />
                <Skeleton className='h-5 w-40 max-w-full' />
                <Skeleton className='h-3 w-20' />
              </CardHeader>
              <CardContent className='flex flex-1 flex-col gap-4'>
                <div className='grid grid-cols-2 gap-3'>
                  <Skeleton className='h-10' />
                  <Skeleton className='h-10' />
                </div>
                <div className='flex flex-col gap-2'>
                  <Skeleton className='h-3.5 w-full' />
                  <Skeleton className='h-3.5 w-4/5 self-center' />
                </div>
                <Skeleton className='h-4 w-28 max-w-full' />
              </CardContent>
              <CardFooter className='justify-between border-0 bg-transparent pt-0'>
                <Skeleton className='h-8 w-40' />
                <Skeleton className='h-7 w-12' />
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
