<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { ConversationCodeItem } from '#/api/core';
import type { CodeUserItem } from '#/api/core/auth';

import { computed, h, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { usePreferences } from '@vben/preferences';

import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Drawer,
  Input,
  InputNumber,
  List,
  message,
  Modal,
  Popconfirm,
  Progress,
  Row,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Tooltip,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  blockVisitorApi,
  createConversationCodeApi,
  editConversationCodeApi,
  getCodeUsersApi,
  getConversationCodesApi,
  getTelegramBindStatusApi,
  permanentlyDeleteConversationCodeApi,
  reactivateConversationCodeApi,
  revokeConversationCodeApi,
  rotateConversationCodeApi,
  setConversationCodeApi,
  unblockVisitorApi,
} from '#/api/core';
import { formatBeijingDateTime, formatBeijingShort } from '#/utils/datetime';

defineOptions({ name: 'ConversationCodes' });

const router = useRouter();
const { isMobile } = usePreferences();

// 未绑定 Telegram 时提示：识别码建了也用不上（访客消息转发不到）。
const isBound = ref(true);

const codes = ref<ConversationCodeItem[]>([]);
const loading = ref(false);
const searchText = ref('');

const filteredCodes = computed(() => {
  const q = searchText.value.trim().toLowerCase();
  if (!q) return codes.value;
  return codes.value.filter(
    (c) =>
      c.code.toLowerCase().includes(q) ||
      (c.remark ?? '').toLowerCase().includes(q),
  );
});

const defaultCount = computed(
  () => codes.value.filter((c) => c.is_default).length,
);
const activeCount = computed(
  () =>
    codes.value.filter((c) => {
      if (c.is_default) return true;
      if (!c.is_active) return false;
      if (c.expires_at && new Date(c.expires_at) < new Date()) return false;
      if (c.max_uses > 0 && c.used_count >= c.max_uses) return false;
      return true;
    }).length,
);
const revokedCount = computed(
  () => codes.value.filter((c) => !c.is_active).length,
);

// ── avatar helpers ──

function avatarChar(firstName: null | string, username: null | string): string {
  const source = firstName || username || '';
  const match = source.match(/\p{L}/u);
  return match ? match[0].toUpperCase() : '?';
}

function avatarColor(tgUserId: number, firstName: null | string): string {
  // Base hue from ID — stable, never changes
  const base = Math.trunc((tgUserId * 2_654_435_761) % 4_294_967_296) % 360;
  // Name adds ±10° fine-tuning
  let offset = 0;
  const name = firstName || '';
  for (const ch of name)
    offset = Math.trunc((offset << 5) - offset + (ch.codePointAt(0) ?? 0));
  const hue = (base + (offset % 20) - 10 + 360) % 360;
  return `hsl(${hue}, 50%, 40%)`;
}

// ── code helpers ──

const CODE_PATTERN = /^[a-zA-Z0-9_-]{8,16}$/;

