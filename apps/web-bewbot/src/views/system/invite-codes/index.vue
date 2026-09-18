<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { AvailableRoleItem, InviteCodeItem } from '#/api/core';

import { computed, h, onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { usePreferences } from '@vben/preferences';

import {
  AutoComplete,
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  Drawer,
  Input,
  InputNumber,
  List,
  message,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Tooltip,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  createInviteCodeApi,
  deleteInviteCodeApi,
  editInviteCodeApi,
  fetchAiModelsApi,
  getAvailableRolesApi,
  getInviteCodesApi,
  getSystemSettingsBatchApi,
  getUsersByInviteCodeApi,
  permanentlyDeleteInviteCodeApi,
  reactivateInviteCodeApi,
  setSystemSettingApi,
  testUsernameAuditApi,
} from '#/api/core';

defineOptions({ name: 'InviteCodes' });

const { isDark, isMobile } = usePreferences();

const codes = ref<InviteCodeItem[]>([]);
const loading = ref(false);
const searchText = ref('');
const inviteRequired = ref(false);
const openRegistration = ref(true);
const emailDomainMode = ref<string>('off');
const emailDomainWhitelist = ref('');
const emailDomainBlacklist = ref('');

const filteredCodes = computed(() => {
  const q = searchText.value.trim().toLowerCase();
  if (!q) return codes.value;
  return codes.value.filter(
    (c) =>
      c.code.toLowerCase().includes(q) ||
      (c.remark ?? '').toLowerCase().includes(q),
  );
});

const activeCount = computed(
  () =>
    codes.value.filter((c) => {
      if (!c.is_active) return false;
      if (c.expires_at && new Date(c.expires_at) < new Date()) return false;
      if (c.max_uses > 0 && c.used_count >= c.max_uses) return false;
      return true;
    }).length,
);
const revokedCount = computed(
  () => codes.value.filter((c) => !c.is_active).length,
);
const usedUpCount = computed(
  () =>
    codes.value.filter(
      (c) => c.is_active && c.max_uses > 0 && c.used_count >= c.max_uses,
    ).length,
);

// ── email domain modal ──

const emailDomainModalVisible = ref(false);
const emailDomainModalMode = ref<string>('off');
const emailDomainModalList = ref('');

function _domainListForMode(mode: string): string {
  return mode === 'whitelist'
    ? emailDomainWhitelist.value
    : emailDomainBlacklist.value;
}

function openEmailDomainModal() {
  emailDomainModalMode.value = emailDomainMode.value;
  emailDomainModalList.value = _domainListForMode(emailDomainMode.value)
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean)
    .join('\n');
  emailDomainModalVisible.value = true;
}

function onEmailDomainModeChange() {
  // Switch to the saved list for the newly selected mode
  emailDomainModalList.value = _domainListForMode(emailDomainModalMode.value)
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean)
    .join('\n');
}

async function saveEmailDomainSettings() {
  const normalized = emailDomainModalList.value
    .split('\n')
    .map((d) => d.trim())
    .filter(Boolean)
    .join(',');

  await setSystemSettingApi('email_domain_mode', emailDomainModalMode.value);
  // Save to mode-specific key
  const listKey =
    emailDomainModalMode.value === 'whitelist'
      ? 'email_domain_whitelist'
      : 'email_domain_blacklist';
  await setSystemSettingApi(listKey, normalized);

  emailDomainMode.value = emailDomainModalMode.value;
  if (emailDomainModalMode.value === 'whitelist') {
    emailDomainWhitelist.value = normalized;
  } else {
    emailDomainBlacklist.value = normalized;
  }
  emailDomainModalVisible.value = false;
  message.success('已更新邮箱域名过滤');
}

// Code users drawer
const userDrawerVisible = ref(false);
const userDrawerCode = ref('');
const userDrawerUsedCount = ref(0);
const userDrawerItems = ref<
  { created_at: null | string; email: string; id: number; username: string }[]
>([]);
const userDrawerLoading = ref(false);

function avatarChar(name: string): string {
  const match = name.match(/\p{L}/u);
  return match ? match[0].toUpperCase() : '?';
}

function avatarColor(id: number, name: string): string {
  const base = Math.trunc((id * 2_654_435_761) % 4_294_967_296) % 360;
  let offset = 0;
  for (const ch of name)
    offset = Math.trunc((offset << 5) - offset + (ch.codePointAt(0) ?? 0));
  const hue = (base + (offset % 20) - 10 + 360) % 360;
  return `hsl(${hue}, 50%, 40%)`;
}

