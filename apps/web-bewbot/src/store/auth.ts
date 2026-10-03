import type { Recordable, UserInfo } from '@vben/types';

import type { AuthApi } from '#/api';

import { ref } from 'vue';
import { useRouter } from 'vue-router';

import { LOGIN_PATH } from '@vben/constants';
import { preferences } from '@vben/preferences';
import { resetAllStores, useAccessStore, useUserStore } from '@vben/stores';

import { notification } from 'ant-design-vue';
import { defineStore } from 'pinia';

import {
  getAccessCodesApi,
  getUserInfoApi,
  loginApi,
  loginTotpApi,
  logoutApi,
  registerApi,
} from '#/api';
import { $t } from '#/locales';

// 持久化最近一次登录的系统用户名：页面刷新后 userStore.userInfo 为空，
// token 过期自动登出时用它兜底传给后端。
//
// 注意后端把它记进审计的**详情**、不是「操作人」列：这条路没有可验签的令牌，
// 谁都能带任意字符串来调，所以它不能进身份字段。详情列一样看得到，只是标明是自述。
const LAST_USERNAME_KEY = 'bewbot:last-username';

function persistUsername(username: string | undefined) {
  if (username) {
    localStorage.setItem(LAST_USERNAME_KEY, username);
  }
}

export const useAuthStore = defineStore('auth', () => {
  const accessStore = useAccessStore();
  const userStore = useUserStore();
  const router = useRouter();

  const loginLoading = ref(false);
  const registerLoading = ref(false);
  const totpTempToken = ref('');

  async function authLogin(
    params: Recordable<any>,
    onSuccess?: () => Promise<void> | void,
  ) {
    let userInfo: null | UserInfo = null;
    try {
      loginLoading.value = true;
      const response: any = await loginApi(params);

      // TOTP required: store temp token, redirect to TOTP page
      if (response.totpPending) {
        totpTempToken.value = response.tempToken;
        await router.push('/auth/totp-verify');
        return { userInfo: null };
      }

      // Account deletion cancelled by logging in
      if (response.deletionCancelled) {
        notification.success({
          message: '账户注销已取消',
          description: '已重新激活您的账户',
          duration: 5,
        });
      }

      const { accessToken } = response;

      if (accessToken) {
        accessStore.setAccessToken(accessToken);

        const [fetchUserInfoResult, accessCodes] = await Promise.all([
          fetchUserInfo(),
          getAccessCodesApi(),
        ]);

        userInfo = fetchUserInfoResult;
        userStore.setUserInfo(userInfo);
        persistUsername(userInfo.username);
        accessStore.setAccessCodes(accessCodes);

        if (accessStore.loginExpired) {
          accessStore.setLoginExpired(false);
        } else {
          onSuccess
            ? await onSuccess?.()
            : await router.push(
                userInfo.homePath || preferences.app.defaultHomePath,
              );
        }

        if (userInfo?.realName) {
          notification.success({
            description: `${$t('authentication.loginSuccessDesc')}:${userInfo?.realName}`,
            duration: 3,
            message: $t('authentication.loginSuccess'),
          });
        }
      }
    } finally {
      loginLoading.value = false;
    }

    return { userInfo };
  }

  async function logout(redirect: boolean = true) {
    try {
      // token 过期自动登出时后端拿不到 JWT 里的用户名，从内存/持久化兜底传
      const username =
        userStore.userInfo?.username ??
        localStorage.getItem(LAST_USERNAME_KEY) ??
        undefined;
      await logoutApi(username);
    } catch {
      // 不做任何处理
    }
    localStorage.removeItem(LAST_USERNAME_KEY);
    resetAllStores();
    accessStore.setLoginExpired(false);

    // 已经在登录页时不能再带 redirect：此时 currentRoute.fullPath 就是登录页本身，
    // 再编码一层会得到「登录页?redirect=编码后的登录页」，下一次又在这个基础上再包一层，
    // 反复登出会让 URL 逐跳变长，且没有上限。（上游 #8417 修的就是这个，这段是从
    // apps/web-antd 复制过来的，一并跟上。）
    const currentRoute = router.currentRoute.value;
    const alreadyOnLogin = currentRoute.path === LOGIN_PATH;

    await router.replace({
      path: LOGIN_PATH,
      query:
        redirect && !alreadyOnLogin
          ? { redirect: encodeURIComponent(currentRoute.fullPath) }
          : {},
    });
  }

  async function fetchUserInfo() {
    const userInfo = await getUserInfoApi();
    userStore.setUserInfo(userInfo);
    persistUsername(userInfo.username);
    return userInfo;
  }

  async function authRegister(params: Recordable<any>) {
    try {
      registerLoading.value = true;
      await registerApi(params as AuthApi.RegisterParams);
    } finally {
      registerLoading.value = false;
    }
  }

  function $reset() {
    loginLoading.value = false;
    registerLoading.value = false;
  }

  async function authLoginTotp(totpCode: string) {
    try {
      loginLoading.value = true;
      const { accessToken } = await loginTotpApi(totpTempToken.value, totpCode);

      if (accessToken) {
        accessStore.setAccessToken(accessToken);
        totpTempToken.value = '';

        const [fetchUserInfoResult, accessCodes] = await Promise.all([
          fetchUserInfo(),
          getAccessCodesApi(),
        ]);

        const userInfo = fetchUserInfoResult;
        userStore.setUserInfo(userInfo);
        accessStore.setAccessCodes(accessCodes);

        await router.push(userInfo.homePath || preferences.app.defaultHomePath);

        if (userInfo?.realName) {
          notification.success({
            description: `${$t('authentication.loginSuccessDesc')}:${userInfo?.realName}`,
            duration: 3,
            message: $t('authentication.loginSuccess'),
          });
        }
      }
    } finally {
      loginLoading.value = false;
    }
  }

  return {
    $reset,
    authLogin,
    authLoginTotp,
    authRegister,
    fetchUserInfo,
    loginLoading,
    logout,
    registerLoading,
    totpTempToken,
  };
});
