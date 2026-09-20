<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import { computed, h, onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';

import {
  Button,
  Card,
  Col,
  Input,
  message,
  Popconfirm,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
} from 'ant-design-vue';

import { blockVisitorApi, unblockVisitorApi } from '#/api/core';
import { requestClient } from '#/api/request';
import { formatBeijingDateTime } from '#/utils/datetime';

defineOptions({ name: 'MessageHistory' });

interface Conversation {
  user_id: null | number;
  telegram_id: number;
  first_name: null | string;
  username: null | string;
  is_premium: boolean;
  conv_code: null | string;
  message_count: number;
  last_message_at: null | string;
  last_message_preview: string;
  is_active: boolean; // 会话 DB 标记：是否还有未结束的会话
  // 会话超时剩余（三态）：>0 窗口内倒计时；0 空闲已超过有限超时（休眠）；
  // null 永不超时（或无活跃会话，用 is_active 区分）
  conv_timeout_remaining: null | number;
  is_blocked: boolean;
  rate_limited: boolean;
  rate_limited_count: number;
  rate_limited_remaining: number;
}

function avatarChar(name: string): string {
  const match = name.match(/\p{L}/u);
  return match ? match[0].toUpperCase() : '?';
}

function avatarColor(tgUserId: number, name: string): string {
  const base = Math.trunc((tgUserId * 2_654_435_761) % 4_294_967_296) % 360;
  let offset = 0;
  for (const ch of name)
    offset = Math.trunc((offset << 5) - offset + (ch.codePointAt(0) ?? 0));
  const hue = (base + (offset % 20) - 10 + 360) % 360;
  return `hsl(${hue}, 50%, 40%)`;
}

function timeoutTip(r: Conversation): string {
  if (!r.is_active) return '会话已结束';
  const s = r.conv_timeout_remaining;
  if (s === null || s === undefined) return '对话中 · 永不超时';
  if (s <= 0) return '对话已超时、已休眠';
  if (s < 60) return '对话中 · 剩余不到 1 分钟';
  if (s < 3600) return `对话中 · 剩余约 ${Math.ceil(s / 60)} 分钟`;
  return `对话中 · 剩余约 ${Math.ceil(s / 3600)} 小时`;
}

// 状态点颜色：绿=对话中（窗口内 / 永不超时）；橙=会话仍在但对话已超时休眠；
// 灰=会话已结束（被超时连坐、访客退出、识别码失效或管理员解绑）
function statusColor(r: Conversation): string {
  if (!r.is_active) return '#d9d9d9';
  return r.conv_timeout_remaining === 0 ? '#fa8c16' : '#52c41a';
}

function formatRemaining(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m} 分 ${sec} 秒` : `${sec} 秒`;
}

const conversations = ref<Conversation[]>([]);
const loading = ref(false);
const searchText = ref('');

const filteredConversations = computed(() => {
  const q = searchText.value.trim().toLowerCase();
  if (!q) return conversations.value;
  return conversations.value.filter(
    (c) =>
      (c.first_name ?? '').toLowerCase().includes(q) ||
      (c.username ?? '').toLowerCase().includes(q) ||
      String(c.telegram_id).includes(q),
  );
});

// 活跃中 = 会话 active 且未空闲超过超时窗口（窗口内 / 永不超时）。
// conv_timeout_remaining===0 表示空闲已超过有限超时（休眠），不计活跃。
const activeCount = computed(
  () =>
    conversations.value.filter(
      (c) => c.is_active && c.conv_timeout_remaining !== 0,
    ).length,
);
const blockedCount = computed(
  () => conversations.value.filter((c) => c.is_blocked).length,
);
const premiumCount = computed(
  () => conversations.value.filter((c) => c.is_premium).length,
);

async function handleBlock(record: Conversation) {
  await blockVisitorApi(record.telegram_id);
  record.is_blocked = true;
  message.success('已拉黑');
}

async function handleUnblock(record: Conversation) {
  await unblockVisitorApi(record.telegram_id);
  record.is_blocked = false;
  message.success('已取消拉黑');
}

const columns: TableColumnsType = [
  {
    title: '',
    key: 'status',
    width: 28,
    align: 'center',
    customRender: ({ record }: { record: Conversation }) => {
      const tip = timeoutTip(record);
      return h('span', {
        title: tip,
        style: {
          display: 'inline-block',
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          backgroundColor: statusColor(record),
          verticalAlign: 'middle',
        },
      });
    },
  },
  {
    title: 'TG ID',
    dataIndex: 'telegram_id',
    key: 'telegram_id',
    width: 80,
    align: 'center',
  },
  {
    title: '昵称',
    key: 'first_name',
    width: 110,
    customRender: ({ record }: { record: Conversation }) =>
      h('div', { style: 'display:flex; align-items:center; gap:8px' }, [
        h(
          'span',
          {
            style: {
              display: 'inline-flex',
              width: '28px',
              height: '28px',
              flexShrink: 0,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              background: avatarColor(
                record.telegram_id,
                record.first_name || '',
              ),
              color: '#fff',
              fontSize: '13px',
              fontWeight: '600',
            },
          },
          avatarChar(record.first_name || record.username || ''),
        ),
        h('span', {}, record.first_name || '-'),
      ]),
  },
  {
    title: '用户名',
    dataIndex: 'username',
    key: 'username',
    width: 90,
    align: 'center',
    customRender: ({ text }: { text: null | string }) =>
      text
        ? h(
            'a',
            {
              href: `https://t.me/${text}`,
              target: '_blank',
              style: { fontWeight: 'bold' },
            },
            `@${text}`,
          )
        : '-',
  },
  {
    title: '会员',
    dataIndex: 'is_premium',
    key: 'is_premium',
    width: 55,
    align: 'center',
    customRender: ({ text }: { text: boolean }) =>
      text ? h(Tag, { color: 'gold' }, () => 'Pre') : '-',
  },
  {
    title: '识别码',
    dataIndex: 'conv_code',
    key: 'conv_code',
    width: 80,
    align: 'center',
    customRender: ({ text }: { text: null | string }) =>
      text ? h('code', { style: { fontSize: '12px' } }, text) : '-',
  },
  {
    title: '静默',
    key: 'rate_limited',
    width: 110,
    align: 'center',
    customRender: ({ record }: { record: Conversation }) => {
      const count = record.rate_limited_count ?? 0;
      if (record.rate_limited) {
        return h(
          Tooltip,
          {
            title: `剩余 ${formatRemaining(record.rate_limited_remaining ?? 0)}`,
          },
          () => h(Tag, { color: 'red' }, () => `静默中 · ${count} 次`),
        );
      }
      return count > 0
        ? h(
            'span',
            { style: 'color:hsl(var(--muted-foreground) / 80%)' },
            `${count} 次`,
          )
        : '-';
    },
  },
  {
    title: '消息数',
    dataIndex: 'message_count',
    key: 'message_count',
    width: 65,
    align: 'center',
  },
  {
    title: '最新消息',
    dataIndex: 'last_message_preview',
    key: 'last_message_preview',
    width: 190,
    ellipsis: true,
  },
  {
    title: '最近消息时间',
    dataIndex: 'last_message_at',
    key: 'last_message_at',
    width: 140,
    customRender: ({ text }: { text: null | string }) =>
      formatBeijingDateTime(text),
  },
  { title: '操作', key: 'action', width: 100 },
];

