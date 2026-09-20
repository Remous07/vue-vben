/**
 * API 请求客户端 — 连接 Python FastAPI 后端
 *
 * 后端返回格式: { code: 0, data: {...} }
 */
import type { RequestClientOptions } from '@vben/request';

import { useAppConfig } from '@vben/hooks';
import { preferences } from '@vben/preferences';
import {
  authenticateResponseInterceptor,
  defaultResponseInterceptor,
  errorMessageResponseInterceptor,
  RequestClient,
} from '@vben/request';
import { useAccessStore } from '@vben/stores';

import { message } from 'ant-design-vue';

import { useAuthStore } from '#/store';

import { refreshTokenApi } from './core';

const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);

/**
 * 限流（429）时把「还要等多久」补进提示文案。
 *
 * 后端在两步验证冷却时回了 `Retry-After`（秒），只说「请稍后再试」等于让用户自己
 * 猜要等多久——他多半会立刻重试、再撞一次。放在拦截器里而不是各个页面：登录、
 * 两步验证、开关两步验证都会命中同一个冷却，一处处理就全都受益。
 *
 * 头可能不存在（例如将来别的 429 没带），也可能不是数字；两种情况都原样返回。
 */
function withRetryAfter(text: string, error: unknown): string {
  const response = (
    error as {
      response?: { headers?: Record<string, string>; status?: number };
    }
  )?.response;
  if (response?.status !== 429) return text;

  const seconds = Number(response.headers?.['retry-after']);
  if (!Number.isFinite(seconds) || seconds <= 0) return text;

  const wait =
    seconds >= 60
      ? `约 ${Math.ceil(seconds / 60)} 分钟后`
      : `约 ${Math.ceil(seconds)} 秒后`;
  return `${text}（${wait}可重试）`;
}

function createRequestClient(baseURL: string, options?: RequestClientOptions) {
  const client = new RequestClient({ ...options, baseURL });

  async function doReAuthenticate() {
    console.warn('Access token is invalid or expired.');
    const accessStore = useAccessStore();
    const authStore = useAuthStore();
    accessStore.setAccessToken(null);
    if (
      preferences.app.loginExpiredMode === 'modal' &&
      accessStore.isAccessChecked
    ) {
      accessStore.setLoginExpired(true);
    } else {
      await authStore.logout();
    }
  }

  async function doRefreshToken() {
    const accessStore = useAccessStore();
    const newToken = await refreshTokenApi();
    accessStore.setAccessToken(newToken);
    return newToken;
  }

  function formatToken(token: null | string) {
    return token ? `Bearer ${token}` : null;
  }

  client.addRequestInterceptor({
    fulfilled: async (config) => {
      const accessStore = useAccessStore();
      config.headers.Authorization = formatToken(accessStore.accessToken);
      config.headers['Accept-Language'] = preferences.app.locale;
      return config;
    },
  });

  // 后端返回 { code: 0, data: ... }  成功码为 0
  client.addResponseInterceptor(
    defaultResponseInterceptor({
      codeField: 'code',
      dataField: 'data',
      successCode: 0,
    }),
  );

  client.addResponseInterceptor(
    authenticateResponseInterceptor({
      client,
      doReAuthenticate,
      doRefreshToken,
      enableRefreshToken: preferences.app.enableRefreshToken,
      formatToken,
    }),
  );

  client.addResponseInterceptor(
    errorMessageResponseInterceptor((msg: string, error) => {
      const responseData = error?.response?.data ?? {};
      const errorMessage =
        responseData?.detail ??
        responseData?.error ??
        responseData?.message ??
        '';
      message.error(withRetryAfter(errorMessage || msg, error));
    }),
  );

  return client;
}

export const requestClient = createRequestClient(apiURL, {
  responseReturn: 'data',
});

export const baseRequestClient = new RequestClient({ baseURL: apiURL });
