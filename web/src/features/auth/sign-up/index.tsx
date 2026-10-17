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
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { useStatus } from '@/hooks/use-status'

import { AuthLayout } from '../auth-layout'
import { TermsFooter } from '../components/terms-footer'
import { SignUpForm } from './components/sign-up-form'

export function SignUp() {
  const { t } = useTranslation()
  const { status } = useStatus()

  return (
    <AuthLayout>
      <div className='flex w-full flex-col gap-7'>
        <div className='flex flex-col items-center gap-4 text-center'>
          <span className='bg-muted rounded-full px-3.5 py-1.5 text-xs font-medium'>
            {t('Sign up for an account')}
          </span>
          <h1 className='text-3xl font-semibold tracking-tight'>
            {t('Create your account')}
          </h1>
          <p className='text-muted-foreground text-sm leading-6'>
            {t('One account. A world of AI possibilities.')}
          </p>
        </div>

        <SignUpForm />

        <div className='flex flex-col gap-5'>
          <p className='text-muted-foreground text-center text-sm'>
            {t('Already have an account?')}{' '}
            <Link
              to='/sign-in'
              className='text-foreground font-medium underline underline-offset-4 hover:opacity-70'
            >
              {t('Sign in')}
            </Link>
          </p>
          <TermsFooter
            variant='sign-up'
            status={status}
            className='text-center leading-5'
          />
        </div>
      </div>
    </AuthLayout>
  )
}