function generateCode(): string {
  // 与后端 token_hex(5) 一致：5 字节 → 10 位小写 hex
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function validateCode(code: string): string {
  if (!code) return ''; // 留空 = 后端自动生成
  if (code.length < 8) return '至少 8 个字符';
  if (code.length > 16) return '最多 16 个字符';
  if (!CODE_PATTERN.test(code)) return '仅支持字母、数字、-、_';
  return '';
}

// ── create modal ──

const modalVisible = ref(false);
const codeInput = ref('');
const codeError = ref('');
const maxUses = ref(1);
const createUnlimited = ref(false);
const expiresAt = ref<any>(dayjs().add(7, 'day'));
const expiresDays = ref(7);
const remark = ref('');
const saving = ref(false);

function onCodeInputChange() {
  codeError.value = validateCode(codeInput.value);
}

function onExpiresAtChange(d: any) {
  expiresDays.value = d
    ? Math.max(0, Math.round(d.diff(dayjs(), 'day', true)))
    : 0;
}
function onExpiresDaysChange(v: unknown) {
  const n = Math.max(0, Number(v ?? 0));
  expiresDays.value = n;
  expiresAt.value = n > 0 ? dayjs().add(n, 'day') : null;
}

// Edit modal (temp codes)
const editModalVisible = ref(false);
const editingCode = ref<ConversationCodeItem | null>(null);
const editCode = ref('');
const editCodeError = ref('');
const editMaxUses = ref(0);
const editUnlimited = ref(false);
const editExpiresAt = ref<any>(null);
const editExpiresDays = ref(0);
const editRemark = ref('');

function onEditCodeChange() {
  editCodeError.value = validateCode(editCode.value);
}

function onEditExpiresAtChange(d: any) {
  editExpiresDays.value = d
    ? Math.max(0, Math.round(d.diff(dayjs(), 'day', true)))
    : 0;
}
function onEditExpiresDaysChange(v: unknown) {
  const n = Math.max(0, Number(v ?? 0));
  editExpiresDays.value = n;
  editExpiresAt.value = n > 0 ? dayjs().add(n, 'day') : null;
}

// Edit default code modal
const defaultEditVisible = ref(false);
const newDefaultCode = ref('');
const savingDefault = ref(false);

const columns: TableColumnsType = [
  { title: 'ID', dataIndex: 'id', key: 'id', width: 60, sorter: true },
  {
    title: '识别码',
    dataIndex: 'code',
    key: 'code',
    width: 150,
    customRender: ({ text }: { text: string }) =>
      h('code', { style: { fontSize: '14px', fontWeight: 'bold' } }, text),
  },
  {
    title: '使用次数',
    key: 'usage',
    width: 150,
    customRender: ({ record }: { record: ConversationCodeItem }) => {
      const canClick = record.used_count > 0;
      if (record.is_default)
        return canClick
          ? h(
              'a',
              {
                style: 'font-size:12px;cursor:pointer;color:#1677ff',
                onClick: () => showCodeUsers(record.code),
              },
              `${record.used_count} / ∞`,
            )
          : h(
              'span',
              {
                style:
                  'font-size:12px;color:hsl(var(--muted-foreground) / 80%)',
              },
              `${record.used_count} / ∞`,
            );
      if (record.max_uses <= 0)
        return canClick
          ? h(
              'a',
              {
                style: 'font-size:12px;cursor:pointer;color:#1677ff',
                onClick: () => showCodeUsers(record.code),
              },
              `${record.used_count} / ∞`,
            )
          : h(
              'span',
              {
                style:
                  'font-size:12px;color:hsl(var(--muted-foreground) / 80%)',
              },
              `${record.used_count} / ∞`,
            );
      // Temp code with max_uses > 0
      const pct = Math.round(
        (record.used_count / Math.max(record.max_uses, 1)) * 100,
      );
      let strokeColor: string;
      if (pct >= 100) strokeColor = '#f5222d';
      else if (pct >= 80) strokeColor = '#fa8c16';
      else strokeColor = '#52c41a';
      if (canClick)
        return h(
          'a',
          {
            style:
              'display:flex;align-items:center;gap:8px;cursor:pointer;color:inherit;text-decoration:none',
            onClick: () => showCodeUsers(record.code),
          },
          [
            h(
              'span',
              { style: 'white-space:nowrap;font-size:12px' },
              `${record.used_count} / ${record.max_uses}`,
            ),
            h(Progress, {
              percent: Math.min(pct, 100),
              size: 'small',
              strokeColor,
              showInfo: false,
              style: 'flex:1',
            }),
          ],
        );
      return h(
        'span',
        { style: 'font-size:12px;color:hsl(var(--muted-foreground) / 80%)' },
        `${record.used_count} / ${record.max_uses}`,
      );
    },
  },
  {
    title: '状态',
    dataIndex: 'status',
    key: 'status',
    width: 100,
    customRender: ({ record }: { record: ConversationCodeItem }) => {
      if (record.is_default) return h(Tag, { color: 'blue' }, () => '默认');
      if (!record.is_active)
        return h(Tag, { color: 'default' }, () => '已撤销');
      if (record.expires_at && new Date(record.expires_at) < new Date())
        return h(Tag, { color: 'orange' }, () => '已过期');
      if (record.max_uses > 0 && record.used_count >= record.max_uses)
        return h(Tag, { color: 'red' }, () => '已用完');
      return h(Tag, { color: 'green' }, () => '有效');
    },
  },
  {
    title: '备注',
    dataIndex: 'remark',
    key: 'remark',
    width: 150,
    ellipsis: true,
    customRender: ({ text }: { text: null | string }) => text || '-',
  },
  {
    title: '过期时间',
    key: 'expiry',
    width: 160,
    customRender: ({ record }: { record: ConversationCodeItem }) => {
      if (record.is_default || !record.expires_at || !record.created_at)
        return '永久';
      const created = new Date(record.created_at).getTime();
      const expires = new Date(record.expires_at).getTime();
      const now = Date.now();
      if (now >= expires) return h(Tag, { color: 'red' }, () => '已过期');
      const total = expires - created;
      const elapsed = now - created;
      const pct = Math.round((elapsed / total) * 100);
      const remaining = Math.max(0, expires - now);
      const days = Math.round(remaining / 86_400_000);
      const fullDate = formatBeijingDateTime(record.expires_at);
      let strokeColor: string;
      if (pct >= 90) strokeColor = '#f5222d';
      else if (pct >= 70) strokeColor = '#fa8c16';
      else strokeColor = '#1677ff';
      return h(Tooltip, { title: fullDate }, () =>
        h('div', { style: 'display:flex;align-items:center;gap:8px' }, [
          h(
            'span',
            { style: 'white-space:nowrap;font-size:12px' },
            `${days}天`,
          ),
          h(Progress, {
            percent: Math.min(pct, 100),
            size: 'small',
            strokeColor,
            showInfo: false,
            style: 'flex:1',
          }),
        ]),
      );
    },
  },
  {
    title: '创建时间',
    dataIndex: 'created_at',
    key: 'created_at',
    width: 180,
    customRender: ({ text }: { text: null | string }) =>
      formatBeijingDateTime(text),
  },
  { title: '操作', key: 'action', width: 220 },
];

function copyCode(code: string) {
  navigator.clipboard.writeText(code);
  message.success('已复制');
}

function onCreateModalOpen() {
  codeError.value = '';
  maxUses.value = 1;
  createUnlimited.value = false;
  remark.value = '';
  expiresAt.value = dayjs().add(7, 'day');
  expiresDays.value = 7;
}

// 随机生成一个识别码填入创建/编辑弹窗的输入框（并清除校验错误）。
function randomizeCode() {
  codeInput.value = generateCode();
  codeError.value = '';
}

function randomizeEditCode() {
  editCode.value = generateCode();
  editCodeError.value = '';
}

async function handleCreate() {
  // 未绑定 Telegram 时创建的识别码访客用不了（消息转发不到），直接阻止
  if (!isBound.value) {
    message.warning('请先在个人设置绑定 Telegram，再创建识别码');
    return;
  }
  // Validate code before submitting
  const err = validateCode(codeInput.value);
  if (err) {
    codeError.value = err;
    return;
  }
  codeError.value = '';
  saving.value = true;
  try {
    await createConversationCodeApi({
      code: codeInput.value.trim() || undefined,
      expires_at: expiresAt.value?.toISOString?.() ?? undefined,
      max_uses: createUnlimited.value ? 0 : maxUses.value,
      remark: remark.value || undefined,
    });
    message.success('识别码已生成');
    modalVisible.value = false;
    fetchData();
  } catch {
    // error handled by interceptor
  } finally {
    saving.value = false;
  }
}

function openEditModal(code: ConversationCodeItem) {
  if (!code.is_active) {
    message.error('已撤销的识别码不可编辑，请先重新激活');
    return;
  }
  editingCode.value = code;
  editCode.value = code.code;
  editCodeError.value = '';
  editMaxUses.value = code.max_uses > 0 ? code.max_uses : 1;
  editUnlimited.value = code.max_uses <= 0;
  editExpiresAt.value = code.expires_at ? dayjs(code.expires_at) : null;
  editExpiresDays.value = code.expires_at
    ? Math.max(0, Math.round(dayjs(code.expires_at).diff(dayjs(), 'day', true)))
    : 0;
  editRemark.value = code.remark || '';
  editModalVisible.value = true;
}

async function handleEditSave() {
  if (!editingCode.value) return;
  const target = editingCode.value;

  // Validate code if changed
  const codeChanged = editCode.value !== target.code;
  if (codeChanged) {
    const err = validateCode(editCode.value);
    if (err) {
      editCodeError.value = err;
      return;
    }
  }
  editCodeError.value = '';

  const active = target.active_session_count ?? 0;
  const doSave = async () => {
    saving.value = true;
    try {
      await editConversationCodeApi(target.id, {
        code: codeChanged ? editCode.value : undefined,
        expires_at: editExpiresAt.value?.toISOString?.() ?? '',
        max_uses: editUnlimited.value ? 0 : editMaxUses.value,
        remark: editRemark.value || '',
      });
      message.success('保存成功');
      editModalVisible.value = false;
      fetchData();
    } catch {
      // error handled by interceptor
    } finally {
      saving.value = false;
    }
  };

  // Changing the code kicks active sessions using it (backend behavior).
  if (codeChanged && active > 0) {
    Modal.confirm({
      title: '修改识别码将踢出活跃会话',
      content: `该识别码有 ${active} 个活跃会话，修改后它们将被终止，访客需用新识别码重新进入。确定修改？`,
      okText: '确定修改',
      okType: 'danger',
      cancelText: '取消',
      onOk: doSave,
    });
    return;
  }
  await doSave();
}

async function handleRevoke(code: ConversationCodeItem) {
  Modal.confirm({
    title: `确定撤销识别码「${code.code}」？`,
    content: '撤销后使用该识别码的用户将无法发起新对话',
    okText: '撤销',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      await revokeConversationCodeApi(code.id);
      message.success('已撤销');
      fetchData();
    },
  });
}

