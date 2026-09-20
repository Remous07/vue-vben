<script lang="ts" setup>
import type { Recordable } from '@vben/types';

import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useVbenForm, z } from '@vben-core/form-ui';
import { VbenButton } from '@vben-core/shadcn-ui';

import { message } from 'ant-design-vue';

import { resetPasswordApi } from '#/api/core';

defineOptions({ name: 'ResetPassword' });

const route = useRoute();
const router = useRouter();
const loading = ref(false);

const token = (route.query.token as string) || '';

const [Form, formApi] = useVbenForm({
  commonConfig: { hideLabel: true, hideRequiredMark: true },
  schema: [
    {
      component: 'VbenInputPassword',
      componentProps: {
        autocomplete: 'new-password',
        placeholder: '请输入新密码',
      },
      fieldName: 'new_password',
      rules: z.string().min(6, { message: '密码至少 6 个字符' }).max(128),
    },
    {
      component: 'VbenInputPassword',
      componentProps: {
        autocomplete: 'new-password',
        placeholder: '请再次输入新密码',
      },
      fieldName: 'confirmPassword',
      rules: z.string().refine(
        async (val) => {
          const values = (await formApi?.getValues()) as
            | Recordable<any>
            | undefined;
          return val === values?.new_password;
        },
        { message: '两次输入的密码不一致' },
      ),
    },
  ],
  showDefaultActions: false,
});

async function handleSubmit() {
  const { valid } = await formApi.validate();
  if (!valid) return;

  if (!token) {
    message.error('无效的重置链接');
    return;
  }

  loading.value = true;
  try {
    const values = await formApi.getValues();
    await resetPasswordApi({
      new_password: values.new_password,
      token,
    });
    message.success('密码已重置，请使用新密码登录');
    router.push('/auth/login');
  } catch {
    // 失败文案由拦截器按后端的 detail 弹出（「重置链接无效或已过期」），这里不再
    // 补一条意思相近的——两句话会一起弹出来。链接是一次性的，重复使用就会走到
    // 这条 400，那句话正是用户需要看到的解释。
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="p-6">
    <div class="mb-4 text-center">
      <h2 class="text-xl font-semibold">设置新密码</h2>
      <p class="mt-1 text-sm text-gray-500">
        {{ token ? '请输入您的新密码' : '无效的重置链接' }}
      </p>
    </div>

    <Form v-if="token" />

    <VbenButton
      v-if="token"
      :loading="loading"
      class="w-full"
      @click="handleSubmit"
    >
      重置密码
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
</template>
