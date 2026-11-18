<script lang="ts" setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useVbenForm, z } from '@vben-core/form-ui';
import { VbenButton } from '@vben-core/shadcn-ui';

import { useAuthStore } from '#/store';

defineOptions({ name: 'TotpVerify' });

const authStore = useAuthStore();
const router = useRouter();
const loading = ref(false);

// 后端在登录响应里告知这个账号能用哪些第二因子；两者都有时两个入口都显示。
const methods = computed(() => authStore.secondFactorMethods);

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

      <template v-if="methods.passkey">
        <VbenButton :loading="loading" class="w-full" @click="handlePasskey">
          使用通行密钥
        </VbenButton>
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