async function handleReactivate(code: ConversationCodeItem) {
  if (code.expires_at && new Date(code.expires_at) < new Date()) {
    message.error('已过期的识别码无法重新激活');
    return;
  }
  await reactivateConversationCodeApi(code.id);
  message.success('已激活');
  fetchData();
}

async function handlePermanentDelete(code: ConversationCodeItem) {
  Modal.confirm({
    title: `永久删除识别码「${code.code}」？`,
    content: '删除后无法恢复',
    okText: '永久删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      await permanentlyDeleteConversationCodeApi(code.id);
      message.success('已删除');
      fetchData();
    },
  });
}

function openDefaultEdit(_code: string) {
  newDefaultCode.value = '';
  defaultEditVisible.value = true;
}

function randomizeDefaultCode() {
  newDefaultCode.value = generateCode();
}

async function handleDefaultEditSave() {
  savingDefault.value = true;
  try {
    await setConversationCodeApi(newDefaultCode.value);
    message.success('默认识别码已更新');
    defaultEditVisible.value = false;
    fetchData();
  } catch {
    // error handled by interceptor
  } finally {
    savingDefault.value = false;
  }
}

function handleRotate() {
  Modal.confirm({
    title: '确定轮换默认识别码？',
    content: '轮换后旧识别码立即失效，使用旧码的访客将无法发起新对话。',
    okText: '确认轮换',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      await rotateConversationCodeApi();
      message.success('默认识别码已轮换');
      fetchData();
    },
  });
}

