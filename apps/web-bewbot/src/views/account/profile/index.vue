<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { usePreferences } from '@vben/preferences';
import { useAccessStore, useUserStore } from '@vben/stores';

import {
  Button,
  Card,
  Col,
  Descriptions,
  Input,
  message,
  Modal,
  QRCode,
  Result,
  Row,
  Space,
  Spin,
  Tag,
} from 'ant-design-vue';

import {
  changeEmailApi,
  changePasswordApi,
  changeUsernameApi,
  deleteAccountApi,
  getConversationCodeApi,
  getTelegramBindStatusApi,
  getTotpStatusApi,
  resendEmailChangeApi,
  setConversationCodeApi,
  setSystemSettingApi,
  setupTelegramBindApi,
  totpDisableApi,
  totpEnableApi,
  totpSetupApi,
  unbindTelegramApi,
} from '#/api/core';
import { useAuthStore } from '#/store';
import { formatBeijingDateTime } from '#/utils/datetime';

defineOptions({ name: 'Profile' });

const router = useRouter();
const userStore = useUserStore();
const authStore = useAuthStore();
const { isDark } = usePreferences();
const userInfo = userStore.userInfo;
const loading = ref(false);

function avatarChar(name: string): string {
  const match = name.match(/\p{L}/u);
  return match ? match[0].toUpperCase() : '?';
}

function avatarColor(id: number, name: string): string {
  // Base hue from admin id — stable, never changes
  const base = Math.trunc((id * 2_654_435_761) % 4_294_967_296) % 360;
  // Name adds ±10° fine-tuning
  let offset = 0;
  for (const ch of name)
    offset = Math.trunc((offset << 5) - offset + (ch.codePointAt(0) ?? 0));
  const hue = (base + (offset % 20) - 10 + 360) % 360;
  return `hsl(${hue}, 50%, 40%)`;
}

// Change email
const emailVisible = ref(false);
const emailCurrentPwd = ref('');
const newEmail = ref('');
const emailTotpCode = ref('');
const savingEmail = ref(false);
const resendingEmail = ref(false);

async function handleChangeEmail() {
  if (newEmail.value === userInfo?.email) {
    message.error('新邮箱不能与当前邮箱相同');
    return;
  }
  savingEmail.value = true;
  try {
    const r = await changeEmailApi(
      emailCurrentPwd.value,
      newEmail.value,
      emailTotpCode.value || undefined,
    );
    // Update userInfo with pending email for UI
    if (userInfo) {
      (userInfo as any).pending_email = r.pending_email;
    }
    message.success('验证邮件已发送，请查收邮件并点击链接确认');
    emailVisible.value = false;
    emailCurrentPwd.value = '';
    newEmail.value = '';
  } catch {
    // error handled by interceptor
  } finally {
    savingEmail.value = false;
  }
}

async function handleResendEmail() {
  resendingEmail.value = true;
  try {
    await resendEmailChangeApi();
    message.success('验证邮件已重新发送');
  } catch {
    // error handled by interceptor
  } finally {
    resendingEmail.value = false;
  }
}

// Change username
const usernameVisible = ref(false);
const usernameCurrentPwd = ref('');
const newUsername = ref('');
const usernameTotpCode = ref('');
const savingUsername = ref(false);

function openUsernameModal() {
  usernameCurrentPwd.value = '';
  newUsername.value = '';
  usernameTotpCode.value = '';
  usernameVisible.value = true;
}

async function handleChangeUsername() {
  savingUsername.value = true;
  try {
    await changeUsernameApi(
      usernameCurrentPwd.value,
      newUsername.value,
      usernameTotpCode.value || undefined,
    );
    // Update userInfo
    if (userInfo) {
      userInfo.username = newUsername.value;
    }
    message.success('用户名已修改');
    usernameVisible.value = false;
  } catch {
    // error handled by interceptor
  } finally {
    savingUsername.value = false;
  }
}

