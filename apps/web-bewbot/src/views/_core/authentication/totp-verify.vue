<script lang="ts" setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useVbenForm, z } from '@vben-core/form-ui';
import { VbenButton } from '@vben-core/shadcn-ui';

import { message } from 'ant-design-vue';

import { useAuthStore } from '#/store';
import { describePasskeyError, passkeySupported } from '#/utils/passkey';

defineOptions({ name: 'TotpVerify' });

const authStore = useAuthStore();
const router = useRouter();
const loading = ref(false);

// 后端在登录响应里告知这个账号能用哪些第二因子；两者都有时两个入口都显示。
const methods = computed(() => authStore.secondFactorMethods);
// 浏览器不支持时按钮点下去只会抛异常，干脆不显示。
const passkeyAvailable = computed(
  () => methods.value.passkey && passkeySupported(),
);

const [Form, formApi] = useVbenForm({
  commonConfig: { hideLabel: true, hideRequiredMark: true },
  schema: [
    {
      component: 'VbenInput',
      componentProps: {
        placeholder: '请输入 6 位验证码',
        maxlength: 6,
        // Lets password managers (e.g. Bitwarden) detect and auto-fill the OTP
        autocomplete: 'one-time-code',
        inputmode: 'numeric',
      },
      fieldName: 'code',
      rules: z.string().length(6, { message: '请输入 6 位验证码' }),
    },
  ],
  showDefaultActions: false,
});

/** 临时令牌失效、或被限流时，留在本页重试没有意义。 */
function backToLoginIfFatal(error: unknown) {
  const status = (error as { response?: { status?: number } })?.response
    ?.status;
  if (status === 401 || status === 403 || status === 429) {
    router.push('/auth/login');
  }
}

async function handleSubmit() {
  const { valid } = await formApi.validate();
  if (!valid) return;

  loading.value = true;
  try {
    const values = await formApi.getValues();
    await authStore.authLoginTotp(values.code);
  } catch (error) {
    // 失败文案统一由拦截器按后端 detail 弹出；这里只处理「该回登录页」的情况。
    backToLoginIfFatal(error);
  } finally {
    loading.value = false;
  }
}

async function handlePasskey() {
  loading.value = true;
  try {
    await authStore.authPasskeyLogin();
  } catch (error) {
    // 用户取消系统弹窗、超时、设备不支持……这些不是 HTTP 错误，
    // 拦截器看不到，必须自己给一句人话。
    const text = describePasskeyError(error);
    if (text) {
      message.warning(text);
    }
    backToLoginIfFatal(error);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="flex h-full items-center justify-center p-6">
    <div class="w-full max-w-sm">
      <div class="mb-6 text-center">
        <h2 class="text-xl font-semibold">两步验证</h2>
        <p class="mt-2 text-sm text-gray-500">
          请使用通行密钥，或输入身份验证器中的 6 位验证码
        </p>
      </div>

      <template v-if="passkeyAvailable">
        <VbenButton :loading="loading" class="w-full" @click="handlePasskey">
          使用通行密钥
        </VbenButton>
        <p class="text-muted-foreground mt-2 text-center text-xs">
          用指纹、面容或设备 PIN 完成验证
        </p>
      </template>

      <template v-if="methods.passkey && methods.totp">
        <div class="my-4 flex items-center gap-3 text-xs text-gray-400">
          <span class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></span>
          或者
          <span class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></span>
        </div>
      </template>

      <template v-if="methods.totp">
        <Form />
        <VbenButton
          :loading="loading"
          class="mt-4 w-full"
          @click="handleSubmit"
        >
          验证
        </VbenButton>
      </template>

      <div
        v-if="methods.passkey && !passkeyAvailable"
        class="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
      >
        这个账号用通行密钥作为第二因子，但当前浏览器不支持通行密钥（需要 HTTPS
        或
        localhost）。请换一个浏览器或设备；如果只有这一种方式，需要联系另一位管理员重置第二因子。
      </div>

      <div class="mt-4 text-center text-sm">
        <a
          class="cursor-pointer text-blue-500"
          @click="router.push('/auth/login')"
        >
          返回登录
        </a>
      </div>
    </div>
  </div>
</template>