// User list modal
const userListVisible = ref(false);
const userListCode = ref('');
const userListItems = ref<CodeUserItem[]>([]);
const userListLoading = ref(false);

async function showCodeUsers(code: string) {
  userListCode.value = code;
  userListVisible.value = true;
  userListLoading.value = true;
  try {
    userListItems.value = await getCodeUsersApi(code);
  } catch {
    message.error('加载用户列表失败');
  } finally {
    userListLoading.value = false;
  }
}

async function handleBlockUser(tgUserId: number) {
  await blockVisitorApi(tgUserId);
  message.success('已拉黑');
  // Refresh the list for the current code
  if (userListCode.value) {
    userListItems.value = await getCodeUsersApi(userListCode.value);
  }
}

async function handleUnblockUser(tgUserId: number) {
  await unblockVisitorApi(tgUserId);
  message.success('已解除拉黑');
  if (userListCode.value) {
    userListItems.value = await getCodeUsersApi(userListCode.value);
  }
}

async function fetchData() {
  loading.value = true;
  try {
    codes.value = await getConversationCodesApi();
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  fetchData();
  try {
    const s = await getTelegramBindStatusApi();
    isBound.value = s.is_bound;
  } catch {
    // 拿不到绑定状态时默认视为已绑定，避免误报
  }
});
</script>

