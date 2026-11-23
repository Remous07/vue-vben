import type { Locale } from 'ant-design-vue/es/locale';

import type { App } from 'vue';

import type { LocaleSetupOptions } from '@vben/locales';

import {
  $t,
  setupI18n as coreSetup,
  createDayjsLocale,
  createMessageLoader,
  createUiLocale,
  defineLocaleConfig,
} from '@vben/locales';
import {
  preferences,
  preferencesManager,
  updatePreferences,
} from '@vben/preferences';

import dayjs from 'dayjs';

const { adapter: ui, locale: antdLocale } = createUiLocale<Locale>();

const localeConfig = defineLocaleConfig({
  adapters: {
    dayjs: createDayjsLocale(dayjs.locale),
    ui,
  },
  languages: {
    'zh-CN': {
      label: '简体中文',
      resources: {
        dayjs: () => import('dayjs/locale/zh-cn'),
        ui: () => import('ant-design-vue/es/locale/zh_CN'),
      },
    },
    'en-US': {
      label: 'English',
      resources: {
        dayjs: () => import('dayjs/locale/en'),
        ui: () => import('ant-design-vue/es/locale/en_US'),
      },
    },
  },
  loadMessages: createMessageLoader(import.meta.glob('./langs/**/*.json')),
});

export type AppLocale = keyof typeof localeConfig.languages;

async function setupI18n(app: App, options: LocaleSetupOptions = {}) {
  await coreSetup(app, {
    ...localeConfig,
    defaultLocale: preferencesManager.getInitialPreferences().app.locale,
    initialLocale: preferences.app.locale,
    missingWarn: !import.meta.env.PROD,
    ...options,
    onLocaleChanged(locale) {
      if (preferences.app.locale !== locale) {
        updatePreferences({ app: { locale } });
      }
      return options.onLocaleChanged?.(locale);
    },
  });
}

export { $t, antdLocale, setupI18n };
