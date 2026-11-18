<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useVbenForm, z } from '@vben-core/form-ui';
import { VbenButton } from '@vben-core/shadcn-ui';

import { QRCode } from 'ant-design-vue';

import { loginTotpSetupApi } from '#/api';
import { useAuthStore } from '#/store';

defineOptions({ name: 'TotpSetupRequired' });

const authStore = useAuthStore();
const router = useRouter();
const loading = ref(false);
const fetching = ref(true);
const setup = ref<null | { secret: string; uri: string }>(null);

const [Form, formApi] = useVbenForm({
  commonConfig: { hideLabel: true, hideRequiredMark: true },
  schema: [
    {
      component: 'VbenInput',
      componentProps: {
        placeholder: '请输入验证器上的 6 位验证码',
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

onMounted(async () => {
  // 临时令牌只在内存里：刷新页面就得重新走一遍密码
  if (!authStore.totpTempToken) {
    await router.push('/auth/login');
    return;
  }
  try {
    setup.value = await loginTotpSetupApi(authStore.totpTempToken);
  } catch {
    // 令牌过期 / 无效：留在本页什么也做不了
    await router.push('/auth/login');
  } finally {
    fetching.value = false;
  }
});

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
    await authStore.authTotpEnable(values.code);
  } catch (error) {
    // 失败文案由拦截器按后端 detail 弹出（码错误 / 尝试次数过多…）。只有「这次
    // 登录凭证已经没用」的情况才回登录页：401/403 令牌失效，429 被退避。
    backToLoginIfFatal(error);
  } finally {
    loading.value = false;
  }
}

/** 用通行密钥满足强制策略：注册成功即完成第二因子，直接进面板。 */
async function handlePasskey() {
  loading.value = true;
  try {
    await authStore.authPasskeyRegister('通行密钥');
  } catch (error) {
    backToLoginIfFatal(error);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="flex h-full items-center justify-center p-6">
    <div class="w-full max-w-md">
      <div class="mb-6 text-center">
        <h2 class="text-xl font-semibold">设置第二因子</h2>
        <p class="mt-2 text-sm text-gray-500">
          你的账号拥有较高权限，必须先绑定身份验证器或通行密钥才能继续使用。
        </p>
      </div>

      <div class="border-border mb-6 rounded-lg border p-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="font-medium">使用通行密钥</p>
            <p class="text-xs text-gray-500">
              指纹、面容或设备 PIN，不怕钓鱼，也不用抄验证码
            </p>
          </div>
          <VbenButton
            :loading="loading"
            class="shrink-0"
            variant="outline"
            @click="handlePasskey"
          >
            注册
          </VbenButton>
        </div>
      </div>

      <div class="mb-3 text-center text-xs text-gray-400">
        或者使用身份验证器
      </div>

      <div v-if="fetching" class="py-10 text-center text-sm text-gray-500">
        正在生成密钥…
      </div>

      <template v-else-if="setup">
        <div class="flex justify-center">
          <QRCode :size="170" :value="setup.uri" />
        </div>
        <p class="mt-3 text-center text-xs text-gray-500">
          用身份验证器（Google Authenticator、Microsoft Authenticator
          等）扫描上方二维码
        </p>
        <p class="mt-2 text-center text-xs text-gray-500">
          无法扫码时手动输入：<code class="select-all">{{ setup.secret }}</code>
        </p>

        <div class="mt-6">
          <Form />
        </div>

        <VbenButton
          :loading="loading"
          class="mt-4 w-full"
          @click="handleSubmit"
        >
          启用并登录
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