// Change password
const passwordVisible = ref(false);
const currentPwd = ref('');
const newPwd = ref('');
const pwdTotpCode = ref('');
const savingPwd = ref(false);

function openChangePassword() {
  currentPwd.value = '';
  newPwd.value = '';
  pwdTotpCode.value = '';
  passwordVisible.value = true;
}

async function handleChangePassword() {
  savingPwd.value = true;
  try {
    const resp: any = await changePasswordApi(
      currentPwd.value,
      newPwd.value,
      pwdTotpCode.value || undefined,
    );
    // 改密码会使该账号所有旧 token 失效（其他设备被登出）；后端同时为当前
    // 设备换发了新 token，这里存下来，避免把自己也踢到登录页。
    if (resp?.accessToken) {
      useAccessStore().setAccessToken(resp.accessToken);
    }
    message.success('密码已修改');
    passwordVisible.value = false;
  } catch {
    message.error('修改失败');
  } finally {
    savingPwd.value = false;
  }
}

// TOTP
const totpEnabled = ref(false);
const totpVisible = ref(false);
const disableVisible = ref(false);
const setupData = ref<null | { secret: string; uri: string }>(null);
const totpCode = ref('');
// 开关两步验证都要当前密码：和改密码/改邮箱/注销同门槛（后端 _confirm_totp_change）
const totpPassword = ref('');
const savingTotp = ref(false);

// Telegram binding
const tgBound = ref(false);
const tgId = ref<null | number>(null);
const tgFirstName = ref<null | string>(null);
const tgUsername = ref<null | string>(null);
const tgKey = ref('');
const tgLinking = ref(false);

async function fetchTgStatus() {
  try {
    const s = await getTelegramBindStatusApi();
    tgBound.value = s.is_bound;
    tgId.value = s.telegram_id;
    tgFirstName.value = s.telegram_first_name;
    tgUsername.value = s.telegram_username;
  } catch {
    // ignore
  }
}

async function handleSetupBind() {
  tgLinking.value = true;
  try {
    const r = await setupTelegramBindApi();
    tgKey.value = r.key;
    message.success('绑定密钥已生成，5 分钟内有效');
  } finally {
    tgLinking.value = false;
  }
}

function copyBindCommand() {
  navigator.clipboard.writeText(`/bind ${tgKey.value}`);
  message.success('已复制');
}

function copyBotUsername(username: string) {
  navigator.clipboard.writeText(username);
  message.success('已复制');
}

function copySecret() {
  if (!setupData.value) return;
  navigator.clipboard.writeText(setupData.value.secret);
  message.success('密钥已复制');
}

// Bot username edit
const botUsernameEdit = ref(false);
const botUsernameInput = ref('');
const botUsernameSaving = ref(false);

function openBotUsernameEdit() {
  botUsernameInput.value = userInfo?.bot_username || '';
  botUsernameEdit.value = true;
}

async function handleSetBotUsername() {
  const val = botUsernameInput.value.trim();
  if (!val) {
    message.error('用户名不能为空');
    return;
  }
  if (!/^[a-zA-Z]\w{3,31}$/.test(val)) {
    message.error('格式不正确（4-32位、字母开头、仅字母数字下划线）');
    return;
  }
  botUsernameSaving.value = true;
  try {
    await setSystemSettingApi('bot_username', val);
    if (userInfo) {
      (userInfo as any).bot_username = val;
    }
    message.success('机器人用户名已更新');
    botUsernameEdit.value = false;
  } finally {
    botUsernameSaving.value = false;
  }
}

async function handleUnbind() {
  await unbindTelegramApi();
  message.success('已解绑');
  fetchTgStatus();
}

async function fetchTotpStatus() {
  const result = await getTotpStatusApi();
  totpEnabled.value = result.enabled;
}

async function handleTotpSetup() {
  const result = await totpSetupApi();
  setupData.value = result;
  totpCode.value = '';
  totpPassword.value = '';
  totpVisible.value = true;
}

