<script lang="ts" setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';

import { $t } from '@vben/locales';

import { useVbenForm, z } from '@vben-core/form-ui';
import { VbenButton } from '@vben-core/shadcn-ui';

import { message } from 'ant-design-vue';

import { forgotPasswordApi } from '#/api/core';
import TurnstileWidget from '#/components/TurnstileWidget.vue';

defineOptions({ name: 'ForgetPassword' });

const router = useRouter();
const turnstileToken = ref('');
const loading = ref(false);

const sent = ref(false);
const sentEmail = ref('');
const resending = ref(false);

// 「重新发送」单独用一道人机验证：Turnstile 的 token 是一次性的，
// 首发的那个已经用掉了，这里必须让用户重新过一遍。
const resendToken = ref('');
const resendWidgetRef = ref<InstanceType<typeof TurnstileWidget>>();

const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

const [Form, formApi] = useVbenForm({
  commonConfig: { hideLabel: true, hideRequiredMark: true },
  schema: [
    {
      component: 'VbenInput',
      componentProps: {
        autocomplete: 'email',
        placeholder: 'your@email.com',
        type: 'email',
      },
      fieldName: 'email',
      rules: z.string().email({ message: '请输入有效的邮箱地址' }),
    },
  ],
  showDefaultActions: false,
});

async function handleSubmit() {
  const { valid } = await formApi.validate();
  if (!valid) return;

  if (siteKey && !turnstileToken.value) {
    message.warning('请完成人机验证');
    return;
  }

  loading.value = true;
  try {
    const values = await formApi.getValues();
    await forgotPasswordApi({
      email: values.email,
      turnstile_token: turnstileToken.value || undefined,
    });
    sentEmail.value = values.email;
    sent.value = true;
  } catch {
    message.error('发送失败，请稍后重试');
  } finally {
    loading.value = false;
  }
}

async function handleResend() {
  if (!sentEmail.value) return;

  if (siteKey && !resendToken.value) {
    message.warning('请完成人机验证');
    return;
  }

  resending.value = true;
  try {
    await forgotPasswordApi({
      email: sentEmail.value,
      turnstile_token: resendToken.value || undefined,
    });
    message.success('重置邮件已重新发送');
  } catch {
    // error handled by interceptor
  } finally {
    // 无论成败都换一道新题：token 可能已经被服务端消费掉（一次性的），
    // 留着它只会让用户下一次点击必然失败。reset 之后要到下次 verified 才有新值。
    resendToken.value = '';
    resendWidgetRef.value?.reset();
    resending.value = false;
  }
}
</script>

<template>
  <div class="p-6">
    <!-- Form state -->
    <template v-if="!sent">
      <div class="mb-4 text-center">
        <h2 class="text-xl font-semibold">
          {{ $t('authentication.forgetPassword') }}
        </h2>
        <p class="mt-1 text-sm text-gray-500">
          输入注册邮箱，我们将发送重置链接
        </p>
      </div>

      <Form />

      <div v-if="siteKey" class="mb-4 flex justify-center">
        <TurnstileWidget
          :site-key="siteKey"
          @verified="(t: string) => (turnstileToken = t)"
          @expired="turnstileToken = ''"
          @error="turnstileToken = ''"
        />
      </div>

      <VbenButton :loading="loading" class="w-full" @click="handleSubmit">
        发送重置邮件
      </VbenButton>

      <div class="mt-4 text-center text-sm">
        <span
          class="vben-link cursor-pointer text-sm"
          @click="router.push('/auth/login')"
        >
          返回登录
        </span>
      </div>
    </template>

    <!-- Sent state -->
    <template v-else>
      <div class="text-center">
        <h2 class="mb-2 text-xl font-semibold">邮件已发送 📧</h2>
        <p class="text-sm text-gray-500">
          重置链接已发送至
          <span class="font-medium text-gray-700">{{ sentEmail }}</span>
        </p>
        <p class="mt-1 text-sm text-gray-400">请查收邮件并点击链接重置密码</p>
      </div>

      <div class="mt-6 space-y-3">
        <div v-if="siteKey" class="flex justify-center">
          <TurnstileWidget
            ref="resendWidgetRef"
            :site-key="siteKey"
            @error="resendToken = ''"
            @expired="resendToken = ''"
            @verified="(t: string) => (resendToken = t)"
          />
        </div>

        <VbenButton
          :loading="resending"
          class="w-full"
          variant="outline"
          @click="handleResend"
        >
          重新发送重置邮件
        </VbenButton>

        <VbenButton class="w-full" @click="router.push('/auth/login')">
          返回登录
        </VbenButton>
      </div>
    </template>
  </div>
</template>
