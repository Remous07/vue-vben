<script lang="ts" setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';

import { useVbenForm, z } from '@vben-core/form-ui';
import { VbenButton } from '@vben-core/shadcn-ui';

import { useAuthStore } from '#/store';

defineOptions({ name: 'TotpVerify' });

const authStore = useAuthStore();
const router = useRouter();
const loading = ref(false);

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

async function handleSubmit() {
  const { valid } = await formApi.validate();
  if (!valid) return;

  loading.value = true;
  try {
    const values = await formApi.getValues();
    await authStore.authLoginTotp(values.code);
  } catch (error) {
    // 失败文案统一由拦截器按后端的 detail 弹出（「两步验证码错误」/「验证尝试次数
    // 过多…」），这里不再补一条笼统的「验证码错误」——那会和真实原因一起弹出、
    // 互相矛盾，用户按提示重试也永远不成功。
    //
    // 只额外处理一种情况：后端限流（401 令牌额度用尽 / 429 账号冷却）。这两类
    // 都不是「码输错了」，留在本页重试没有意义，回登录页重新走密码 + 人机验证。
    const status = (error as { response?: { status?: number } })?.response
      ?.status;
    if (status === 401 || status === 429) {
      await router.push('/auth/login');
    }
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
          请输入身份验证器中的 6 位验证码
        </p>
      </div>

      <Form />

      <VbenButton :loading="loading" class="w-full" @click="handleSubmit">
        验证
      </VbenButton>

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