async function handleTotpEnable() {
  savingTotp.value = true;
  try {
    await totpEnableApi(totpCode.value, totpPassword.value);
    message.success('TOTP 已启用');
    totpVisible.value = false;
    totpEnabled.value = true;
  } catch {
    // 失败文案由拦截器按后端的 detail 弹出（密码不对 / 验证码错误 / 尝试次数过多…）
  } finally {
    savingTotp.value = false;
  }
}

function openDisable() {
  totpCode.value = '';
  totpPassword.value = '';
  disableVisible.value = true;
}

async function handleTotpDisable() {
  savingTotp.value = true;
  try {
    await totpDisableApi(totpCode.value, totpPassword.value);
    message.success('TOTP 已关闭');
    disableVisible.value = false;
    totpEnabled.value = false;
  } catch {
    // 同上
  } finally {
    savingTotp.value = false;
  }
}

// Conversation code
const convCode = ref('');
const convCodeEdit = ref(false);
const convCodeInput = ref('');
const convCodeSaving = ref(false);

async function fetchConvCode() {
  try {
    const r = await getConversationCodeApi();
    convCode.value = r.code;
  } catch {
    // ignore
  }
}

function openConvCodeEdit() {
  convCodeInput.value = convCode.value;
  convCodeEdit.value = true;
}

function copyConvCode() {
  navigator.clipboard.writeText(convCode.value);
  message.success('已复制');
}

async function handleSetConvCode() {
  if (!convCodeInput.value) {
    message.error('识别码不能为空');
    return;
  }
  if (convCodeInput.value.length < 8 || convCodeInput.value.length > 16) {
    message.error('识别码长度需为 8-16 位');
    return;
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(convCodeInput.value)) {
    message.error('仅允许字母、数字、-、_');
    return;
  }
  convCodeSaving.value = true;
  try {
    const r = await setConversationCodeApi(convCodeInput.value);
    convCode.value = r.code;
    convCodeEdit.value = false;
    message.success('识别码已更新');
  } catch {
    // error handled by interceptor
  } finally {
    convCodeSaving.value = false;
  }
}

// Account deletion
const deleteVisible = ref(false);
const deletePassword = ref('');
const deleteTotpCode = ref('');
const deleting = ref(false);

async function handleDeleteAccount() {
  deleting.value = true;
  try {
    await deleteAccountApi(
      deletePassword.value,
      totpEnabled.value ? deleteTotpCode.value : undefined,
    );
    message.success('账户注销已申请，7天内重新登录可取消');
    deleteVisible.value = false;
    await authStore.logout(false);
  } catch {
    // error handled by interceptor
  } finally {
    deleting.value = false;
  }
}

onMounted(async () => {
  loading.value = true;
  await Promise.all([fetchTotpStatus(), fetchTgStatus(), fetchConvCode()]);
  loading.value = false;
});
</script>