async function showCodeUsers(code: InviteCodeItem) {
  userDrawerCode.value = code.code;
  userDrawerUsedCount.value = code.used_count;
  userDrawerVisible.value = true;
  userDrawerLoading.value = true;
  try {
    userDrawerItems.value = await getUsersByInviteCodeApi(code.id);
  } finally {
    userDrawerLoading.value = false;
  }
}

// 累计使用 = 历史兑换次数（删号不递减）；使用中 = 当前未删除的用户数（实时）。
// 两数不一致时在列里标注「使用中 X」，抽屉内再补充差额说明。
function usageText(record: InviteCodeItem): string {
  const base =
    record.max_uses > 0
      ? `累计 ${record.used_count} / ${record.max_uses}`
      : `累计 ${record.used_count} / ∞`;
  return record.live_used_count < record.used_count
    ? `${base} · 使用中 ${record.live_used_count}`
    : base;
}

// ── roles ──

const availableRoles = ref<AvailableRoleItem[]>([]);
const fallbackRoleId = ref<number | undefined>(undefined);

// ── registration settings modal ──

const settingsModalVisible = ref(false);
const savingSettings = ref(false);
const draftOpenRegistration = ref(true);
const draftInviteRequired = ref(false);
const draftFallbackRoleId = ref<number | undefined>(undefined);

function openSettingsModal() {
  draftOpenRegistration.value = openRegistration.value;
  draftInviteRequired.value = inviteRequired.value;
  draftFallbackRoleId.value = fallbackRoleId.value;
  settingsModalVisible.value = true;
}

async function saveSettings() {
  // Only persist settings that actually changed, so the audit log records
  // just the edited keys instead of a full save of every setting.
  const updates: Array<[string, string]> = [];
  if (draftOpenRegistration.value !== openRegistration.value) {
    updates.push(['open_registration', String(draftOpenRegistration.value)]);
  }
  if (draftInviteRequired.value !== inviteRequired.value) {
    updates.push(['require_invite_code', String(draftInviteRequired.value)]);
  }
  // The role Select has no allow-clear, so a changed draft is always a role id.
  if (
    draftFallbackRoleId.value !== fallbackRoleId.value &&
    draftFallbackRoleId.value !== undefined
  ) {
    updates.push([
      'default_registration_role',
      String(draftFallbackRoleId.value),
    ]);
  }
  if (updates.length === 0) {
    message.info('没有修改任何设置');
    settingsModalVisible.value = false;
    return;
  }
  savingSettings.value = true;
  try {
    await Promise.all(
      updates.map(([key, value]) => setSystemSettingApi(key, value)),
    );
    openRegistration.value = draftOpenRegistration.value;
    inviteRequired.value = draftInviteRequired.value;
    if (draftFallbackRoleId.value !== undefined) {
      fallbackRoleId.value = draftFallbackRoleId.value;
    }
    message.success('注册设置已保存');
    settingsModalVisible.value = false;
  } catch {
    // error handled by interceptor
  } finally {
    savingSettings.value = false;
  }
}

// ── username audit modal ──

const auditModalVisible = ref(false);
const auditEnabled = ref(false);
const auditProvider = ref('');
const auditBaseUrl = ref('');
const auditModel = ref('');
const auditApiKey = ref('');
const auditFailOpen = ref(true);
const auditModelOptions = ref<{ label: string; value: string }[]>([]);
const fetchingModels = ref(false);
const testAuditUsername = ref('');
const testingAudit = ref(false);
const testAuditResult = ref<null | { approved: boolean; reason: string }>(null);

async function handleTestAudit() {
  await _saveAuditSettings(false);
  testingAudit.value = true;
  testAuditResult.value = null;
  try {
    testAuditResult.value = await testUsernameAuditApi(testAuditUsername.value);
  } catch {
    testAuditResult.value = { approved: false, reason: '测试请求失败' };
  } finally {
    testingAudit.value = false;
  }
}

async function handleFetchModels() {
  if (!auditBaseUrl.value || !auditApiKey.value) {
    message.warning('请先填写 API 地址和 API Key');
    return;
  }
  fetchingModels.value = true;
  try {
    const models = await fetchAiModelsApi(
      auditBaseUrl.value,
      auditApiKey.value,
    );
    auditModelOptions.value = models.map((m) => ({ label: m, value: m }));
    message.success(`获取到 ${models.length} 个模型`);
  } catch {
    message.error('获取模型列表失败，请检查地址和 Key');
  } finally {
    fetchingModels.value = false;
  }
}

function openAuditModal() {
  auditEnabled.value = auditSettings.value.enabled === 'true';
  auditProvider.value = auditSettings.value.provider || '';
  auditBaseUrl.value = auditSettings.value.base_url || '';
  auditModel.value = auditSettings.value.model || '';
  auditApiKey.value = auditSettings.value.api_key || '';
  auditFailOpen.value = auditSettings.value.fail_open !== 'false';
  auditModalVisible.value = true;
}

