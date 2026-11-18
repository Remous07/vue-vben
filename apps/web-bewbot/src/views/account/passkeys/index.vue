<script lang="ts" setup>
import type { AuthApi } from '#/api';

import { computed, onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, Empty, Input, message, Modal, Spin } from 'ant-design-vue';

import { deletePasskeyApi, listPasskeysApi } from '#/api';
import { useAuthStore } from '#/store';
import { formatBeijingDateTime } from '#/utils/datetime';
import { describePasskeyError, passkeySupported } from '#/utils/passkey';

defineOptions({ name: 'Passkeys' });

const authStore = useAuthStore();
const items = ref<AuthApi.PasskeyItem[]>([]);
const loading = ref(false);
const supported = passkeySupported();

// 添加
const addVisible = ref(false);
const addName = ref('');
const adding = ref(false);

// 删除
const deleteTarget = ref<AuthApi.PasskeyItem | null>(null);
const deletePassword = ref('');
const deleteVisible = ref(false);
const deleting = ref(false);

const canAdd = computed(() => supported);

async function load() {
  loading.value = true;
  try {
    items.value = await listPasskeysApi();
  } finally {
    loading.value = false;
  }
}

function openAdd() {
  addName.value = '';
  addVisible.value = true;
}

async function confirmAdd() {
  adding.value = true;
  try {
    await authStore.authPasskeyRegister(addName.value.trim() || undefined);
    addVisible.value = false;
    message.success('已添加通行密钥');
    await load();
  } catch (error) {
    // 浏览器侧的取消/超时等：给一句人话，弹窗留着让用户重试。
    // 后端错误由拦截器按 detail 弹，这里不重复。
    const text = describePasskeyError(error);
    if (text) {
      message.warning(text);
    }
  } finally {
    adding.value = false;
  }
}

function askDelete(item: AuthApi.PasskeyItem) {
  deleteTarget.value = item;
  deletePassword.value = '';
  deleteVisible.value = true;
}

async function confirmDelete() {
  if (!deleteTarget.value) return;
  deleting.value = true;
  try {
    await deletePasskeyApi(deleteTarget.value.id, deletePassword.value);
    deleteVisible.value = false;
    message.success('已删除');
    await load();
  } finally {
    deleting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <Page
    description="用指纹、面容或设备 PIN 完成第二因子验证，不怕钓鱼，也不用抄验证码。"
    title="通行密钥"
  >
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p class="text-muted-foreground text-sm">
        通行密钥保存在你的设备或密码管理器里，服务器只保存公钥。
      </p>
      <Button
        :disabled="!canAdd"
        :loading="adding"
        type="primary"
        @click="openAdd"
      >
        <IconifyIcon class="mr-1" icon="lucide:plus" />
        添加通行密钥
      </Button>
    </div>

    <div
      v-if="!supported"
      class="border-border text-muted-foreground mb-4 rounded-lg border p-3 text-sm"
    >
      当前浏览器不支持通行密钥（需要 HTTPS 或 localhost，且浏览器实现了
      WebAuthn）。你仍然可以使用身份验证器完成两步验证。
    </div>

    <Spin :spinning="loading">
      <div v-if="items.length === 0" class="py-16 text-center">
        <Empty description="还没有添加通行密钥">
          <p class="text-muted-foreground mb-4 text-xs">
            添加之后，登录时可以用指纹或面容代替验证码。
          </p>
        </Empty>
      </div>

      <div v-else class="flex flex-col gap-2">
        <div
          v-for="item in items"
          :key="item.id"
          class="border-border bg-card flex items-start gap-3 rounded-lg border p-3"
        >
          <div
            class="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full"
          >
            <IconifyIcon class="size-4" icon="lucide:key-round" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="font-medium">{{ item.name }}</p>
            <p class="text-muted-foreground mt-1 text-xs">
              添加于 {{ formatBeijingDateTime(item.created_at) }}
              <template v-if="item.last_used_at">
                · 最近使用 {{ formatBeijingDateTime(item.last_used_at) }}
              </template>
              <template v-else>· 尚未使用</template>
            </p>
          </div>
          <Button danger size="small" type="link" @click="askDelete(item)">
            删除
          </Button>
        </div>
      </div>
    </Spin>

    <!-- 添加 -->
    <Modal
      v-model:open="addVisible"
      :confirm-loading="adding"
      ok-text="继续"
      title="添加通行密钥"
      @ok="confirmAdd"
    >
      <div class="text-muted-foreground mb-3 text-sm">
        点击「继续」后，浏览器会要求你用指纹、面容或设备 PIN
        确认；确认完成即添加成功。
      </div>
      <Input
        v-model:value="addName"
        :maxlength="64"
        placeholder="名称（可选），例如：MacBook Pro"
        @press-enter="confirmAdd"
      />
    </Modal>

    <!-- 删除 -->
    <Modal
      v-model:open="deleteVisible"
      :confirm-loading="deleting"
      ok-text="删除"
      ok-type="danger"
      title="删除通行密钥"
      @ok="confirmDelete"
    >
      <div class="mb-3 text-sm">
        要删除「<span class="font-medium">{{ deleteTarget?.name }}</span
        >」，请输入当前密码确认。
      </div>
      <div class="text-muted-foreground mb-3 text-xs">
        删除后需要用其他方式（例如验证码）完成第二因子验证。
      </div>
      <Input
        v-model:value="deletePassword"
        autocomplete="current-password"
        placeholder="当前密码"
        type="password"
        @press-enter="confirmDelete"
      />
    </Modal>
  </Page>
</template>
