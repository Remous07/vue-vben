<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { PermissionItem, RoleItem } from '#/api/core';

import { computed, onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { usePreferences } from '@vben/preferences';

import {
  Button,
  Checkbox,
  Collapse,
  Input,
  message,
  Modal,
  Space,
  Table,
  Tag,
  Tooltip,
} from 'ant-design-vue';

import {
  createRoleApi,
  deleteRoleApi,
  getPermissionsApi,
  getRolesApi,
  getSystemSettingsBatchApi,
  updateRoleApi,
} from '#/api/core';
import { formatBeijingDateTime } from '#/utils/datetime';

defineOptions({ name: 'RoleManagement' });

const { isDark } = usePreferences();

const roles = ref<RoleItem[]>([]);
const permissions = ref<PermissionItem[]>([]);
const loading = ref(false);
const fallbackRoleId = ref<null | number>(null);

const modalVisible = ref(false);
const editingRole = ref<null | RoleItem>(null);
const formName = ref('');
const formRemark = ref('');
const formPermissionIds = ref<number[]>([]);
const activePermGroups = ref<string[]>([]);
const activeSubKeys = ref<string[]>([]);
const saving = ref(false);

const isEditing = computed(() => !!editingRole.value);

const dimTextStyle = computed(() => ({
  fontSize: '13px',
  color: isDark.value ? 'rgba(255,255,255,0.6)' : '#666',
}));

// 顶层分组及其子分组划分。多子分组的分组（机器人功能/系统权限）渲染为
// 可折叠子分组；其余单子分组（个人设置等）平铺展示。
const GROUP_SUB_PREFIXES: Record<string, string[]> = {
  system: [
    'dashboard',
    'admin',
    'users',
    'registration',
    'invite',
    'audit',
    'bot',
  ],
  bot_features: ['messages', 'conversation', 'visitors'],
};

const PREFIX_TO_GROUP: Record<string, string> = {};
for (const [group, prefixes] of Object.entries(GROUP_SUB_PREFIXES)) {
  for (const prefix of prefixes) {
    PREFIX_TO_GROUP[prefix] = group;
  }
}

function groupOf(code: string): string {
  const prefix = code.split(':')[0] || 'other';
  return PREFIX_TO_GROUP[prefix] || prefix;
}

const CATEGORY_LABELS: Record<string, string> = {
  bot_features: '机器人功能',
  system: '系统权限',
  profile: '个人设置',
};

const CATEGORY_ICONS: Record<string, string> = {
  bot_features: 'lucide:bot',
  system: 'lucide:shield',
  profile: 'lucide:settings',
};

// 子分组标签与图标
const SUB_LABELS: Record<string, string> = {
  admin: '后台用户',
  audit: '日志审计',
  bot: '机器人设置',
  conversation: '对话',
  dashboard: '仪表盘',
  invite: '邀请码',
  messages: '消息',
  registration: '注册设置',
  users: 'TG用户',
  visitors: '访客',
};

const SUB_ICONS: Record<string, string> = {
  admin: 'lucide:shield',
  audit: 'lucide:scroll-text',
  bot: 'lucide:bot',
  conversation: 'lucide:message-circle',
  dashboard: 'lucide:layout-dashboard',
  invite: 'lucide:gift',
  messages: 'lucide:message-square',
  registration: 'lucide:user-plus',
  users: 'lucide:users',
  visitors: 'lucide:ban',
};

interface PermSubGroup {
  icon: string;
  key: string;
  label: string;
  perms: PermissionItem[];
}

function toSubGroup(key: string, perms: PermissionItem[]): PermSubGroup {
  return {
    key,
    label: SUB_LABELS[key] || key,
    icon: SUB_ICONS[key] || 'lucide:folder',
    perms,
  };
}

function subGroupsFor(
  perms: PermissionItem[],
  groupKey: string,
): PermSubGroup[] {
  const prefixes = GROUP_SUB_PREFIXES[groupKey] || [];
  const groups: Record<string, PermissionItem[]> = {};
  for (const perm of perms) {
    const prefix = perm.code.split(':')[0] || 'other';
    (groups[prefix] ??= []).push(perm);
  }
  const ordered: PermSubGroup[] = [];
  for (const prefix of prefixes) {
    const subPerms = groups[prefix];
    if (subPerms) ordered.push(toSubGroup(prefix, subPerms));
  }
  return ordered;
}

const permissionGroups = computed(() => {
  const groups: Record<string, PermissionItem[]> = {};
  for (const perm of permissions.value) {
    const key = groupOf(perm.code);
    (groups[key] ??= []).push(perm);
  }
  return Object.entries(groups)
    .toSorted(([a], [b]) => {
      const labels = Object.keys(CATEGORY_LABELS);
      return labels.indexOf(a) - labels.indexOf(b);
    })
    .map(([key, perms]) => ({
      key,
      label: CATEGORY_LABELS[key] || key,
      icon: CATEGORY_ICONS[key] || 'lucide:folder',
      perms,
      subgroups: GROUP_SUB_PREFIXES[key]
        ? subGroupsFor(perms, key)
        : [toSubGroup(key, perms)],
    }));
});

function selectedCount(perms: PermissionItem[]): number {
  return perms.filter((p) => formPermissionIds.value.includes(p.id)).length;
}

function groupTagColor(perms: PermissionItem[]): string {
  const n = selectedCount(perms);
  if (n === 0) return 'default';
  return n === perms.length ? 'success' : 'processing';
}

function togglePermission(perm: PermissionItem) {
  const idx = formPermissionIds.value.indexOf(perm.id);
  formPermissionIds.value =
    idx === -1
      ? [...formPermissionIds.value, perm.id]
      : formPermissionIds.value.filter((id) => id !== perm.id);
}

// Sub-group keys for groups that render a nested Collapse (>1 subgroups).
function collapsibleSubKeys(): string[] {
  return permissionGroups.value
    .filter((g) => g.subgroups.length > 1)
    .flatMap((g) => g.subgroups.map((s) => s.key));
}

// "全部展开" considers both the top-level groups and any nested sub-groups,
// so the toggle reflects the real depth of the tree.
const allGroupsExpanded = computed(() => {
  const total = permissionGroups.value.length;
  const subKeys = collapsibleSubKeys();
  const topExpanded = total > 0 && activePermGroups.value.length === total;
  const subExpanded =
    subKeys.length === 0 || activeSubKeys.value.length === subKeys.length;
  return topExpanded && subExpanded;
});

function toggleAllGroups() {
  if (allGroupsExpanded.value) {
    activePermGroups.value = [];
    activeSubKeys.value = [];
  } else {
    activePermGroups.value = permissionGroups.value.map((g) => g.key);
    activeSubKeys.value = collapsibleSubKeys();
  }
}

const columns: TableColumnsType = [
  { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
  { title: '角色名称', dataIndex: 'name', key: 'name', width: 150 },
  {
    title: '备注',
    dataIndex: 'description',
    key: 'description',
    width: 200,
    ellipsis: true,
  },
  {
    title: '创建时间',
    dataIndex: 'created_at',
    key: 'created_at',
    width: 180,
    customRender: ({ text }: { text: null | string }) =>
      formatBeijingDateTime(text),
  },
  { title: '操作', key: 'action', width: 180 },
];

function openCreateModal() {
  editingRole.value = null;
  formName.value = '';
  formRemark.value = '';
  formPermissionIds.value = [];
  activePermGroups.value = [];
  activeSubKeys.value = [];
  modalVisible.value = true;
}

function openEditModal(role: RoleItem) {
  editingRole.value = role;
  formName.value = role.name;
  formRemark.value = role.description || '';
  formPermissionIds.value = role.permissions.map((p) => p.id);
  activePermGroups.value = [];
  activeSubKeys.value = [];
  modalVisible.value = true;
}

async function handleSave() {
  saving.value = true;
  try {
    const payload = {
      name: formName.value,
      description: formRemark.value,
      permission_ids: formPermissionIds.value,
    };
    if (isEditing.value && editingRole.value) {
      await updateRoleApi(editingRole.value.id, payload);
      message.success('角色已更新');
    } else {
      await createRoleApi(payload);
      message.success('角色已创建');
    }
    activePermGroups.value = [];
    activeSubKeys.value = [];
    modalVisible.value = false;
    fetchData();
  } catch {
    message.error('保存失败');
  } finally {
    saving.value = false;
  }
}

async function handleDelete(role: RoleItem) {
  deleteTarget.value = role;
  deleteConfirmName.value = '';
  deleteModalVisible.value = true;
}

// ── delete confirmation modal ──

const deleteModalVisible = ref(false);
const deleteTarget = ref<null | RoleItem>(null);
const deleteConfirmName = ref('');
const deleting = ref(false);

async function confirmDelete() {
  if (!deleteTarget.value) return;
  deleting.value = true;
  try {
    await deleteRoleApi(deleteTarget.value.id);
    message.success('已删除');
    deleteModalVisible.value = false;
    fetchData();
  } catch {
    message.error('删除失败');
  } finally {
    deleting.value = false;
  }
}

async function fetchData() {
  loading.value = true;
  try {
    const [rolesData, permsData, settings] = await Promise.all([
      getRolesApi(),
      getPermissionsApi(),
      getSystemSettingsBatchApi(['default_registration_role']),
    ]);
    roles.value = rolesData;
    permissions.value = permsData;
    fallbackRoleId.value = settings.default_registration_role
      ? Number(settings.default_registration_role)
      : null;
  } finally {
    loading.value = false;
  }
}

onMounted(fetchData);
</script>

<template>
  <Page>
    <Space style="margin-bottom: 16px">
      <Button type="primary" @click="openCreateModal">创建角色</Button>
    </Space>

    <Table
      :columns="columns"
      :data-source="roles"
      :loading="loading"
      :scroll="{ x: 'max-content' }"
      :pagination="{
        defaultPageSize: 20,
        showSizeChanger: true,
        pageSizeOptions: ['10', '20', '50', '100'],
        showTotal: (t: number) => `共 ${t} 条`,
      }"
      row-key="id"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'action'">
          <Space>
            <Button size="small" @click="openEditModal(record as RoleItem)">
              编辑
            </Button>
            <Tooltip
              v-if="fallbackRoleId === (record as RoleItem).id"
              title="该角色为降级注册角色，不可删除"
            >
              <Button size="small" danger disabled> 删除 </Button>
            </Tooltip>
            <Button
              v-else
              size="small"
              danger
              @click="handleDelete(record as RoleItem)"
            >
              删除
            </Button>
          </Space>
        </template>
      </template>
    </Table>

    <Modal
      v-model:open="modalVisible"
      @ok="handleSave"
      @cancel="
        activePermGroups = [];
        activeSubKeys = [];
      "
      :confirm-loading="saving"
      :width="560"
    >
      <template #title>
        <Space align="center" :size="8">
          <IconifyIcon
            :icon="isEditing ? 'lucide:edit' : 'lucide:user-plus'"
            style="font-size: 18px; color: #1677ff"
          />
          <span style="font-size: 16px; font-weight: 600">
            {{ isEditing ? '编辑角色' : '创建角色' }}
          </span>
        </Space>
      </template>

      <div style="margin-bottom: 16px">
        <label :style="dimTextStyle">角色名称</label>
        <Input
          v-model:value="formName"
          placeholder="如：编辑"
          style="margin-top: 6px"
        />
      </div>
      <div style="margin-bottom: 16px">
        <label :style="dimTextStyle">备注</label>
        <Input.TextArea
          v-model:value="formRemark"
          :maxlength="256"
          placeholder="角色说明"
          :rows="2"
          style="margin-top: 6px"
        />
      </div>
      <div>
        <div
          style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 8px;
          "
        >
          <label :style="dimTextStyle">
            <IconifyIcon
              icon="lucide:shield"
              style="margin-right: 4px; vertical-align: -2px"
            />
            权限
          </label>
          <Button size="small" @click="toggleAllGroups">
            {{ allGroupsExpanded ? '全部折叠' : '全部展开' }}
          </Button>
        </div>
        <Collapse
          v-if="permissions.length"
          v-model:active-key="activePermGroups"
        >
          <Collapse.Panel v-for="group in permissionGroups" :key="group.key">
            <template #header>
              <span style="font-weight: 500">
                <IconifyIcon
                  :icon="group.icon"
                  style="
                    margin-right: 6px;
                    vertical-align: -2px;
                    color: #1677ff;
                  "
                />
                {{ group.label }}
              </span>
              <Tag :color="groupTagColor(group.perms)" style="margin-left: 8px">
                {{ selectedCount(group.perms) }} / {{ group.perms.length }}
              </Tag>
            </template>
            <div
              v-for="sub in group.subgroups"
              :key="sub.key"
              class="perm-subgroup"
            >
              <!-- 组内有多个子分组时，每个子分组均可折叠（不限于权限数量） -->
              <template v-if="group.subgroups.length > 1">
                <Collapse
                  v-model:active-key="activeSubKeys"
                  :bordered="false"
                  class="perm-subgroup-collapse"
                >
                  <Collapse.Panel :key="sub.key">
                    <template #header>
                      <span class="perm-subgroup-title">
                        <IconifyIcon
                          :icon="sub.icon"
                          style="
                            margin-right: 4px;
                            font-size: 14px;
                            vertical-align: -2px;
                            color: #1677ff;
                          "
                        />
                        <span class="perm-subgroup-name" :style="dimTextStyle">
                          {{ sub.label }}
                        </span>
                        <Tag
                          :color="groupTagColor(sub.perms)"
                          class="perm-subgroup-tag"
                        >
                          {{ selectedCount(sub.perms) }} /
                          {{ sub.perms.length }}
                        </Tag>
                      </span>
                    </template>
                    <div
                      v-for="perm in sub.perms"
                      :key="perm.id"
                      class="perm-item"
                      :class="{
                        'is-selected': formPermissionIds.includes(perm.id),
                        'is-dark': isDark,
                      }"
                      @click="togglePermission(perm)"
                    >
                      <Checkbox
                        :checked="formPermissionIds.includes(perm.id)"
                        style="flex-shrink: 0; pointer-events: none"
                      />
                      <Tag class="perm-code" color="processing">
                        {{ perm.code }}
                      </Tag>
                      <span class="perm-name">{{ perm.name }}</span>
                    </div>
                  </Collapse.Panel>
                </Collapse>
              </template>
              <!-- 单子分组（非系统权限组）保持平铺 -->
              <template v-else>
                <div
                  v-for="perm in sub.perms"
                  :key="perm.id"
                  class="perm-item"
                  :class="{
                    'is-selected': formPermissionIds.includes(perm.id),
                    'is-dark': isDark,
                  }"
                  @click="togglePermission(perm)"
                >
                  <Checkbox
                    :checked="formPermissionIds.includes(perm.id)"
                    style="flex-shrink: 0; pointer-events: none"
                  />
                  <Tag class="perm-code" color="processing">
                    {{ perm.code }}
                  </Tag>
                  <span class="perm-name">{{ perm.name }}</span>
                </div>
              </template>
            </div>
          </Collapse.Panel>
        </Collapse>
      </div>
    </Modal>

    <Modal
      v-model:open="deleteModalVisible"
      :confirm-loading="deleting"
      :ok-button-props="{
        disabled: deleteConfirmName !== deleteTarget?.name,
        danger: true,
      }"
      ok-text="删除"
      cancel-text="取消"
      @ok="confirmDelete"
    >
      <template #title>
        <Space align="center" :size="8">
          <IconifyIcon
            icon="lucide:triangle-alert"
            style="font-size: 18px; color: #faad14"
          />
          <span style="font-size: 16px; font-weight: 600">删除角色</span>
        </Space>
      </template>

      <!-- Metric cards -->
      <div style="display: flex; gap: 12px; margin-bottom: 16px">
        <div class="metric-card" :class="{ 'is-dark': isDark }">
          <div class="metric-label">角色名</div>
          <div class="metric-name">{{ deleteTarget?.name }}</div>
        </div>
        <div class="metric-card" :class="{ 'is-dark': isDark }">
          <div class="metric-label">权限数</div>
          <div class="metric-num" style="color: #1677ff">
            {{ deleteTarget?.permissions?.length ?? 0 }}
          </div>
        </div>
        <div class="metric-card" :class="{ 'is-dark': isDark }">
          <div class="metric-label">用户数</div>
          <div class="metric-num" style="color: #fa541c">
            {{ deleteTarget?.admin_user_count ?? 0 }}
          </div>
        </div>
      </div>

      <!-- Consequence banner (Vben 主题 token 渲染) -->
      <div class="vben-theme-danger" style="margin-bottom: 16px">
        <IconifyIcon
          icon="lucide:circle-alert"
          class="vben-theme-danger-icon"
        />
        <div class="vben-theme-danger-body">
          <div class="vben-theme-danger-title">
            {{
              (deleteTarget?.admin_user_count ?? 0) > 0
                ? `删除后 ${deleteTarget?.admin_user_count} 个用户将失去该角色的全部权限`
                : '该角色当前无用户使用，可以安全删除'
            }}
          </div>
          <div class="vben-theme-danger-desc">
            {{
              (deleteTarget?.admin_user_count ?? 0) > 0
                ? '这些用户不会从系统中移除，仅被赋予降级注册角色。'
                : '此操作不可恢复。'
            }}
          </div>
        </div>
      </div>

      <!-- Confirm input -->
      <div>
        <label :style="dimTextStyle">请输入角色名确认：</label>
        <Input
          v-model:value="deleteConfirmName"
          :placeholder="deleteTarget?.name"
          :status="
            deleteConfirmName && deleteConfirmName !== deleteTarget?.name
              ? 'error'
              : ''
          "
          style="margin-top: 6px"
        >
          <template v-if="deleteConfirmName === deleteTarget?.name" #suffix>
            <IconifyIcon
              icon="ant-design:check-circle-filled"
              style="font-size: 16px; color: #52c41a"
            />
          </template>
        </Input>
        <div
          v-if="deleteConfirmName && deleteConfirmName !== deleteTarget?.name"
          style="margin-top: 4px; font-size: 12px; color: #ff4d4f"
        >
          角色名不匹配，无法删除
        </div>
      </div>
    </Modal>
  </Page>