async function _saveAuditSettings(closeModal: boolean) {
  // Only persist settings that actually changed, so the audit log records
  // just the edited keys instead of a full save of every setting.
  const updates: Array<[string, string]> = [];
  if (String(auditEnabled.value) !== auditSettings.value.enabled) {
    updates.push(['username_audit_enabled', String(auditEnabled.value)]);
  }
  if (auditProvider.value !== auditSettings.value.provider) {
    updates.push(['username_audit_provider', auditProvider.value]);
  }
  if (auditBaseUrl.value !== auditSettings.value.base_url) {
    updates.push(['username_audit_base_url', auditBaseUrl.value]);
  }
  if (auditModel.value !== auditSettings.value.model) {
    updates.push(['username_audit_model', auditModel.value]);
  }
  if (auditApiKey.value !== auditSettings.value.api_key) {
    updates.push(['username_audit_api_key', auditApiKey.value]);
  }
  if (String(auditFailOpen.value) !== auditSettings.value.fail_open) {
    updates.push(['username_audit_fail_open', String(auditFailOpen.value)]);
  }
  if (updates.length > 0) {
    await Promise.all(
      updates.map(([key, value]) => setSystemSettingApi(key, value)),
    );
  }
  auditSettings.value.enabled = String(auditEnabled.value);
  auditSettings.value.provider = auditProvider.value;
  auditSettings.value.base_url = auditBaseUrl.value;
  auditSettings.value.model = auditModel.value;
  auditSettings.value.api_key = auditApiKey.value;
  auditSettings.value.fail_open = String(auditFailOpen.value);
  if (closeModal) {
    auditModalVisible.value = false;
    message.success('已更新用户名审核设置');
  }
}

function saveAuditSettings() {
  return _saveAuditSettings(true);
}

const auditSettings = ref<Record<string, string>>({});

// ── create modal ──

const modalVisible = ref(false);
const codeInput = ref('');
const codeError = ref('');
const defaultRoleId = ref<number | undefined>(undefined);
const maxUses = ref(1);
const createUnlimited = ref(false);
const expiresAt = ref<any>(dayjs().add(7, 'day'));
const expiresDays = ref(7);
const remark = ref('');
const saving = ref(false);

const INVITE_CODE_RE = /^[A-Za-z0-9_-]{8,32}$/;

function validateInviteCode(code: string): string {
  if (!code) return '';
  return INVITE_CODE_RE.test(code) ? '' : '邀请码需为 8-32 位字母、数字、-、_';
}

// 随机生成一个邀请码（与后端 token_hex(8) 一致：8 字节 → 16 位小写 hex）
function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function randomizeCode() {
  codeInput.value = generateCode();
  codeError.value = '';
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

const columns: TableColumnsType = [
  {
    title: 'ID',
    dataIndex: 'id',
    key: 'id',
    width: 60,
    sorter: (a: InviteCodeItem, b: InviteCodeItem) => a.id - b.id,
    sortDirections: ['ascend', 'descend'],
  },
  { title: '邀请码', dataIndex: 'code', key: 'code', width: 140 },
  {
    title: '状态',
    key: 'status',
    width: 80,
    customRender: ({ record }: { record: InviteCodeItem }) => {
      if (!record.is_active) return h(Tag, { color: 'red' }, () => '已撤销');
      if (record.expires_at && new Date(record.expires_at) < new Date())
        return h(Tag, { color: 'orange' }, () => '已过期');
      if (record.max_uses > 0 && record.used_count >= record.max_uses)
        return h(Tag, { color: 'red' }, () => '已用完');
      return h(Tag, { color: 'green' }, () => '有效');
    },
    sorter: (a: InviteCodeItem, b: InviteCodeItem) =>
      Number(b.is_active) - Number(a.is_active),
    sortDirections: ['ascend', 'descend'],
  },
  {
    title: '默认角色',
    key: 'default_role',
    width: 100,
    customRender: ({ record }: { record: InviteCodeItem }) => {
      if (!record.default_role_name) return '-';
      return h(Tag, { color: 'blue' }, () => record.default_role_name);
    },
  },
  {
    title: '累计使用',
    key: 'usage',
    width: 220,
    customRender: ({ record }: { record: InviteCodeItem }) => {
      const canClick = record.used_count > 0;
      if (record.max_uses <= 0)
        return canClick
          ? h(
              'a',
              {
                style: 'font-size:12px;cursor:pointer;color:#1677ff',
                onClick: () => showCodeUsers(record),
              },
              usageText(record),
            )
          : h(
              'span',
              {
                style:
                  'font-size:12px;color:hsl(var(--muted-foreground) / 80%)',
              },
              usageText(record),
            );
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
            onClick: () => showCodeUsers(record),
          },
          [
            h(
              'span',
              { style: 'white-space:nowrap;font-size:12px' },
              usageText(record),
            ),
            h(Progress, {
              percent: Math.min(pct, 100),
              size: 'small',
              strokeColor,
              showInfo: false,
              style: 'flex:1',
              class: 'cell-progress',
            }),
          ],
        );
      return h(
        'span',
        { style: 'font-size:12px;color:hsl(var(--muted-foreground) / 80%)' },
        usageText(record),
      );
    },
  },
  {
    title: '过期时间',
    key: 'expiry',
    width: 180,
    customRender: ({ record }: { record: InviteCodeItem }) => {
      if (!record.expires_at) return '永不过期';
      const created = new Date(
        record.created_at || record.expires_at,
      ).getTime();
      const expires = new Date(record.expires_at).getTime();
      const now = Date.now();
      if (now >= expires) return h(Tag, { color: 'red' }, () => '已过期');
      const total = expires - created;
      const elapsed = now - created;
      const pct = Math.round((elapsed / total) * 100);
      const remaining = Math.max(0, expires - now);
      const days = Math.round(remaining / 86_400_000);
      const fullDate = new Date(record.expires_at).toLocaleString('zh-CN');
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
    title: '备注',
    dataIndex: 'remark',
    key: 'remark',
    width: 120,
    customRender: ({ text }: { text: null | string }) => text || '-',
  },
  {
    title: '创建时间',
    dataIndex: 'created_at',
    key: 'created_at',
    width: 150,
    customRender: ({ text }: { text: null | string }) =>
      text ? new Date(text).toLocaleString('zh-CN') : '-',
    sorter: (a: InviteCodeItem, b: InviteCodeItem) =>
      new Date(a.created_at || 0).getTime() -
      new Date(b.created_at || 0).getTime(),
    sortDirections: ['ascend', 'descend'],
  },
  {
    title: '创建者',
    dataIndex: 'created_by_username',
    key: 'created_by',
    width: 120,
  },
  { title: '操作', key: 'action', width: 100 },
];

