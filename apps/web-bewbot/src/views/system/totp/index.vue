<script lang="ts" setup>
import { onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';

import {
  Button,
  Input,
  message,
  Modal,
  QRCode,
  Result,
  Spin,
} from 'ant-design-vue';

import {
  getTotpStatusApi,
  totpDisableApi,
  totpEnableApi,
  totpSetupApi,
} from '#/api/core';

defineOptions({ name: 'TotpSetup' });

const enabled = ref(false);
const loading = ref(true);
const setupVisible = ref(false);
const disableVisible = ref(false);
const setupData = ref<null | { secret: string; uri: string }>(null);
const verifyCode = ref('');
// 开关两步验证都要当前密码：它和改密码/改邮箱/注销同门槛（后端 _confirm_totp_change）
const password = ref('');
const saving = ref(false);

async function fetchStatus() {
  loading.value = true;
  try {
    const result = await getTotpStatusApi();
    enabled.value = result.enabled;
  } finally {
    loading.value = false;
  }
}

async function handleSetup() {
  const result = await totpSetupApi();
  setupData.value = result;
  verifyCode.value = '';
  setupVisible.value = true;
}

async function handleEnable() {
  saving.value = true;
  try {
    await totpEnableApi(verifyCode.value, password.value);
    message.success('TOTP 已启用');
    setupVisible.value = false;
    enabled.value = true;
  } catch {
    // 失败文案由拦截器按后端的 detail 弹出（密码不对 / 验证码错误 / 尝试次数过多…）。
    // 原来这里补一条笼统的「验证码错误」会和真实原因一起弹出、互相矛盾。
  } finally {
    saving.value = false;
  }
}

async function handleDisable() {
  saving.value = true;
  try {
    await totpDisableApi(verifyCode.value, password.value);
    message.success('TOTP 已关闭');
    disableVisible.value = false;
    enabled.value = false;
  } catch {
    // 同上
  } finally {
    saving.value = false;
  }
}

function openDisable() {
  verifyCode.value = '';
  password.value = '';
  disableVisible.value = true;
}

onMounted(fetchStatus);
</script>

<template>
  <Page>
    <Spin :spinning="loading">
      <Result
        v-if="enabled"
        status="success"
        title="两步验证已开启"
        sub-title="您的账户已受到两步验证保护"
      >
        <template #extra>
          <Button danger @click="openDisable">关闭两步验证</Button>
        </template>
      </Result>

      <Result
        v-else
        status="info"
        title="两步验证未开启"
        sub-title="开启后将使用身份验证器保护您的账户"
      >
        <template #extra>
          <Button type="primary" @click="handleSetup">开启两步验证</Button>
        </template>
      </Result>
    </Spin>

    <!-- Setup Modal -->
    <Modal
      v-model:open="setupVisible"
      title="设置两步验证"
      :footer="null"
      width="400"
    >
      <div v-if="setupData" style="text-align: center">
        <p style="margin-bottom: 12px">
          请使用身份验证器（如 Google Authenticator）扫描二维码
        </p>
        <div
          style="display: flex; justify-content: center; margin-bottom: 12px"
        >
          <QRCode :value="setupData.uri" :size="200" />
        </div>
        <p
          style="
            margin-bottom: 12px;
            font-size: 12px;
            color: hsl(var(--muted-foreground) / 80%);
          "
        >
          或手动输入密钥：<code>{{ setupData.secret }}</code>
        </p>
        <Input.Password
          v-model:value="password"
          autocomplete="current-password"
          placeholder="当前密码"
          style="margin-bottom: 12px"
        />
        <Input
          v-model:value="verifyCode"
          autocomplete="one-time-code"
          inputmode="numeric"
          placeholder="输入 6 位验证码"
          :maxlength="6"
          style="margin-bottom: 12px"
        />
        <Button type="primary" block :loading="saving" @click="handleEnable">
          验证并启用
        </Button>
      </div>
    </Modal>

    <!-- Disable Modal -->
    <Modal
      v-model:open="disableVisible"
      title="关闭两步验证"
      @ok="handleDisable"
      :confirm-loading="saving"
    >
      <Input.Password
        v-model:value="password"
        autocomplete="current-password"
        placeholder="当前密码"
        style="margin-bottom: 12px"
      />
      <Input
        v-model:value="verifyCode"
        autocomplete="one-time-code"
        inputmode="numeric"
        placeholder="输入当前验证码以确认关闭"
        :maxlength="6"
      />
    </Modal>
  </Page>
</template>