</template>

<style scoped>
.perm-subgroup {
  margin-bottom: 8px;
}

.perm-subgroup:last-child {
  margin-bottom: 0;
}

.perm-subgroup-collapse {
  background: transparent;
  border: none;
}

.perm-subgroup-title {
  display: flex;
  gap: 6px;
  align-items: center;
}

.perm-subgroup-name {
  font-weight: 500;
}

.perm-subgroup-tag {
  margin: 0;
}

.perm-item {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid #f0f0f0;
}

.perm-item.is-dark {
  border-bottom-color: rgb(255 255 255 / 12%);
}

.perm-item:last-child {
  border-bottom: none;
}

.perm-code {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}

.perm-name {
  font-size: 13px;
  color: #333;
}

.perm-item.is-dark .perm-name {
  color: rgb(255 255 255 / 75%);
}

.metric-card {
  flex: 1;
  padding: 12px 8px;
  text-align: center;
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
}

.metric-card.is-dark {
  background: rgb(255 255 255 / 6%);
  border-color: rgb(255 255 255 / 10%);
}

.metric-label {
  margin-bottom: 4px;
  font-size: 12px;
  color: #999;
}

.metric-card.is-dark .metric-label {
  color: rgb(255 255 255 / 45%);
}

.metric-name {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  color: #1d1d1d;
  word-break: break-all;
}

.metric-card.is-dark .metric-name {
  color: rgb(255 255 255 / 85%);
}

.metric-num {
  font-size: 20px;
  font-weight: 700;
}

/* Vben 主题 token（hsl(var(--…)) 随明暗主题自动切换）渲染的危险提示横幅 */
.vben-theme-danger {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px 14px;
  font-size: 13px;
  color: hsl(var(--foreground));
  background: hsl(var(--destructive) / 12%);
  border: 1px solid hsl(var(--destructive) / 25%);
  border-radius: var(--radius);
}

.vben-theme-danger-icon {
  flex-shrink: 0;
  margin-top: 1px;
  font-size: 16px;
  color: hsl(var(--destructive));
}

.vben-theme-danger-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.vben-theme-danger-title {
  font-weight: 600;
  color: hsl(var(--foreground));
}

.vben-theme-danger-desc {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
</style>