function copyCode(code: string) {
  navigator.clipboard.writeText(code);
  message.success('已复制');
}

async function handleReactivate(code: InviteCodeItem) {
  await reactivateInviteCodeApi(code.id);
  message.success('已重新激活');
  fetchData();
}

function isCodeExpired(code: InviteCodeItem) {
  return code.expires_at && new Date(code.expires_at) < new Date();
}

function isCodeInvalid(code: InviteCodeItem) {
  if (!code.is_active) return true;
  if (isCodeExpired(code)) return true;
  if (code.max_uses > 0 && code.used_count >= code.max_uses) return true;
  return false;
}

async function handlePermanentDelete(code: InviteCodeItem) {
  const invalid = isCodeInvalid(code);
  const live = code.live_used_count ?? 0;
  const title = invalid ? '确定删除该邀请码？' : '该邀请码仍在有效期内';
  let content = '该邀请码仍然有效，确定要删除吗？';
  if (invalid) content = '删除后不可恢复';
  if (live > 0) {
    content = `删除后不可恢复，使用过该邀请码的 ${live} 个用户将显示「已删除」，邀请人保留`;
  }
  Modal.confirm({
    title,
    content,
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      await permanentlyDeleteInviteCodeApi(code.id);
      message.success('已删除');
      fetchData();
    },
  });
}

// Edit modal
const editModalVisible = ref(false);
const editingCode = ref<InviteCodeItem | null>(null);
const editCode = ref('');
const editCodeError = ref('');
const editDefaultRoleId = ref<number | undefined>(undefined);
const editMaxUses = ref(1);
const editUnlimited = ref(false);
const editExpiresAt = ref<any>(null);
const editExpiresDays = ref(0);
const editRemark = ref('');

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

function openEditModal(code: InviteCodeItem) {
  if (!code.is_active) {
    Modal.confirm({
      title: '编辑邀请码',
      content: '被撤销的邀请码不可编辑，是否重新激活？',
      okText: '重新激活',
      cancelText: '取消',
      onOk: async () => {
        await reactivateInviteCodeApi(code.id);
        message.success('已重新激活');
        fetchData();
      },
    });
    return;
  }
  editingCode.value = code;
  editCode.value = code.code;
  editCodeError.value = '';
  editDefaultRoleId.value = code.default_role_id ?? undefined;
  editMaxUses.value = code.max_uses > 0 ? code.max_uses : 1;
  editUnlimited.value = code.max_uses <= 0;
  editExpiresAt.value = code.expires_at ? dayjs(code.expires_at) : null;
  editExpiresDays.value = code.expires_at
    ? Math.max(0, Math.round(dayjs(code.expires_at).diff(dayjs(), 'day', true)))
    : 0;
  editRemark.value = code.remark || '';
  editModalVisible.value = true;
}