<template>
  <Page>
    <Alert
      v-if="!isBound"
      type="warning"
      show-icon
      message="尚未绑定 Telegram"
      description="识别码需要绑定 Telegram 账号后，访客进入会话的消息才能转发到你。"
      style="margin-bottom: 16px"
    >
      <template #action>
        <Button size="small" @click="router.push('/profile')">去绑定</Button>
      </template>
    </Alert>
    <Row :gutter="[16, 16]" style="margin-bottom: 16px">
      <Col :xs="12" :sm="6">
        <Card>
          <Statistic title="总识别码" :value="codes.length" />
        </Card>
      </Col>
      <Col :xs="12" :sm="6">
        <Card>
          <Statistic
            title="默认"
            :value="defaultCount"
            :value-style="{ color: '#1677ff' }"
          />
        </Card>
      </Col>
      <Col :xs="12" :sm="6">
        <Card>
          <Statistic
            title="有效"
            :value="activeCount"
            :value-style="{ color: '#52c41a' }"
          />
        </Card>
      </Col>
      <Col :xs="12" :sm="6">
        <Card>
          <Statistic
            title="已撤销"
            :value="revokedCount"
            :value-style="{ color: '#ff4d4f' }"
          />
        </Card>
      </Col>
    </Row>

    <Space style="margin-bottom: 16px" :wrap="true">
      <Button type="primary" @click="modalVisible = true"> 生成识别码 </Button>
      <Input.Search
        v-model:value="searchText"
        placeholder="搜索识别码或备注"
        allow-clear
        style="width: 280px"
      />
    </Space>

    <Table
      :columns="columns"
      :data-source="filteredCodes"
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
          <Space v-if="record.is_default">
            <Button size="small" @click="copyCode(record.code)"> 复制 </Button>
            <Button
              size="small"
              type="primary"
              @click="openDefaultEdit(record.code)"
            >
              编辑
            </Button>
            <Button size="small" danger @click="handleRotate()"> 轮换 </Button>
          </Space>
          <Space v-else>
            <Button size="small" @click="copyCode(record.code)"> 复制 </Button>
            <template v-if="record.is_active">
              <Button
                size="small"
                type="primary"
                @click="openEditModal(record as ConversationCodeItem)"
              >
                编辑
              </Button>
              <Button
                size="small"
                danger
                @click="handleRevoke(record as ConversationCodeItem)"
              >
                撤销
              </Button>
            </template>
            <template v-else>
              <Button
                size="small"
                type="primary"
                @click="handleReactivate(record as ConversationCodeItem)"
              >
                激活
              </Button>
            </template>
            <Tooltip
              :title="
                record.is_active && record.used_count > 0 ? '需先撤销' : ''
              "
            >
              <Button
                size="small"
                danger
                :disabled="record.is_active && record.used_count > 0"
                @click="handlePermanentDelete(record as ConversationCodeItem)"
              >
                删除
              </Button>
            </Tooltip>
          </Space>
        </template>
      </template>
    </Table>

    <!-- Create Modal -->
    <Modal
      v-model:open="modalVisible"
      @ok="handleCreate"
      :confirm-loading="saving"
      :width="480"
      @after-open-change="(open: boolean) => open && onCreateModalOpen()"
    >
      <template #title>
        <Space align="center" :size="8">
          <IconifyIcon
            icon="lucide:key-round"
            style="font-size: 18px; color: #1677ff"
          />
          <span style="font-size: 16px; font-weight: 600">生成对话识别码</span>
        </Space>
      </template>

      <div style="margin-bottom: 16px">
        <label style="font-size: 13px; color: hsl(var(--muted-foreground))"
          >识别码</label
        >
        <div style="display: flex; gap: 8px; margin-top: 6px">
          <Input
            v-model:value="codeInput"
            :maxlength="16"
            placeholder="留空自动生成，或点「随机」"
            :status="codeError ? 'error' : ''"
            style="flex: 1"
            @change="onCodeInputChange"
          />
          <Button @click="randomizeCode">
            <IconifyIcon
              icon="lucide:dices"
              style="margin-right: 4px; vertical-align: -2px"
            />
            随机
          </Button>
        </div>
        <span v-if="codeError" style="font-size: 12px; color: #ff4d4f">
          {{ codeError }}
        </span>
      </div>
      <div style="margin-bottom: 16px">
        <div
          style="
            display: flex;
            align-items: center;
            justify-content: space-between;
          "
        >
          <label style="font-size: 13px; color: hsl(var(--muted-foreground))">
            使用次数上限
          </label>
          <Space align="center" :size="6">
            <Switch v-model:checked="createUnlimited" size="small" />
            <span style="font-size: 13px">不限</span>
          </Space>
        </div>
        <InputNumber
          :value="createUnlimited ? undefined : maxUses"
          :min="1"
          :max="999"
          :disabled="createUnlimited"
          :placeholder="createUnlimited ? '∞' : ''"
          style="width: 100%; margin-top: 6px"
          @update:value="(v: unknown) => (maxUses = Number(v ?? 1))"
        />
      </div>
      <div>
        <label style="font-size: 13px; color: hsl(var(--muted-foreground))"
          >过期时间</label
        >
        <div style="display: flex; gap: 8px; margin-top: 6px">
          <DatePicker
            v-model:value="expiresAt"
            show-time
            format="YYYY-MM-DD HH:mm:ss"
            placeholder="永不过期"
            allow-clear
            style="flex: 1"
            :disabled-date="(d: any) => d.isBefore(dayjs().startOf('day'))"
            @change="onExpiresAtChange"
          />
          <InputNumber
            :value="expiresDays || undefined"
            :min="0"
            :max="365"
            placeholder="永不过期"
            :addon-after="expiresDays > 0 ? '天后过期' : ''"
            style="width: 140px"
            @update:value="onExpiresDaysChange"
          />
        </div>
      </div>
      <div style="margin-top: 16px">
        <label style="font-size: 13px; color: hsl(var(--muted-foreground))"
          >备注</label
        >
        <Input
          v-model:value="remark"
          placeholder="如：给张三的临时码"
          :maxlength="256"
          style="margin-top: 6px"
        />
      </div>
    </Modal>

    <!-- Edit Modal -->
    <Modal
      v-model:open="editModalVisible"
      @ok="handleEditSave"
      :confirm-loading="saving"
      :width="480"
    >
      <template #title>
        <Space align="center" :size="8">
          <IconifyIcon
            icon="lucide:edit"
            style="font-size: 18px; color: #1677ff"
          />
          <span style="font-size: 16px; font-weight: 600">编辑识别码</span>
        </Space>
      </template>

      <div style="margin-bottom: 16px">
        <label style="font-size: 13px; color: hsl(var(--muted-foreground))"
          >识别码</label
        >
        <div style="display: flex; gap: 8px; margin-top: 6px">
          <Input
            v-model:value="editCode"
            :maxlength="16"
            :status="editCodeError ? 'error' : ''"
            style="flex: 1"
            @change="onEditCodeChange"
          />
          <Button @click="randomizeEditCode">
            <IconifyIcon
              icon="lucide:dices"
              style="margin-right: 4px; vertical-align: -2px"
            />
            随机
          </Button>
        </div>
        <span v-if="editCodeError" style="font-size: 12px; color: #ff4d4f">
          {{ editCodeError }}
        </span>
      </div>
      <div style="margin-bottom: 16px">
        <div
          style="
            display: flex;
            align-items: center;
            justify-content: space-between;
          "
        >
          <label style="font-size: 13px; color: hsl(var(--muted-foreground))">
            使用次数上限
          </label>
          <Space align="center" :size="6">
            <Switch v-model:checked="editUnlimited" size="small" />
            <span style="font-size: 13px">不限</span>
          </Space>
        </div>
        <InputNumber
          :value="editUnlimited ? undefined : editMaxUses"
          :min="1"
          :max="999"
          :disabled="editUnlimited"
          :placeholder="editUnlimited ? '∞' : ''"
          style="width: 100%; margin-top: 6px"
          @update:value="(v: unknown) => (editMaxUses = Number(v ?? 1))"
        />
      </div>
      <div>
        <label style="font-size: 13px; color: hsl(var(--muted-foreground))"
          >过期时间</label
        >
        <div style="display: flex; gap: 8px; margin-top: 6px">
          <DatePicker
            v-model:value="editExpiresAt"
            show-time
            format="YYYY-MM-DD HH:mm:ss"
            placeholder="永不过期"
            allow-clear
            style="flex: 1"
            :disabled-date="(d: any) => d.isBefore(dayjs().startOf('day'))"
            @change="onEditExpiresAtChange"
          />
          <InputNumber
            :value="editExpiresDays || undefined"
            :min="0"
            :max="365"
            placeholder="永不过期"
            :addon-after="editExpiresDays > 0 ? '天后过期' : ''"
            style="width: 140px"
            @update:value="onEditExpiresDaysChange"
          />
        </div>
      </div>
      <div style="margin-top: 16px">
        <label style="font-size: 13px; color: hsl(var(--muted-foreground))"
          >备注</label
        >
        <Input
          v-model:value="editRemark"
          placeholder="如：给张三的临时码"
          :maxlength="256"
          style="margin-top: 6px"
        />
      </div>
    </Modal>

    <!-- Edit Default Code Modal -->
    <Modal
      v-model:open="defaultEditVisible"
      :confirm-loading="savingDefault"
      @ok="handleDefaultEditSave"
      :width="440"
    >
      <template #title>
        <Space align="center" :size="8">
          <IconifyIcon
            icon="lucide:star"
            style="font-size: 18px; color: #1677ff"
          />
          <span style="font-size: 16px; font-weight: 600">编辑默认识别码</span>
        </Space>
      </template>

      <label style="font-size: 13px; color: hsl(var(--muted-foreground))">
        新识别码（8-16位字母、数字、-、_）
      </label>
      <div style="display: flex; gap: 8px; margin-top: 6px">
        <Input
          v-model:value="newDefaultCode"
          placeholder="输入新的识别码"
          :maxlength="16"
          style="flex: 1"
        />
        <Button @click="randomizeDefaultCode">
          <IconifyIcon
            icon="lucide:dices"
            style="margin-right: 4px; vertical-align: -2px"
          />
          随机
        </Button>
      </div>
    </Modal>

    <!-- User List Drawer -->
    <Drawer v-model:open="userListVisible" :width="isMobile ? '100%' : 640">
      <template #title>
        <Space align="center" :size="6" :wrap="true">
          <IconifyIcon icon="lucide:key-round" style="color: #1677ff" />
          <span style="font-weight: 600">使用识别码</span>
          <Tag color="blue" style="margin: 0 2px">{{ userListCode }}</Tag>
          <span style="font-weight: 600">的访客</span>
        </Space>
      </template>

      <List
        :data-source="userListItems"
        :loading="userListLoading"
        size="small"
      >
        <template #renderItem="{ item: r }">
          <List.Item>
            <div
              style="
                display: flex;
                gap: 12px;
                align-items: center;
                width: 100%;
                min-width: 0;
              "
            >
              <div
                :style="{
                  display: 'flex',
                  width: '32px',
                  height: '32px',
                  flexShrink: 0,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                  background: r.is_blocked
                    ? '#f0f0f0'
                    : avatarColor(r.tg_user_id, r.first_name),
                  color: r.is_blocked ? '#bbb' : '#fff',
                  fontSize: '14px',
                  fontWeight: 'bold',
                }"
              >
                {{ avatarChar(r.first_name, r.username) }}
              </div>
              <div style="flex: 1; min-width: 0">
                <div
                  style="
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                    align-items: center;
                  "
                >
                  <a
                    v-if="r.first_name"
                    :href="`tg://user?id=${r.tg_user_id}`"
                    style="font-weight: 500; color: #1677ff"
                  >
                    {{ r.first_name }}
                  </a>
                  <a
                    v-if="r.username"
                    :href="`https://t.me/${r.username}`"
                    target="_blank"
                    style="color: #1677ff"
                  >
                    @{{ r.username }}
                  </a>
                  <span
                    v-if="!r.first_name && !r.username"
                    style="color: hsl(var(--muted-foreground) / 80%)"
                  >
                    未知用户
                  </span>
                  <Tag v-if="r.is_premium" color="gold" style="font-size: 10px">
                    Pre
                  </Tag>
                  <Tag v-if="r.is_blocked" color="red" style="font-size: 11px">
                    已拉黑
                  </Tag>
                </div>
                <div
                  style="
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                    align-items: center;
                    margin-top: 2px;
                    font-size: 12px;
                    color: hsl(var(--muted-foreground) / 80%);
                  "
                >
                  <code style="font-size: 11px">{{ r.tg_user_id }}</code>
                  <span
                    v-if="r.last_active_at"
                    style="color: hsl(var(--muted-foreground) / 50%)"
                    >·</span
                  >
                  <span v-if="r.last_active_at">
                    {{ formatBeijingShort(r.last_active_at) }}
                  </span>
                  <span style="color: hsl(var(--muted-foreground) / 50%)"
                    >·</span
                  >
                  <span>{{ r.message_count }} 条消息</span>
                </div>
              </div>
              <div style="flex-shrink: 0">
                <Button
                  v-if="r.is_blocked"
                  size="small"
                  @click="handleUnblockUser(r.tg_user_id)"
                >
                  解除
                </Button>
                <Popconfirm
                  v-else
                  title="确认拉黑该用户？"
                  :description="`TG ID: ${r.tg_user_id}`"
                  ok-text="确认拉黑"
                  cancel-text="取消"
                  @confirm="handleBlockUser(r.tg_user_id)"
                >
                  <Button size="small" danger> 拉黑 </Button>
                </Popconfirm>
              </div>
            </div>
          </List.Item>
        </template>
      </List>
    </Drawer>
  </Page>
</template>