<template>
  <Page>
    <Spin :spinning="loading">
      <div style="max-width: 920px">
        <!-- Profile header -->
        <div
          :style="{
            background: isDark
              ? 'linear-gradient(120deg, #1e293b 0%, #312e81 100%)'
              : 'linear-gradient(120deg, #e6f4ff 0%, #f9f0ff 100%)',
            borderColor: isDark ? '#334155' : '#f0f0f0',
          }"
          style="
            display: flex;
            gap: 16px;
            align-items: center;
            padding: 20px 24px;
            margin-bottom: 16px;
            border: 1px solid;
            border-radius: 12px;
          "
        >
          <div
            style="
              display: flex;
              flex-shrink: 0;
              align-items: center;
              justify-content: center;
              width: 56px;
              height: 56px;
              font-size: 24px;
              font-weight: 700;
              color: #fff;
              border-radius: 50%;
            "
            :style="{
              background: avatarColor(
                (userInfo as any)?.id ?? 0,
                userInfo?.username || '',
              ),
            }"
          >
            {{ avatarChar(userInfo?.username || '') }}
          </div>
          <div style="flex: 1; min-width: 0">
            <div
              :style="{
                fontSize: '18px',
                fontWeight: 600,
                color: isDark ? '#e5e7eb' : '#1d1d1d',
              }"
            >
              {{ userInfo?.username }}
            </div>
            <div
              :style="{
                marginTop: '2px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontSize: '13px',
                color: isDark ? '#94a3b8' : '#666',
                whiteSpace: 'nowrap',
              }"
            >
              {{ userInfo?.email || '-' }}
            </div>
            <div
              v-if="(userInfo as any)?.roles?.length"
              style="margin-top: 6px"
            >
              <Tag
                v-for="role in (userInfo as any).roles"
                :key="role"
                color="blue"
                style="margin-right: 4px"
              >
                {{ role }}
              </Tag>
            </div>
          </div>
        </div>

        <Row :gutter="[16, 16]">
          <Col :xs="24" :lg="12">
            <Card>
              <template #title>
                <Space :size="6">
                  <IconifyIcon icon="lucide:user" style="color: #1677ff" />
                  <span style="font-weight: 600">账户信息</span>
                </Space>
              </template>
              <Descriptions :column="1">
                <Descriptions.Item label="用户名">
                  {{ userInfo?.username }}
                  <Button
                    size="small"
                    type="link"
                    style="padding: 0; margin-left: 8px"
                    @click="openUsernameModal"
                  >
                    修改
                  </Button>
                </Descriptions.Item>
                <Descriptions.Item label="邮箱">
                  {{ userInfo?.email || '-' }}
                  <Button
                    size="small"
                    type="link"
                    style="margin-left: 8px"
                    @click="emailVisible = true"
                  >
                    修改
                  </Button>
                </Descriptions.Item>
                <Descriptions.Item
                  v-if="(userInfo as any)?.pending_email"
                  label="待验证邮箱"
                >
                  <div
                    style="
                      display: flex;
                      flex-direction: column;
                      gap: 6px;
                      min-width: 0;
                    "
                  >
                    <span
                      style="
                        line-height: 1.4;
                        color: hsl(var(--muted-foreground) / 80%);
                        word-break: break-all;
                      "
                    >
                      {{ (userInfo as any).pending_email }}
                    </span>
                    <Space :wrap="true" size="small">
                      <Tag color="orange">待验证</Tag>
                      <span
                        v-if="(userInfo as any).pending_email_expires_in"
                        style="font-size: 12px; color: #fa8c16"
                      >
                        {{ (userInfo as any).pending_email_expires_in }}
                        分钟后过期
                      </span>
                      <Button
                        size="small"
                        type="link"
                        :loading="resendingEmail"
                        @click="handleResendEmail"
                      >
                        重发邮件
                      </Button>
                    </Space>
                  </div>
                </Descriptions.Item>
                <Descriptions.Item label="注册时间">
                  {{
                    userInfo?.created_at
                      ? formatBeijingDateTime(userInfo.created_at)
                      : '-'
                  }}
                </Descriptions.Item>
              </Descriptions>
              <Button style="margin-top: 12px" @click="openChangePassword">
                修改密码
              </Button>
              <Button
                danger
                style="margin-top: 12px; margin-left: 8px"
                @click="deleteVisible = true"
              >
                注销账号
              </Button>
            </Card>
          </Col>
          <Col :xs="24" :lg="12">
            <Card style="height: 100%">
              <template #title>
                <Space :size="6">
                  <IconifyIcon icon="lucide:key-round" style="color: #fa8c16" />
                  <span style="font-weight: 600">对话识别码</span>
                </Space>
              </template>
              <template v-if="convCodeEdit">
                <div>
                  <label
                    style="font-size: 13px; color: hsl(var(--muted-foreground))"
                    >主识别码</label
                  >
                  <div style="display: flex; gap: 8px; margin-top: 6px">
                    <Input
                      v-model:value="convCodeInput"
                      placeholder="8-16位字母、数字、-、_"
                      :maxlength="16"
                      size="small"
                      style="flex: 1"
                    />
                    <Button
                      size="small"
                      type="primary"
                      :loading="convCodeSaving"
                      @click="handleSetConvCode"
                    >
                      保存
                    </Button>
                    <Button size="small" @click="convCodeEdit = false">
                      取消
                    </Button>
                  </div>
                </div>
              </template>
              <template v-else>
                <label
                  style="font-size: 13px; color: hsl(var(--muted-foreground))"
                  >主识别码</label
                >
                <div
                  style="
                    display: flex;
                    gap: 8px;
                    align-items: center;
                    margin-top: 6px;
                  "
                >
                  <code
                    style="
                      padding: 4px 10px;
                      font-size: 20px;
                      font-weight: bold;
                      color: hsl(var(--foreground));
                      background: hsl(var(--muted));
                      border-radius: 6px;
                    "
                  >
                    {{ convCode || '-' }}
                  </code>
                </div>
                <div style="display: flex; gap: 8px; margin-top: 16px">
                  <Button size="small" @click="copyConvCode">复制</Button>
                  <Button size="small" @click="openConvCodeEdit">修改</Button>
                  <Button
                    size="small"
                    type="primary"
                    ghost
                    @click="router.push({ name: 'ConversationCodes' })"
                  >
                    管理识别码
                  </Button>
                </div>
              </template>
            </Card>
          </Col>
        </Row>
        <Row :gutter="[16, 16]" style="margin-top: 16px">
          <Col :xs="24" :lg="12">
            <Card style="height: 100%">
              <template #title>
                <Space :size="6">
                  <IconifyIcon icon="lucide:send" style="color: #1677ff" />
                  <span style="font-weight: 600">Telegram 绑定</span>
                </Space>
              </template>
              <div
                v-if="
                  userInfo?.bot_username ||
                  userInfo?.permissions?.includes('bot:settings')
                "
                style="margin-bottom: 12px"
              >
                <span
                  style="
                    font-size: 13px;
                    color: hsl(var(--muted-foreground) / 80%);
                  "
                  >机器人</span
                >
                <template v-if="botUsernameEdit">
                  <Input
                    v-model:value="botUsernameInput"
                    placeholder="用户名（不含 @）"
                    :maxlength="32"
                    size="small"
                    style="width: 160px; margin-left: 8px"
                  />
                  <Button
                    size="small"
                    type="primary"
                    :loading="botUsernameSaving"
                    style="margin-left: 4px"
                    @click="handleSetBotUsername"
                  >
                    保存
                  </Button>
                  <Button
                    size="small"
                    style="margin-left: 4px"
                    @click="botUsernameEdit = false"
                  >
                    取消
                  </Button>
                </template>
                <template v-else>
                  <Space style="margin-left: 8px">
                    <template v-if="userInfo?.bot_username">
                      <a
                        :href="`https://t.me/${userInfo.bot_username}`"
                        target="_blank"
                        style="font-weight: 500"
                      >
                        @{{ userInfo.bot_username }}
                      </a>
                      <Button
                        size="small"
                        @click="copyBotUsername(userInfo.bot_username)"
                      >
                        复制
                      </Button>
                    </template>
                    <span
                      v-else
                      style="color: hsl(var(--muted-foreground) / 80%)"
                      >@未设置</span
                    >
                    <Button
                      v-if="userInfo?.permissions?.includes('bot:settings')"
                      size="small"
                      type="link"
                      @click="openBotUsernameEdit"
                    >
                      修改
                    </Button>
                  </Space>
                </template>
              </div>
              <template v-if="tgBound">
                <Descriptions :column="1" style="margin-bottom: 8px">
                  <Descriptions.Item label="TG 用户 ID">
                    {{ tgId }}
                  </Descriptions.Item>
                  <Descriptions.Item label="名称">
                    {{ tgFirstName }}
                  </Descriptions.Item>
                  <Descriptions.Item label="用户名">
                    {{ tgUsername || '-' }}
                  </Descriptions.Item>
                </Descriptions>
                <Button danger @click="handleUnbind">解绑</Button>
              </template>
              <template v-else>
                <p
                  style="
                    margin-bottom: 12px;
                    color: hsl(var(--muted-foreground) / 80%);
                  "
                >
                  未绑定 Telegram 账号
                </p>
                <Button
                  type="primary"
                  :loading="tgLinking"
                  @click="handleSetupBind"
                >
                  生成绑定密钥
                </Button>
                <div v-if="tgKey" style="margin-top: 8px">
                  <p
                    style="
                      font-size: 13px;
                      color: hsl(var(--muted-foreground) / 80%);
                    "
                  >
                    请在 Telegram 中使用 /bind 命令绑定：
                  </p>
                  <p style="margin-bottom: 4px">
                    <code style="font-size: 16px; font-weight: bold">
                      /bind {{ tgKey }}
                    </code>
                  </p>
                  <Space :wrap="true" size="small">
                    <Button size="small" @click="copyBindCommand">
                      复制指令
                    </Button>
                    <span style="font-size: 12px; color: #fa8c16">
                      ⏳ 密钥 5 分钟内有效
                    </span>
                  </Space>
                </div>
              </template>
            </Card>
          </Col>
          <Col :xs="24" :lg="12">
            <Card style="height: 100%">
              <template #title>
                <Space :size="6">
                  <IconifyIcon
                    icon="lucide:shield-check"
                    style="color: #52c41a"
                  />
                  <span style="font-weight: 600">两步验证</span>
                </Space>
              </template>
              <template v-if="totpEnabled">
                <Result
                  status="success"
                  title="已开启"
                  sub-title="您的账户已受到两步验证保护"
                >
                  <template #extra>
                    <Button danger @click="openDisable">关闭两步验证</Button>
                  </template>
                </Result>
              </template>
              <template v-else>
                <Result
                  status="info"
                  title="未开启"
                  sub-title="开启后将使用身份验证器保护您的账户"
                >
                  <template #extra>
                    <Button type="primary" @click="handleTotpSetup">
                      开启两步验证
                    </Button>
                  </template>
                </Result>
              </template>
            </Card>
          </Col>
        </Row>
      </div>
    </Spin>

    <!-- Change Email Modal -->
    <Modal
      v-model:open="emailVisible"
      @ok="handleChangeEmail"
      :confirm-loading="savingEmail"
      :width="440"
    >
      <template #title>
        <Space align="center" :size="8">
          <IconifyIcon
            icon="lucide:mail"
            style="font-size: 18px; color: #1677ff"
          />
          <span style="font-size: 16px; font-weight: 600">修改邮箱</span>
        </Space>
      </template>

      <form @submit.prevent="handleChangeEmail">
        <div style="margin-bottom: 16px">
          <label style="font-size: 13px; color: hsl(var(--muted-foreground))"
            >当前密码</label
          >
          <Input
            v-model:value="emailCurrentPwd"
            type="password"
            name="currentPassword"
            autocomplete="current-password"
            placeholder="请输入当前密码"
            style="margin-top: 6px"
          />
        </div>
        <div v-if="totpEnabled" style="margin-bottom: 16px">
          <label style="font-size: 13px; color: hsl(var(--muted-foreground))"
            >两步验证码</label
          >
          <Input
            v-model:value="emailTotpCode"
            name="totp"
            autocomplete="one-time-code"
            inputmode="numeric"
            placeholder="请输入 6 位验证码"
            :maxlength="6"
            style="margin-top: 6px"
          />
        </div>
        <div>
          <label style="font-size: 13px; color: hsl(var(--muted-foreground))"
            >新邮箱</label
          >
          <Input
            v-model:value="newEmail"
            type="email"
            name="newEmail"
            autocomplete="email"
            placeholder="请输入新邮箱"
            style="margin-top: 6px"
          />
        </div>
      </form>
    </Modal>

    <!-- Change Username Modal -->
    <Modal
      v-model:open="usernameVisible"
      :confirm-loading="savingUsername"
      @ok="handleChangeUsername"
      :width="440"
    >
      <template #title>
        <Space align="center" :size="8">
          <IconifyIcon
            icon="lucide:user-pen"
            style="font-size: 18px; color: #1677ff"
          />
          <span style="font-size: 16px; font-weight: 600">修改用户名</span>
        </Space>
      </template>

      <div style="margin-bottom: 16px">
        <label style="font-size: 13px; color: hsl(var(--muted-foreground))"
          >当前密码</label
        >
        <Input.Password
          v-model:value="usernameCurrentPwd"
          autocomplete="current-password"
          placeholder="请输入当前密码"
          style="margin-top: 6px"
        />
      </div>
      <div v-if="totpEnabled" style="margin-bottom: 16px">
        <label style="font-size: 13px; color: hsl(var(--muted-foreground))"
          >两步验证码</label
        >
        <Input
          v-model:value="usernameTotpCode"
          autocomplete="one-time-code"
          inputmode="numeric"
          placeholder="6位验证码"
          :maxlength="6"
          style="margin-top: 6px"
        />
      </div>
      <div style="margin-bottom: 16px">
        <label style="font-size: 13px; color: hsl(var(--muted-foreground))">
          新用户名（3-10位字母、数字、-、_）
        </label>
        <Input
          v-model:value="newUsername"
          placeholder="新用户名"
          :maxlength="10"
          style="margin-top: 6px"
        />
      </div>
    </Modal>

    <!-- Change Password Modal -->
    <Modal
      v-model:open="passwordVisible"
      @ok="handleChangePassword"
      :confirm-loading="savingPwd"
      :width="440"
    >
      <template #title>
        <Space align="center" :size="8">
          <IconifyIcon
            icon="lucide:lock"
            style="font-size: 18px; color: #1677ff"
          />
          <span style="font-size: 16px; font-weight: 600">修改密码</span>
        </Space>
      </template>

      <div style="margin-bottom: 16px">
        <label style="font-size: 13px; color: hsl(var(--muted-foreground))"
          >当前密码</label
        >
        <Input
          v-model:value="currentPwd"
          type="password"
          autocomplete="current-password"
          placeholder="请输入当前密码"
          style="margin-top: 6px"
        />
      </div>
      <div v-if="totpEnabled" style="margin-bottom: 16px">
        <label style="font-size: 13px; color: hsl(var(--muted-foreground))"
          >两步验证码</label
        >
        <Input
          v-model:value="pwdTotpCode"
          autocomplete="one-time-code"
          inputmode="numeric"
          placeholder="请输入 6 位验证码"
          :maxlength="6"
          style="margin-top: 6px"
        />
      </div>
      <div>
        <label style="font-size: 13px; color: hsl(var(--muted-foreground))"
          >新密码</label
        >
        <Input
          v-model:value="newPwd"
          type="password"
          autocomplete="new-password"
          placeholder="请输入新密码（至少6位）"
          style="margin-top: 6px"
        />
      </div>
    </Modal>

    <!-- TOTP Setup Modal -->
    <Modal v-model:open="totpVisible" :footer="null" :width="420">
      <template #title>
        <Space align="center" :size="8">
          <IconifyIcon
            icon="lucide:shield-check"
            style="font-size: 18px; color: #52c41a"
          />
          <span style="font-size: 16px; font-weight: 600">设置两步验证</span>
        </Space>
      </template>

      <div v-if="setupData">
        <div style="margin-bottom: 16px; text-align: center">
          <p
            style="
              margin-bottom: 12px;
              font-size: 13px;
              color: hsl(var(--muted-foreground));
            "
          >
            使用身份验证器扫描二维码，或手动输入密钥
          </p>
          <div style="display: flex; justify-content: center">
            <QRCode :value="setupData.uri" :size="170" />
          </div>
        </div>

        <!-- Secret with copy -->
        <div style="margin-bottom: 16px">
          <label style="font-size: 13px; color: hsl(var(--muted-foreground))"
            >验证器密钥</label
          >
          <div
            style="
              display: flex;
              gap: 8px;
              align-items: center;
              margin-top: 6px;
            "
          >
            <code
              style="
                flex: 1;
                padding: 6px 10px;
                font-size: 14px;
                color: hsl(var(--foreground));
                word-break: break-all;
                background: hsl(var(--muted));
                border-radius: 6px;
              "
            >
              {{ setupData.secret }}
            </code>
            <Button size="small" @click="copySecret">
              <IconifyIcon
                icon="lucide:copy"
                style="margin-right: 4px; vertical-align: -1px"
              />
              复制
            </Button>
          </div>
        </div>

        <div style="margin-bottom: 16px">
          <label style="font-size: 13px; color: hsl(var(--muted-foreground))"
            >当前密码</label
          >
          <Input.Password
            v-model:value="totpPassword"
            autocomplete="current-password"
            placeholder="当前密码"
            style="margin-top: 6px"
          />
        </div>

        <div style="margin-bottom: 16px">
          <label style="font-size: 13px; color: hsl(var(--muted-foreground))"
            >验证码</label
          >
          <Input
            v-model:value="totpCode"
            autocomplete="one-time-code"
            inputmode="numeric"
            placeholder="输入 6 位验证码"
            :maxlength="6"
            style="margin-top: 6px"
          />
        </div>
        <Button
          type="primary"
          block
          :loading="savingTotp"
          @click="handleTotpEnable"
        >
          验证并启用
        </Button>
      </div>
    </Modal>

    <!-- Delete Account Modal -->
    <Modal
      v-model:open="deleteVisible"
      @ok="handleDeleteAccount"
      :confirm-loading="deleting"
      ok-text="确认注销"
      ok-type="danger"
      cancel-text="取消"
      :width="440"
    >
      <template #title>
        <Space align="center" :size="8">
          <IconifyIcon
            icon="lucide:trash-2"
            style="font-size: 18px; color: #ff4d4f"
          />
          <span style="font-size: 16px; font-weight: 600">注销账号</span>
        </Space>
      </template>

      <div
        style="
          padding: 12px;
          margin-bottom: 16px;
          font-size: 13px;
          color: hsl(var(--foreground));
          background: hsl(var(--destructive) / 12%);
          border: 1px solid hsl(var(--destructive) / 25%);
          border-radius: var(--radius);
        "
      >
        <div>
          注销后您的账号将进入 <b>7 天冷静期</b>，期间重新登录可取消注销。
        </div>
        <div style="margin-top: 4px">
          冷静期结束后账号将被永久删除，所有数据不可恢复。
        </div>
      </div>
      <form @submit.prevent="handleDeleteAccount">
        <div>
          <label style="font-size: 13px; color: hsl(var(--muted-foreground))"
            >请输入密码确认</label
          >
          <Input
            v-model:value="deletePassword"
            type="password"
            name="currentPassword"
            autocomplete="current-password"
            placeholder="请输入当前密码"
            style="margin-top: 6px"
          />
        </div>
        <template v-if="totpEnabled">
          <div style="margin-top: 12px">
            <label style="font-size: 13px; color: hsl(var(--muted-foreground))"
              >两步验证码</label
            >
            <Input
              v-model:value="deleteTotpCode"
              name="totp"
              autocomplete="one-time-code"
              inputmode="numeric"
              placeholder="请输入 6 位验证码"
              :maxlength="6"
              style="margin-top: 6px"
            />
          </div>
        </template>
      </form>
    </Modal>

    <!-- TOTP Disable Modal -->
    <Modal
      v-model:open="disableVisible"
      title="关闭两步验证"
      @ok="handleTotpDisable"
      :confirm-loading="savingTotp"
    >
      <Input.Password
        v-model:value="totpPassword"
        autocomplete="current-password"
        placeholder="当前密码"
        style="margin-bottom: 12px"
      />
      <Input
        v-model:value="totpCode"
        autocomplete="one-time-code"
        inputmode="numeric"
        placeholder="输入当前验证码以确认关闭"
        :maxlength="6"
      />
    </Modal>
  </Page>
</template>