function randomizeEditCode() {
  editCode.value = generateCode();
  editCodeError.value = '';
}

async function handleEditSave() {
  if (!editingCode.value) return;
  const codeErr = validateInviteCode(editCode.value);
  if (codeErr) {
    editCodeError.value = codeErr;
    return;
  }
  editCodeError.value = '';
  saving.value = true;
  try {
    await editInviteCodeApi(editingCode.value.id, {
      code:
        editCode.value === editingCode.value.code ? undefined : editCode.value,
      default_role_id:
        editDefaultRoleId.value === editingCode.value.default_role_id
          ? undefined
          : editDefaultRoleId.value,
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
}

async function handleCreate() {
  const codeErr = validateInviteCode(codeInput.value);
  if (codeErr) {
    codeError.value = codeErr;
    return;
  }
  codeError.value = '';
  if (!defaultRoleId.value) {
    message.error('请选择默认角色');
    return;
  }
  saving.value = true;
  try {
    await createInviteCodeApi({
      code: codeInput.value.trim() || undefined,
      default_role_id: defaultRoleId.value,
      expires_at: expiresAt.value?.toISOString?.() ?? undefined,
      max_uses: createUnlimited.value ? 0 : maxUses.value,
      remark: remark.value || undefined,
    });
    message.success('邀请码已生成');
    modalVisible.value = false;
    codeInput.value = '';
    codeError.value = '';
    defaultRoleId.value = undefined;
    maxUses.value = 1;
    createUnlimited.value = false;
    expiresAt.value = dayjs().add(7, 'day');
    expiresDays.value = 7;
    remark.value = '';
    fetchData();
  } catch {
    // error handled by interceptor
  } finally {
    saving.value = false;
  }
}

async function handleDelete(code: InviteCodeItem) {
  Modal.confirm({
    title: `确定撤销邀请码「${code.code}」？`,
    content: '撤销后该邀请码将无法使用',
    okType: 'danger',
    onOk: async () => {
      await deleteInviteCodeApi(code.id);
      message.success('已撤销');
      fetchData();
    },
  });
}

async function fetchData() {
  loading.value = true;
  try {
    const [codesData, settings, roles] = await Promise.all([
      getInviteCodesApi(),
      getSystemSettingsBatchApi([
        'require_invite_code',
        'open_registration',
        'default_registration_role',
        'email_domain_mode',
        'email_domain_whitelist',
        'email_domain_blacklist',
        'username_audit_enabled',
        'username_audit_provider',
        'username_audit_base_url',
        'username_audit_model',
        'username_audit_api_key',
        'username_audit_fail_open',
      ]),
      getAvailableRolesApi(),
    ]);
    codes.value = codesData;
    inviteRequired.value = settings.require_invite_code === 'true';
    openRegistration.value = settings.open_registration !== 'false';
    availableRoles.value = roles;
    fallbackRoleId.value = settings.default_registration_role
      ? Number(settings.default_registration_role)
      : undefined;
    emailDomainMode.value = settings.email_domain_mode || 'off';
    emailDomainWhitelist.value = settings.email_domain_whitelist || '';
    emailDomainBlacklist.value = settings.email_domain_blacklist || '';
    auditSettings.value = {
      api_key: settings.username_audit_api_key || '',
      base_url: settings.username_audit_base_url || '',
      enabled: settings.username_audit_enabled || 'false',
      fail_open: settings.username_audit_fail_open || 'true',
      model: settings.username_audit_model || '',
      provider: settings.username_audit_provider || '',
    };
  } finally {
    loading.value = false;
  }
}

onMounted(fetchData);
</script>

<template>
  <Page>
    <Row :gutter="[16, 16]" style="margin-bottom: 16px">
      <Col :xs="12" :sm="6">
        <Card>
          <Statistic title="总邀请码" :value="codes.length" />
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
            title="已用完"
            :value="usedUpCount"
            :value-style="{ color: '#fa8c16' }"
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

    <!-- Invite actions -->
    <Space style="margin-bottom: 16px">
      <Button type="primary" @click="modalVisible = true">生成邀请码</Button>
      <Button @click="openSettingsModal">
        <span
          :style="{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            marginRight: '6px',
            borderRadius: '50%',
            background: openRegistration ? '#52c41a' : '#d9d9d9',
          }"
        ></span>
        注册设置
      </Button>
      <Input.Search
        v-model:value="searchText"
        placeholder="搜索邀请码或备注"
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
          <Space>
            <Button
              size="small"
              @click="openEditModal(record as InviteCodeItem)"
            >
              编辑
            </Button>
            <Button
              size="small"
              @click="copyCode((record as InviteCodeItem).code)"
            >
              复制
            </Button>
            <Button
              v-if="(record as InviteCodeItem).is_active"
              size="small"
              danger
              @click="handleDelete(record as InviteCodeItem)"
            >
              撤销
            </Button>
            <Button
              v-else
              size="small"
              type="primary"
              @click="handleReactivate(record as InviteCodeItem)"
            >
              激活
            </Button>
            <Button
              size="small"
              danger
              type="text"
              @click="handlePermanentDelete(record as InviteCodeItem)"
            >
              删除
            </Button>
          </Space>
        </template>
      </template>
    </Table>

    <Modal
      v-model:open="modalVisible"
      @ok="handleCreate"
      :confirm-loading="saving"
      :width="480"
    >
      <template #title>
        <Space align="center" :size="8">
          <IconifyIcon
            icon="lucide:gift"
            style="font-size: 18px; color: #1677ff"
          />
          <span style="font-size: 16px; font-weight: 600">生成邀请码</span>
        </Space>
      </template>

      <div style="margin-bottom: 16px">
        <label style="font-size: 13px; color: hsl(var(--muted-foreground))"
          >邀请码</label
        >
        <div style="display: flex; gap: 8px; margin-top: 6px">
          <Input
            v-model:value="codeInput"
            :maxlength="32"
            placeholder="留空自动生成，或点「随机」"
            :status="codeError ? 'error' : ''"
            style="flex: 1"
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
        <label style="font-size: 13px; color: hsl(var(--muted-foreground))"
          >默认角色</label
        >
        <Select
          v-model:value="defaultRoleId"
          placeholder="请选择角色"
          style="width: 100%; margin-top: 6px"
          :options="availableRoles.map((r) => ({ label: r.name, value: r.id }))"
        />
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
            最大使用次数
          </label>
          <Space align="center" :size="6">
            <Switch v-model:checked="createUnlimited" size="small" />
            <span style="font-size: 13px">不限</span>
          </Space>
        </div>
        <InputNumber
          :value="createUnlimited ? undefined : maxUses"
          :min="1"
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
            :disabled-date="(d: any) => d.isBefore(dayjs().startOf('day'))"
            show-time
            format="YYYY-MM-DD HH:mm"
            placeholder="永不过期"
            allow-clear
            style="flex: 1"
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
          placeholder="可选"
          style="margin-top: 6px"
        />
      </div>
    </Modal>

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
          <span style="font-size: 16px; font-weight: 600">编辑邀请码</span>
        </Space>
      </template>

      <div style="margin-bottom: 16px">
        <label style="font-size: 13px; color: hsl(var(--muted-foreground))"
          >邀请码</label
        >
        <div style="display: flex; gap: 8px; margin-top: 6px">
          <Input
            v-model:value="editCode"
            :maxlength="32"
            :status="editCodeError ? 'error' : ''"
            style="flex: 1"
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
        <label style="font-size: 13px; color: hsl(var(--muted-foreground))"
          >默认角色</label
        >
        <Select
          v-model:value="editDefaultRoleId"
          placeholder="请选择角色"
          style="width: 100%; margin-top: 6px"
          :options="availableRoles.map((r) => ({ label: r.name, value: r.id }))"
        />
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
            最大使用次数
          </label>
          <Space align="center" :size="6">
            <Switch v-model:checked="editUnlimited" size="small" />
            <span style="font-size: 13px">不限</span>
          </Space>
        </div>
        <InputNumber
          :value="editUnlimited ? undefined : editMaxUses"
          :min="1"
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
            format="YYYY-MM-DD HH:mm"
            placeholder="永不过期"
            allow-clear
            style="flex: 1"
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
          placeholder="可选"
          style="margin-top: 6px"
        />
      </div>
    </Modal>

    <!-- Users by code drawer -->
    <Drawer v-model:open="userDrawerVisible" :width="isMobile ? '100%' : 500">
      <template #title>
        <Space align="center" :size="6" :wrap="true">
          <IconifyIcon icon="lucide:users" style="color: #1677ff" />
          <span style="font-weight: 600">使用邀请码</span>
          <Tag color="blue" style="margin: 0 2px">{{ userDrawerCode }}</Tag>
          <span style="font-weight: 600">注册的用户</span>
        </Space>
      </template>

      <div
        v-if="userDrawerUsedCount > userDrawerItems.length"
        class="vben-theme-warning"
        style="margin-bottom: 12px"
      >
        <IconifyIcon
          icon="lucide:triangle-alert"
          class="vben-theme-warning-icon"
        />
        <span>
          {{
            userDrawerItems.length === 0
              ? `该邀请码累计使用 ${userDrawerUsedCount} 次，相关用户均已被删除`
              : `该邀请码累计使用 ${userDrawerUsedCount} 次，其中 ${userDrawerUsedCount - userDrawerItems.length} 个用户已被删除`
          }}
        </span>
      </div>

      <List
        :data-source="userDrawerItems"
        :loading="userDrawerLoading"
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
                  background: avatarColor(r.id, r.username || ''),
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 'bold',
                }"
              >
                {{ avatarChar(r.username || '') }}
              </div>
              <div style="flex: 1; min-width: 0">
                <div style="font-weight: 500">{{ r.username }}</div>
                <div
                  style="
                    margin-top: 2px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    font-size: 12px;
                    color: hsl(var(--muted-foreground) / 80%);
                    white-space: nowrap;
                  "
                >
                  {{ r.email }}
                  <span v-if="r.created_at" style="margin-left: 12px">
                    {{ new Date(r.created_at).toLocaleString('zh-CN') }}
                  </span>
                </div>
              </div>
            </div>
          </List.Item>
        </template>
      </List>
    </Drawer>

    <!-- Registration settings modal -->
    <Modal v-model:open="settingsModalVisible" :width="480">
      <template #title>
        <Space align="center" :size="8">
          <IconifyIcon
            icon="lucide:settings-2"
            style="font-size: 18px; color: #1677ff"
          />
          <span style="font-size: 16px; font-weight: 600">注册设置</span>
        </Space>
      </template>

      <div style="display: flex; flex-direction: column; gap: 16px">
        <div
          style="
            display: flex;
            align-items: center;
            justify-content: space-between;
          "
        >
          <span
            :style="{
              fontSize: '13px',
              color: isDark ? '#94a3b8' : '#666',
            }"
          >
            开放注册
          </span>
          <Switch v-model:checked="draftOpenRegistration" />
        </div>
        <div
          style="
            display: flex;
            align-items: center;
            justify-content: space-between;
          "
        >
          <span
            :style="{
              fontSize: '13px',
              color: isDark ? '#94a3b8' : '#666',
            }"
          >
            要求邀请码注册
          </span>
          <Switch v-model:checked="draftInviteRequired" />
        </div>
      </div>

      <Divider style="margin: 16px 0" />

      <div style="display: flex; flex-direction: column; gap: 16px">
        <div
          style="
            display: flex;
            align-items: center;
            justify-content: space-between;
          "
        >
          <span
            :style="{
              fontSize: '13px',
              color: isDark ? '#94a3b8' : '#666',
            }"
          >
            降级注册角色
          </span>
          <Select
            v-model:value="draftFallbackRoleId"
            placeholder="选择角色"
            style="width: 200px"
            :options="
              availableRoles.map((r) => ({ label: r.name, value: r.id }))
            "
          />
        </div>
        <div
          style="
            display: flex;
            align-items: center;
            justify-content: space-between;
          "
        >
          <span
            :style="{
              fontSize: '13px',
              color: isDark ? '#94a3b8' : '#666',
            }"
          >
            邮箱过滤
          </span>
          <Button size="small" @click="openEmailDomainModal">
            {{
              emailDomainMode === 'whitelist'
                ? '白名单'
                : emailDomainMode === 'blacklist'
                  ? '黑名单'
                  : '未开启'
            }}
          </Button>
        </div>
        <div
          style="
            display: flex;
            align-items: center;
            justify-content: space-between;
          "
        >
          <span
            :style="{
              fontSize: '13px',
              color: isDark ? '#94a3b8' : '#666',
            }"
          >
            用户名审核
          </span>
          <Button size="small" @click="openAuditModal">
            {{ auditSettings.enabled === 'true' ? '已启用' : '未开启' }}
          </Button>
        </div>
      </div>

      <template #footer>
        <Button @click="settingsModalVisible = false">关闭</Button>
        <Button type="primary" :loading="savingSettings" @click="saveSettings">
          保存
        </Button>
      </template>
    </Modal>

    <!-- Email domain filter modal -->
    <Modal
      v-model:open="emailDomainModalVisible"
      @ok="saveEmailDomainSettings"
      :width="480"
    >
      <template #title>
        <Space align="center" :size="8">
          <IconifyIcon
            icon="lucide:mail-check"
            style="font-size: 18px; color: #1677ff"
          />
          <span style="font-size: 16px; font-weight: 600">邮箱域名过滤</span>
        </Space>
      </template>

      <div style="margin-bottom: 16px">
        <label style="font-size: 13px; color: hsl(var(--muted-foreground))"
          >过滤模式</label
        >
        <Select
          v-model:value="emailDomainModalMode"
          style="width: 100%; margin-top: 6px"
          :options="[
            { label: '不开启', value: 'off' },
            { label: '白名单', value: 'whitelist' },
            { label: '黑名单', value: 'blacklist' },
          ]"
          @change="onEmailDomainModeChange"
        />
      </div>
      <div v-if="emailDomainModalMode !== 'off'">
        <label style="font-size: 13px; color: hsl(var(--muted-foreground))"
          >域名列表</label
        >
        <Input.TextArea
          v-model:value="emailDomainModalList"
          :rows="6"
          placeholder="gmail.com&#10;outlook.com"
          style="margin-top: 6px"
        />
        <span style="font-size: 12px; color: hsl(var(--muted-foreground) / 80%)"
          >每行一个域名，如 gmail.com</span
        >
      </div>
    </Modal>

    <!-- Username audit modal -->
    <Modal
      v-model:open="auditModalVisible"
      @ok="saveAuditSettings"
      :width="520"
    >
      <template #title>
        <Space align="center" :size="8">
          <IconifyIcon
            icon="lucide:sparkles"
            style="font-size: 18px; color: #1677ff"
          />
          <span style="font-size: 16px; font-weight: 600">用户名 AI 审核</span>
        </Space>
      </template>

      <div style="margin-bottom: 16px">
        <label style="font-size: 13px; color: hsl(var(--muted-foreground))"
          >启用审核</label
        >
        <Switch
          :checked="auditEnabled"
          @change="auditEnabled = $event as boolean"
          style="margin-left: 8px"
        />
      </div>
      <div style="margin-bottom: 12px">
        <label>模型提供商</label>
        <Input
          v-model:value="auditProvider"
          placeholder="OpenAI / Azure / Ollama"
          allow-clear
          style="margin-top: 4px"
        />
      </div>
      <div style="margin-bottom: 12px">
        <label>API 地址</label>
        <Input
          v-model:value="auditBaseUrl"
          placeholder="https://api.openai.com/v1"
          allow-clear
          style="margin-top: 4px"
        />
        <span style="font-size: 12px; color: hsl(var(--muted-foreground) / 80%)"
          >兼容 OpenAI 接口格式</span
        >
      </div>
      <div style="margin-bottom: 12px">
        <label>API Key</label>
        <Input.Password
          v-model:value="auditApiKey"
          placeholder="sk-..."
          allow-clear
          style="margin-top: 4px"
        />
      </div>
      <div style="margin-bottom: 12px">
        <label>模型</label>
        <div style="display: flex; gap: 8px; margin-top: 4px">
          <AutoComplete
            v-model:value="auditModel"
            :options="auditModelOptions"
            placeholder="gpt-4o-mini"
            style="flex: 1"
            allow-clear
          />
          <Button :loading="fetchingModels" @click="handleFetchModels">
            获取模型列表
          </Button>
        </div>
      </div>
      <div style="margin-bottom: 12px">
        <label>审核失败时放行</label>
        <Switch
          :checked="auditFailOpen"
          @change="auditFailOpen = $event as boolean"
          style="margin-left: 8px"
        />
      </div>
      <div
        style="
          padding-top: 12px;
          margin-top: 8px;
          border-top: 1px solid hsl(var(--border));
        "
      >
        <label>测试审核</label>
        <div style="display: flex; gap: 8px; margin-top: 4px">
          <Input
            v-model:value="testAuditUsername"
            placeholder="输入测试用户名"
            style="flex: 1"
          />
          <Button
            type="primary"
            :loading="testingAudit"
            @click="handleTestAudit"
          >
            测试
          </Button>
        </div>
        <div v-if="testAuditResult" style="margin-top: 8px">
          <Tag :color="testAuditResult.approved ? 'green' : 'red'">
            {{ testAuditResult.approved ? '通过' : '拒绝' }}
          </Tag>
          <span style="margin-left: 8px; color: hsl(var(--muted-foreground))">
            {{ testAuditResult.reason || '审核完成' }}
          </span>
        </div>
      </div>
    </Modal>
  </Page>
</template>

<style scoped>
/* Vben 主题变量（hsl(var(--…)) 随明暗主题自动切换）渲染的警告提示条 */
.vben-theme-warning {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  font-size: 13px;
  color: hsl(var(--foreground));
  background: hsl(var(--warning) / 12%);
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
}

.vben-theme-warning-icon {
  flex-shrink: 0;
  font-size: 15px;
  color: hsl(var(--warning));
}

/* 让 antd Progress 小号轨道与相邻文字垂直居中对齐：
   根节点 antd 默认 line-height 会撑出行框、轨道 baseline 贴底，
   改为 inline-flex 容器后轨道作为 flex item 被 align-items:center 居中。 */
.cell-progress {
  display: inline-flex;
  align-items: center;
  margin: 0;
}
</style>
