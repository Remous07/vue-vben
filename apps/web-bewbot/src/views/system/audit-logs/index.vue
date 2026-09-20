<script lang="ts" setup>
import type {
  AuditOperationItem,
  AuditStats,
  RuntimeLogItem,
} from '#/api/core';

import { computed, h, onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { usePreferences } from '@vben/preferences';
import { useAccessStore } from '@vben/stores';

import {
  Button,
  Card,
  Col,
  DatePicker,
  Input,
  InputNumber,
  message,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Tooltip,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  clearAuditOperationsApi,
  clearRuntimeLogsApi,
  getAuditOperationsApi,
  getAuditRetentionApi,
  getAuditStatsApi,
  getRuntimeLogsApi,
  setAuditRetentionApi,
} from '#/api/core';

defineOptions({ name: 'AuditLogs' });

const { isDark } = usePreferences();

// 本页的「读」是 audit:view（进得来就有），「毁」另算 audit:manage：清空两张表
// 和改保留天数都是销毁性操作。后端已经按这个分开了，这里同步把控件收起来——
// 否则只读审计员会看到按钮、点下去才吃 403。
const accessStore = useAccessStore();
const hasAuditManage =
  accessStore.accessCodes?.includes('audit:manage') ?? false;

const ACTION_OPTIONS = [
  {
    label: '认证',
    options: [
      { label: '登录', value: 'auth.login' },
      { label: '登录失败', value: 'auth.login.failed' },
      { label: '两步验证登录', value: 'auth.login_totp' },
      { label: '两步验证失败', value: 'auth.login_totp.failed' },
      { label: '登出', value: 'auth.logout' },
      { label: '注册账号', value: 'auth.register' },
      { label: '请求重置密码', value: 'auth.reset_password_request' },
      { label: '重置密码', value: 'auth.reset_password' },
    ],
  },
  {
    label: 'TG 用户操作',
    options: [
      { label: '拉黑 TG 用户', value: 'user.ban' },
      { label: '解除拉黑 TG 用户', value: 'user.unban' },
      { label: '删除 TG 用户', value: 'user.delete' },
      { label: '解绑 TG 用户', value: 'user.unbind' },
    ],
  },
  {
    label: '系统用户操作',
    options: [
      { label: '封禁系统用户', value: 'admin.ban' },
      { label: '解封系统用户', value: 'admin.unban' },
      { label: '删除系统用户', value: 'admin.delete' },
      { label: '分配角色', value: 'admin.roles' },
    ],
  },
  {
    label: '角色管理',
    options: [
      { label: '创建角色', value: 'role.create' },
      { label: '编辑角色', value: 'role.edit' },
      { label: '删除角色', value: 'role.delete' },
    ],
  },
  {
    label: '邀请码操作',
    options: [
      { label: '生成邀请码', value: 'invite.create' },
      { label: '编辑邀请码', value: 'invite.edit' },
      { label: '撤销邀请码', value: 'invite.revoke' },
      { label: '重新激活邀请码', value: 'invite.reactivate' },
      { label: '永久删除邀请码', value: 'invite.delete' },
    ],
  },
  {
    label: '识别码操作',
    options: [
      { label: '创建临时识别码', value: 'code.create' },
      { label: '编辑临时识别码', value: 'code.edit' },
      { label: '撤销临时识别码', value: 'code.revoke' },
      { label: '激活临时识别码', value: 'code.reactivate' },
      { label: '永久删除识别码', value: 'code.delete' },
      { label: '轮换默认识别码', value: 'code.rotate' },
      { label: '设置默认识别码', value: 'code.set' },
    ],
  },
  {
    label: '个人设置',
    options: [
      { label: '修改密码', value: 'profile.password' },
      { label: '修改邮箱', value: 'profile.email' },
      { label: '修改用户名', value: 'profile.username' },
      { label: '开启两步验证', value: 'profile.totp_enable' },
      { label: '关闭两步验证', value: 'profile.totp_disable' },
      { label: '绑定 Telegram', value: 'profile.bind' },
      { label: '解绑 Telegram', value: 'profile.unbind' },
    ],
  },
  {
    label: '账户',
    options: [{ label: '注销账号', value: 'account.delete' }],
  },
  {
    label: '系统设置',
    options: [{ label: '修改系统设置', value: 'settings.update' }],
  },
  {
    label: '审计',
    options: [
      { label: '修改审计保留设置', value: 'audit.retention' },
      { label: '清空操作记录', value: 'audit.clear_operations' },
      { label: '清空运行日志', value: 'audit.clear_runtime_logs' },
    ],
  },
  {
    label: '消息与会话',
    options: [
      { label: '查看访客消息', value: 'messages.view' },
      { label: '访客进入会话', value: 'conversation.session_start' },
      { label: '访客离开会话', value: 'conversation.session_leave' },
    ],
  },
  {
    label: '安全事件',
    options: [
      { label: 'Webhook 校验失败', value: 'security.webhook_reject' },
      { label: '内部接口密钥校验失败', value: 'security.api_key_reject' },
    ],
  },
  {
    // 分类名跟「我的访客 / TG 用户」两页的列名保持一致；value 是后端的审计
    // 动作名，不要跟着改。
    label: '静默',
    options: [{ label: '触发静默', value: 'rate_limit.silenced' }],
  },
];

const LEVEL_OPTIONS = [
  { label: 'INFO', value: 'INFO' },
  { label: 'WARNING', value: 'WARNING' },
  { label: 'ERROR', value: 'ERROR' },
  { label: 'CRITICAL', value: 'CRITICAL' },
];

function levelColor(level: string): string {
  const map: Record<string, string> = {
    CRITICAL: 'magenta',
    DEBUG: 'default',
    ERROR: 'red',
    INFO: 'blue',
    WARNING: 'orange',
  };
  return map[level] || 'default';
}

function actionColor(action: string): string {
  if (action.includes('delete') || action.includes('ban')) return 'red';
  if (action.includes('login') || action.includes('logout')) return 'green';
  if (action.includes('role')) return 'purple';
  if (action.includes('invite') || action.includes('code')) return 'geekblue';
  if (action.includes('settings') || action.includes('rotate')) return 'orange';
  if (action.includes('rate_limit')) return 'volcano';
  if (
    action.includes('profile') ||
    action.includes('account') ||
    action.includes('register')
  ) {
    return 'cyan';
  }
  return 'default';
}

function toLocalIso(d?: dayjs.Dayjs): string | undefined {
  return d ? d.format('YYYY-MM-DDTHH:mm:ss') : undefined;
}

function flagEmoji(code: null | string): string {
  if (!code || code.length !== 2 || !/^[A-Z]{2}$/.test(code)) {
    return '';
  }
  // Regional indicator symbol: 0x1F1E6 - 'A'(65) = 127397
  return String.fromCodePoint(
    ...[...code].map((c) => 127_397 + (c.codePointAt(0) ?? 0)),
  );
}

// ── stats ──────────────────────────────────────────────

const stats = ref<AuditStats>({
  log_error: 0,
  log_total: 0,
  operation_today: 0,
  operation_total: 0,
});

const statCards = computed(() => [
  {
    title: '操作记录',
    value: stats.value.operation_total,
    icon: 'lucide:history',
    color: '#1677ff',
    bg: isDark.value ? '#1e3a5f' : '#e6f4ff',
  },
  {
    title: '今日操作',
    value: stats.value.operation_today,
    icon: 'lucide:activity',
    color: '#52c41a',
    bg: isDark.value ? '#1f3d2a' : '#f6ffed',
  },
  {
    title: '运行日志',
    value: stats.value.log_total,
    icon: 'lucide:file-text',
    color: '#fa8c16',
    bg: isDark.value ? '#3d2f1a' : '#fff7e6',
  },
  {
    title: '错误/严重日志',
    value: stats.value.log_error,
    icon: 'lucide:triangle-alert',
    color: '#ff4d4f',
    bg: isDark.value ? '#3d1f1f' : '#fff1f0',
  },
]);

async function fetchStats() {
  try {
    stats.value = await getAuditStatsApi();
  } catch {
    // error handled by interceptor
  }
}

// ── retention config ───────────────────────────────────

const auditDays = ref(90);
const logDays = ref(7);
const savingRetention = ref(false);

async function fetchRetention() {
  const r = await getAuditRetentionApi();
  auditDays.value = r.audit_days;
  logDays.value = r.log_days;
}

async function saveRetention() {
  savingRetention.value = true;
  try {
    await setAuditRetentionApi({
      audit_days: auditDays.value,
      log_days: logDays.value,
    });
    message.success('保留天数已更新');
  } catch {
    // error handled by interceptor
  } finally {
    savingRetention.value = false;
  }
}

// ── operation audit tab ────────────────────────────────

const operations = ref<AuditOperationItem[]>([]);
const opLoading = ref(false);
const opTotal = ref(0);
const opPage = ref(1);
const opPageSize = ref(20);
const opAction = ref<string | undefined>(undefined);
const opUsername = ref('');
const opDevice = ref<string | undefined>(undefined);
const opRange = ref<[dayjs.Dayjs, dayjs.Dayjs] | undefined>(undefined);

// ua_device 列存的是稳定英文码（desktop/smartphone/tablet），前端映射中文
const DEVICE_LABELS: Record<string, string> = {
  desktop: '桌面',
  smartphone: '手机',
  tablet: '平板',
};
const DEVICE_OPTIONS = Object.entries(DEVICE_LABELS).map(([value, label]) => ({
  label,
  value,
}));

// mdi 系图标经 Iconify 在线加载（与应用现有 mdi 图标一致）；Linux 用企鹅 Tux。
const DEVICE_ICONS: Record<string, string> = {
  desktop: 'mdi:desktop-tower-monitor',
  smartphone: 'mdi:cellphone',
  tablet: 'mdi:tablet',
};

// ua-parser 把多数发行版解析为独立 family（Ubuntu/Debian/…），一并归入企鹅图标
const LINUX_OS_MARKERS = [
  'linux',
  'ubuntu',
  'debian',
  'fedora',
  'arch',
  'centos',
  'red hat',
  'mint',
  'manjaro',
  'suse',
  'kali',
  'alpine',
  'chrome os',
];

function osIcon(os: null | string): string {
  const o = (os ?? '').toLowerCase();
  if (o.includes('ios')) return 'mdi:apple-ios';
  if (o.includes('windows')) return 'mdi:microsoft-windows';
  if (o.includes('android')) return 'mdi:android';
  if (o.includes('mac')) return 'mdi:apple';
  if (LINUX_OS_MARKERS.some((m) => o.includes(m))) return 'mdi:linux';
  return 'mdi:monitor';
}

// 展示层归一化 ua_os（后端存的是 family + 主版本，个别系统不美观/有歧义）：
//   - macOS：ua-parser 只给 "Mac OS X 10"，UA 分不清具体版本 → 统一 "macOS"
//   - ChromeOS：major 是 build 号不是版本号 → 只留 "Chrome OS"
//   - Windows 10/11：UA 都是 NT 10.0，无法区分 → 诚实显示 "Windows 10/11"
//     （Windows 7/8 的 major 不同，仍正常显示）
function osLabel(os: null | string): string {
  const o = (os ?? '').toLowerCase();
  if (o.startsWith('mac os x')) return 'macOS';
  if (o.startsWith('chrome os')) return 'Chrome OS';
  if (o.startsWith('windows 10')) return 'Windows 10/11';
  return os ?? '';
}

function browserIcon(browser: null | string): string {
  const b = (browser ?? '').toLowerCase();
  if (b.includes('chrome')) return 'mdi:google-chrome';
  if (b.includes('edge')) return 'mdi:microsoft-edge';
  if (b.includes('firefox')) return 'mdi:firefox';
  // mdi 无 Safari 品牌图标，用罗盘（Safari 图标的通用替代）
  if (b.includes('safari')) return 'mdi:compass-outline';
  if (b.includes('opera')) return 'mdi:opera';
  return 'mdi:web';
}

// 表格单元格通用渲染：图标 + 文字（inline-flex 对齐）
function withIcon(icon: string, text: string) {
  return h(
    'span',
    { style: 'display: inline-flex; align-items: center; gap: 4px' },
    [h(IconifyIcon, { icon, style: 'font-size: 16px' }), text],
  );
}

const opColumns = [
  { title: '时间', dataIndex: 'created_at', key: 'time', width: 180 },
  {
    title: '操作人',
    dataIndex: 'admin_username',
    key: 'admin_username',
    width: 120,
  },
  {
    title: '动作',
    dataIndex: 'action_label',
    key: 'action',
    width: 150,
    customRender: ({ record }: { record: AuditOperationItem }) =>
      h(Tag, { color: actionColor(record.action) }, () => record.action_label),
  },
  { title: '详情', dataIndex: 'detail', key: 'detail', width: 320 },
  {
    // IP + 国家合并为一列（后端仍分别返回，这里是展示层合并）。
    // bot 内部调用没有真实浏览器/IP 语境，直接显示来源「bot」。
    title: '位置',
    key: 'location',
    width: 180,
    customRender: ({ record }: { record: AuditOperationItem }) => {
      if (record.source === 'bot') return withIcon('mdi:robot', 'bot');
      const country = record.country
        ? `${flagEmoji(record.country)} ${record.country}`
        : null;
      const ip = record.ip || null;
      if (country && ip) return `${country} · ${ip}`;
      return country || ip || '-';
    },
  },
  {
    title: '浏览器',
    dataIndex: 'ua_browser',
    key: 'ua_browser',
    width: 160,
    customRender: ({ record }: { record: AuditOperationItem }) => {
      const browser = record.ua_browser;
      return browser
        ? h(Tooltip, { title: record.user_agent || browser }, () =>
            withIcon(browserIcon(browser), browser),
          )
        : '-';
    },
  },
  {
    title: '操作系统',
    dataIndex: 'ua_os',
    key: 'ua_os',
    width: 150,
    customRender: ({ text }: { text: null | string }) =>
      text ? withIcon(osIcon(text), osLabel(text)) : '-',
  },
  {
    title: '设备',
    dataIndex: 'ua_device',
    key: 'ua_device',
    width: 90,
    customRender: ({ text }: { text: null | string }) =>
      text
        ? withIcon(
            DEVICE_ICONS[text] || 'mdi:help-circle',
            DEVICE_LABELS[text] || text,
          )
        : '-',
  },
];

async function fetchOperations() {
  opLoading.value = true;
  try {
    const resp = await getAuditOperationsApi({
      offset: (opPage.value - 1) * opPageSize.value,
      limit: opPageSize.value,
      action: opAction.value,
      admin_username: opUsername.value.trim() || undefined,
      ua_device: opDevice.value,
      start: toLocalIso(opRange.value?.[0]),
      end: toLocalIso(opRange.value?.[1]),
    });
    operations.value = resp.items;
    opTotal.value = resp.total;
  } finally {
    opLoading.value = false;
  }
}

function onOpSearch() {
  opPage.value = 1;
  fetchOperations();
}

function onOpReset() {
  opUsername.value = '';
  opAction.value = undefined;
  opDevice.value = undefined;
  opRange.value = undefined;
  onOpSearch();
}

async function handleClearOperations() {
  await clearAuditOperationsApi();
  message.success('已清空操作记录');
  onOpSearch();
}

async function handleClearLogs() {
  await clearRuntimeLogsApi();
  message.success('已清空运行日志');
  onLogSearch();
}

function onOpTableChange(pag: any) {
  opPage.value = pag.current || 1;
  opPageSize.value = pag.pageSize || 20;
  fetchOperations();
}

// ── runtime log tab (keyset / load-more) ───────────────

const logs = ref<RuntimeLogItem[]>([]);
const logLoading = ref(false);
const logNextCursor = ref<null | number>(null);
const logLevel = ref<string | undefined>(undefined);
const logRange = ref<[dayjs.Dayjs, dayjs.Dayjs] | undefined>(undefined);

const logColumns = [
  { title: '时间', dataIndex: 'created_at', key: 'time', width: 180 },
  {
    title: '级别',
    dataIndex: 'level',
    key: 'level',
    width: 100,
    customRender: ({ text }: { text: string }) =>
      h(Tag, { color: levelColor(text) }, () => text),
  },
  { title: '来源', dataIndex: 'logger', key: 'logger', width: 200 },
  { title: '消息', dataIndex: 'message', key: 'message', width: 420 },
];

async function fetchLogs(reset = false) {
  if (reset) {
    logs.value = [];
    logNextCursor.value = null;
  }
  logLoading.value = true;
  try {
    const resp = await getRuntimeLogsApi({
      before_id: logNextCursor.value ?? undefined,
      limit: 50,
      level: logLevel.value,
      start: toLocalIso(logRange.value?.[0]),
      end: toLocalIso(logRange.value?.[1]),
    });
    logs.value = reset ? resp.items : [...logs.value, ...resp.items];
    logNextCursor.value = resp.next_cursor;
  } finally {
    logLoading.value = false;
  }
}

function onLogSearch() {
  fetchLogs(true);
}

function loadMoreLogs() {
  fetchLogs(false);
}

function formatTime(v: null | string): string {
  return v ? new Date(v).toLocaleString('zh-CN') : '-';
}

onMounted(() => {
  fetchStats();
  fetchRetention();
  fetchOperations();
  fetchLogs();
});
</script>

<template>
  <Page>
    <!-- Stat cards -->
    <Row :gutter="[16, 16]" style="margin-bottom: 16px">
      <Col v-for="card in statCards" :key="card.title" :xs="12" :sm="6">
        <Card class="stat-card">
          <div
            style="
              display: flex;
              align-items: center;
              justify-content: space-between;
            "
          >
            <Statistic
              :title="card.title"
              :value="card.value"
              :value-style="{ color: card.color }"
            />
            <div
              class="stat-icon"
              :style="{ background: card.bg, color: card.color }"
            >
              <IconifyIcon :icon="card.icon" style="font-size: 20px" />
            </div>
          </div>
        </Card>
      </Col>
    </Row>

    <!-- Retention config -->
    <Card style="margin-bottom: 16px">
      <div style="margin-bottom: 12px; font-size: 14px; font-weight: 600">
        <IconifyIcon
          icon="lucide:trash-2"
          style="margin-right: 6px; vertical-align: -2px; color: #1677ff"
        />
        日志保留策略
      </div>
      <div
        style="display: flex; flex-wrap: wrap; gap: 16px; align-items: center"
      >
        <Space>
          <span
            :style="{
              fontSize: '13px',
              color: isDark ? '#94a3b8' : '#666',
            }"
          >
            操作记录保留
          </span>
          <InputNumber
            v-model:value="auditDays"
            :min="1"
            :max="3650"
            :disabled="!hasAuditManage"
          />
          <span
            :style="{
              fontSize: '13px',
              color: isDark ? '#94a3b8' : '#666',
            }"
          >
            天
          </span>
        </Space>
        <Space>
          <span
            :style="{
              fontSize: '13px',
              color: isDark ? '#94a3b8' : '#666',
            }"
          >
            运行日志保留
          </span>
          <InputNumber
            v-model:value="logDays"
            :min="1"
            :max="3650"
            :disabled="!hasAuditManage"
          />
          <span
            :style="{
              fontSize: '13px',
              color: isDark ? '#94a3b8' : '#666',
            }"
          >
            天
          </span>
        </Space>
        <Button
          v-if="hasAuditManage"
          type="primary"
          :loading="savingRetention"
          @click="saveRetention"
        >
          保存
        </Button>
      </div>
      <div
        v-if="!hasAuditManage"
        :style="{
          marginTop: '8px',
          fontSize: '12px',
          color: isDark ? '#94a3b8' : '#999',
        }"
      >
        当前账号仅有查看权限，修改保留策略需要「管理审计数据」权限。
      </div>
    </Card>

    <Tabs default-active-key="operations">
      <!-- Operation records -->
      <Tabs.TabPane key="operations" tab="操作记录">
        <div
          style="
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            align-items: center;
            margin-bottom: 16px;
          "
        >
          <Space style="flex-wrap: wrap">
            <Input
              v-model:value="opUsername"
              placeholder="按操作人搜索"
              allow-clear
              style="width: 160px"
              @press-enter="onOpSearch"
            />
            <Select
              v-model:value="opAction"
              placeholder="动作类型"
              allow-clear
              style="width: 180px"
              :options="ACTION_OPTIONS"
              @change="onOpSearch"
            />
            <Select
              v-model:value="opDevice"
              placeholder="设备类型"
              allow-clear
              style="width: 120px"
              :options="DEVICE_OPTIONS"
              @change="onOpSearch"
            />
            <DatePicker.RangePicker
              v-model:value="opRange"
              :allow-clear="true"
              @change="onOpSearch"
            />
            <Button type="primary" @click="onOpSearch">查询</Button>
            <Button @click="onOpReset">重置</Button>
          </Space>
          <!-- 用普通 span 承载右对齐 margin：antd Popconfirm 不一定把 style 透传给 flex 项 -->
          <span v-if="hasAuditManage" style="margin-left: auto">
            <Popconfirm
              title="确定清空全部操作记录？"
              description="此操作不可恢复"
              ok-text="清空"
              ok-type="danger"
              cancel-text="取消"
              @confirm="handleClearOperations"
            >
              <Button danger>清空</Button>
            </Popconfirm>
          </span>
        </div>

        <Table
          :columns="opColumns"
          :data-source="operations"
          :loading="opLoading"
          :scroll="{ x: 'max-content' }"
          :pagination="{
            current: opPage,
            pageSize: opPageSize,
            total: opTotal,
            showTotal: (t: number) => `共 ${t} 条`,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
          }"
          row-key="id"
          @change="onOpTableChange"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'time'">
              {{ formatTime((record as AuditOperationItem).created_at) }}
            </template>
            <template v-else-if="column.key === 'detail'">
              <Tooltip
                v-if="(record as AuditOperationItem).detail"
                :title="(record as AuditOperationItem).detail"
              >
                <span class="ellipsis-text">
                  {{ (record as AuditOperationItem).detail }}
                </span>
              </Tooltip>
              <span v-else>-</span>
            </template>
          </template>
        </Table>
      </Tabs.TabPane>

      <!-- Runtime logs -->
      <Tabs.TabPane key="runtime" tab="运行日志">
        <div
          style="
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            align-items: center;
            margin-bottom: 16px;
          "
        >
          <Space style="flex-wrap: wrap">
            <Select
              v-model:value="logLevel"
              placeholder="日志级别"
              allow-clear
              style="width: 150px"
              :options="LEVEL_OPTIONS"
              @change="onLogSearch"
            />
            <DatePicker.RangePicker
              v-model:value="logRange"
              :allow-clear="true"
              @change="onLogSearch"
            />
            <Button type="primary" @click="onLogSearch">查询</Button>
          </Space>
          <!-- 用普通 span 承载右对齐 margin：antd Popconfirm 不一定把 style 透传给 flex 项 -->
          <span v-if="hasAuditManage" style="margin-left: auto">
            <Popconfirm
              title="确定清空全部运行日志？"
              description="此操作不可恢复"
              ok-text="清空"
              ok-type="danger"
              cancel-text="取消"
              @confirm="handleClearLogs"
            >
              <Button danger>清空</Button>
            </Popconfirm>
          </span>
        </div>

        <Table
          :columns="logColumns"
          :data-source="logs"
          :loading="logLoading"
          :scroll="{ x: 'max-content' }"
          :pagination="false"
          row-key="id"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'time'">
              {{ formatTime((record as RuntimeLogItem).created_at) }}
            </template>
            <template v-else-if="column.key === 'message'">
              <Tooltip :title="(record as RuntimeLogItem).message">
                <span class="ellipsis-text">
                  {{ (record as RuntimeLogItem).message }}
                </span>
              </Tooltip>
            </template>
          </template>
        </Table>
        <div
          v-if="logNextCursor !== null"
          style="margin-top: 12px; text-align: center"
        >
          <Button :loading="logLoading" @click="loadMoreLogs">加载更多</Button>
        </div>
      </Tabs.TabPane>
    </Tabs>
  </Page>
</template>

<style scoped>
.ellipsis-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stat-card {
  transition:
    box-shadow 0.2s,
    transform 0.2s;
}

.stat-card:hover {
  box-shadow: 0 4px 12px rgb(0 0 0 / 8%);
  transform: translateY(-2px);
}

.stat-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
}
</style>