// Table 的横向滚动基准宽度：必须是**数值**，不能写 'max-content'。
//
// max-content 会让内层 <table> 拿到 width:max-content，语义就是「按内容撑开」。
// 而本表因为有 ellipsis 列，table-layout 是 fixed——宽度不确定时它对列宽没有约束
// 力，于是内容说了算：访客最后一条消息只要够长，整张表就会被撑到屏幕之外，「最新
// 消息」列自己的 ellipsis 也一并失效。
//
// 取各列 width 之和，固定布局才会真正按列宽走。写成计算式而不是写死数字，是为了
// 以后调列宽时不会漏改这里。
const scrollX = computed(() =>
  columns.reduce(
    (sum, col) =>
      sum + ('width' in col && typeof col.width === 'number' ? col.width : 120),
    0,
  ),
);

async function fetchConversations() {
  loading.value = true;
  try {
    conversations.value = await requestClient.get('/my-conversations');
  } finally {
    loading.value = false;
  }
}

onMounted(fetchConversations);
</script>

<template>
  <Page>
    <Row :gutter="[16, 16]" style="margin-bottom: 16px">
      <Col :xs="12" :sm="6">
        <Card>
          <Statistic title="总访客" :value="conversations.length" />
        </Card>
      </Col>
      <Col :xs="12" :sm="6">
        <Card>
          <Statistic
            title="活跃中"
            :value="activeCount"
            :value-style="{ color: '#52c41a' }"
          />
        </Card>
      </Col>
      <Col :xs="12" :sm="6">
        <Card>
          <Statistic
            title="已拉黑"
            :value="blockedCount"
            :value-style="{ color: '#ff4d4f' }"
          />
        </Card>
      </Col>
      <Col :xs="12" :sm="6">
        <Card>
          <Statistic
            title="会员"
            :value="premiumCount"
            :value-style="{ color: '#faad14' }"
          />
        </Card>
      </Col>
    </Row>

    <Space style="margin-bottom: 16px">
      <Input.Search
        v-model:value="searchText"
        placeholder="搜索昵称、用户名或 TG ID"
        allow-clear
        style="width: 280px"
      />
    </Space>

    <Table
      :columns="columns"
      :data-source="filteredConversations"
      :loading="loading"
      :scroll="{ x: scrollX }"
      :pagination="{
        defaultPageSize: 20,
        showSizeChanger: true,
        pageSizeOptions: ['10', '20', '50', '100'],
        showTotal: (t: number) => `共 ${t} 条`,
      }"
      row-key="telegram_id"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'action'">
          <template v-if="(record as Conversation).is_blocked">
            <Button
              size="small"
              type="primary"
              @click="handleUnblock(record as Conversation)"
            >
              取消拉黑
            </Button>
          </template>
          <template v-else>
            <Popconfirm
              title="确定拉黑该用户？"
              :description="`TG ID: ${(record as Conversation).telegram_id}`"
              ok-text="确认拉黑"
              cancel-text="取消"
              @confirm="handleBlock(record as Conversation)"
            >
              <Button size="small" danger> 拉黑 </Button>
            </Popconfirm>
          </template>
        </template>
      </template>
    </Table>
  </Page>
</template>
