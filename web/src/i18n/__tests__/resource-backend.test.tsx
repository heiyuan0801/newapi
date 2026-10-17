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
import { act, render, screen } from '@testing-library/react'
import { createInstance } from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import {
  I18nextProvider,
  initReactI18next,
  useTranslation,
} from 'react-i18next'
import { describe, expect, it, vi } from 'vitest'

import { convertDetectedLanguage } from '../languages'
import en from '../locales/en.json'
import { LocaleResourceBackend } from '../resource-backend'

function TranslationSample() {
  const { t } = useTranslation()
  return <output aria-label='Current translation'>{t('Home')}</output>
}

describe('interface translation resource loading', () => {
  it.each([
    ['en', 'Home'],
    ['zhCN', '主页'],
    ['zhTW', '主頁'],
    ['fr', 'Accueil'],
    ['ru', 'Главная'],
    ['ja', 'ホーム'],
    ['vi', 'Trang chủ'],
  ])(
    'loads the selected %s language before showing its translated page',
    async (language, expected) => {
      const translations = createInstance()
      await translations
        .use(new LocaleResourceBackend())
        .use(initReactI18next)
        .init({
          lng: language,
          resources: { en },
          partialBundledLanguages: true,
          fallbackLng: 'en',
          load: 'currentOnly',
        })
      render(
        <I18nextProvider i18n={translations}>
          <TranslationSample />
        </I18nextProvider>
      )
      expect(screen.getByLabelText('Current translation')).toHaveTextContent(
        expected
      )
    }
  )

  it.each([
    ['zh', '主页'],
    ['zh-CN', '主页'],
    ['zhCN', '主页'],
    ['zh-TW', '主頁'],
    ['zhTW', '主頁'],
    ['zh-Hant-HK', '主頁'],
  ])(
    'detects %s and loads the matching Chinese resource',
    async (detected, expected) => {
      window.history.replaceState(
        {},
        '',
        `/?locale=${encodeURIComponent(detected)}`
      )
      const translations = createInstance()
      await translations
        .use(new LocaleResourceBackend())
        .use(LanguageDetector)
        .init({
          resources: { en },
          partialBundledLanguages: true,
          fallbackLng: 'en',
          supportedLngs: ['en', 'zhCN', 'zhTW', 'fr', 'ru', 'ja', 'vi'],
          load: 'currentOnly',
          detection: {
            order: ['querystring'],
            lookupQuerystring: 'locale',
            caches: [],
            convertDetectedLanguage,
          },
        })
      expect(translations.t('Home')).toBe(expected)
      window.history.replaceState({}, '', '/')
    }
  )

  it('keeps the current translation until the selected language has loaded and then updates React', async () => {
    let finishLoad: ((resource: Record<string, string>) => void) | undefined
    const load = vi.fn(
      () =>
        new Promise<Record<string, string>>((resolve) => {
          finishLoad = resolve
        })
    )
    const translations = createInstance()
    await translations
      .use(new LocaleResourceBackend(load))
      .use(initReactI18next)
      .init({
        lng: 'en',
        resources: { en },
        partialBundledLanguages: true,
        fallbackLng: 'en',
      })
    render(
      <I18nextProvider i18n={translations}>
        <TranslationSample />
      </I18nextProvider>
    )
    expect(screen.getByLabelText('Current translation')).toHaveTextContent(
      'Home'
    )
    let change: Promise<unknown>
    await act(async () => {
      change = translations.changeLanguage('fr')
      await Promise.resolve()
    })
    expect(screen.getByLabelText('Current translation')).toHaveTextContent(
      'Home'
    )
    await act(async () => {
      finishLoad?.({ Home: 'Accueil' })
      await change
    })
    expect(screen.getByLabelText('Current translation')).toHaveTextContent(
      'Accueil'
    )
    await act(async () => {
      await translations.changeLanguage('en')
      await translations.changeLanguage('fr')
    })
    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith('fr')
  })

  it('falls back to bundled English without repeated chunk requests when a language fails to load', async () => {
    const load = vi.fn(async () => {
      throw new Error('chunk unavailable')
    })
    const translations = createInstance()
    await translations.use(new LocaleResourceBackend(load)).init({
      lng: 'fr',
      resources: { en },
      partialBundledLanguages: true,
      fallbackLng: 'en',
      maxRetries: 2,
    })
    expect(translations.t('Home')).toBe('Home')
    expect(translations.hasLoadedNamespace('translation')).toBe(true)
    expect(load).toHaveBeenCalledTimes(1)
  })
})
