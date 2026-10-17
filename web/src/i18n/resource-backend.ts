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
import type { BackendModule, ResourceKey } from 'i18next'

type ResourceLoader = (language: string) => Promise<ResourceKey>

const localeLoaders = {
  zhCN: () => import('./locales/zh.json'),
  zhTW: () => import('./locales/zh-TW.json'),
  fr: () => import('./locales/fr.json'),
  ru: () => import('./locales/ru.json'),
  ja: () => import('./locales/ja.json'),
  vi: () => import('./locales/vi.json'),
} as const

async function loadLocaleResource(language: string): Promise<ResourceKey> {
  if (!Object.hasOwn(localeLoaders, language)) {
    throw new Error('Unsupported interface language')
  }
  const module = await localeLoaders[language as keyof typeof localeLoaders]()
  return module.default.translation
}

// i18next caches loaded resources and waits for this backend before emitting
// languageChanged, so React subscribers never receive a half-loaded locale.
export class LocaleResourceBackend implements BackendModule {
  readonly type = 'backend' as const

  constructor(
    private readonly loadResource: ResourceLoader = loadLocaleResource
  ) {}

  init(): void {
    // Resource URLs are fixed build imports; there are no runtime endpoints.
  }

  async read(language: string, namespace: string): Promise<ResourceKey> {
    if (namespace !== 'translation') {
      throw new Error('Unsupported translation namespace')
    }
    try {
      return await this.loadResource(language)
    } catch {
      // A rejected backend read uses bundled English without asking i18next
      // for retries, so a missing chunk cannot leave the page in Suspense.
      throw new Error('Unable to load interface translations')
    }
  }
}
