<script lang="ts" setup>
import type { AuthApi } from '#/api';

import { onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';

import {
  Button,
  Empty,
  Input,
  message,
  Modal,
  Spin,
  Table,
} from 'ant-design-vue';

import { deletePasskeyApi, listPasskeysApi } from '#/api';
import { useAuthStore } from '#/store';
import { formatBeijingDateTime } from '#/utils/datetime';

defineOptions({ name: 'Passkeys' });

const authStore = useAuthStore();
const items = ref<AuthApi.PasskeyItem[]>([]);
const loading = ref(false);
const adding = ref(false);

const deleteTarget = ref<AuthApi.PasskeyItem | null>(null);
const deletePassword = ref('');
const deleteVisible = ref(false);
const deleting = ref(false);

async function load() {
  loading.value = true;
  try {
    items.value = await listPasskeysApi();
  } finally {
    loading.value = false;
  }
}

async function handleAdd() {
  adding.value = true;
  try {
    await authStore.authPasskeyRegister(`通行密钥 ${items.value.length + 1}`);
    message.success('已添加通行密钥');
    await load();
  } catch {
    // 失败文案由拦截器按后端 detail 弹出；用户在系统弹窗里取消也会走到这里，
    // 那是正常操作，不补错误提示。
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
    message.success('已删除');
    deleteVisible.value = false;
    await load();
  } finally {
    deleting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <Page
    description="通行密钥使用指纹、面容或设备 PIN 完成验证，和身份验证器一样可以满足第二因子要求。"
    title="通行密钥"
  >
    <div style="margin-bottom: 16px">
      <Button type="primary" :loading="adding" @click="handleAdd">
        添加通行密钥
      </Button>
    </div>

    <Spin :spinning="loading">
      <Empty v-if="items.length === 0" description="还没有添加通行密钥" />

      <Table v-else :data-source="items" :pagination="false" row-key="id">
        <Table.Column title="名称" data-index="name" key="name" />
        <Table.Column title="添加时间" key="created_at">
          <template #default="{ record }">
            {{
              formatBeijingDateTime((record as AuthApi.PasskeyItem).created_at)
            }}
          </template>
        </Table.Column>
        <Table.Column title="最后使用" key="last_used_at">
          <template #default="{ record }">
            {{
              formatBeijingDateTime(
                (record as AuthApi.PasskeyItem).last_used_at,
              )
            }}
          </template>
        </Table.Column>
        <Table.Column title="操作" key="action" :width="100">
          <template #default="{ record }">
            <Button
              danger
              size="small"
              type="link"
              @click="askDelete(record as AuthApi.PasskeyItem)"
            >
              删除
            </Button>
          </template>
        </Table.Column>
      </Table>
    </Spin>

    <Modal
      v-model:open="deleteVisible"
      title="删除通行密钥"
      :confirm-loading="deleting"
      @ok="confirmDelete"
    >
      <p style="margin-bottom: 12px">
        要删除「{{ deleteTarget?.name }}」，请输入当前密码确认。
      </p>
      <Input
        v-model:value="deletePassword"
        type="password"
        autocomplete="current-password"
        placeholder="当前密码"
        @press-enter="confirmDelete"
      />
    </Modal>
  </Page>
</template>
