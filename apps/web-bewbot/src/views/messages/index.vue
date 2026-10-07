<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { VisitorTranslation } from './visitor-translation';

import { computed, h, onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { usePreferences } from '@vben/preferences';
import { useUserStore } from '@vben/stores';

import {
  Alert,
  Button,
  Card,
  Col,
  Drawer,
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

import {
  directionBlocks,
  directionTag,
  DRAWER_HINT,
  DRAWER_SCOPE,
  isTranslating,
  lastUsedText,
  TRANSLATION_PERMISSION,
} from './visitor-translation';

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
  // 这位访客的翻译设置（「管理员 × 访客」一对一份）。
  // **null 只有一个意思：登录者没有 `translation:use`**——有权限的人每位访客都会
  // 拿到一份，从没设置过的那位拿到的是「两向都关」的默认态。所以这一列画不画，
  // 看的是权限；某一行的值是空串，才是「这位访客没在翻」。
  translation: null | VisitorTranslation;
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

// 抽屉。存**这一行**而不是 id：抽屉里要显示的就是这一行的设置，页面也不会在抽屉
// 开着的时候替换数据（没有轮询、没有自动刷新）。
const drawerRecord = ref<Conversation | null>(null);
const drawerOpen = computed({
  get: () => drawerRecord.value !== null,
  set: (open: boolean) => {
    if (!open) drawerRecord.value = null;
  },
});

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
const translatingCount = computed(
  () => conversations.value.filter((c) => isTranslating(c.translation)).length,
);

// 这一列和那颗按钮画不画，看的是**权限**，不是数据。
//
// 后端对没有 `translation:use` 的人一律不下发这份数据（`translation` 恒为 null），
// 所以这里两种判据是等价的——但**门在后端**：这里少画一列只是别让人看见一个空列，
// 不是权限本身。别把这两件事对调。
const userStore = useUserStore();
const canTranslate = computed(() =>
  Boolean(userStore.userInfo?.permissions?.includes(TRANSLATION_PERMISSION)),
);

const { isMobile } = usePreferences();

/** 抽屉顶部点名是哪位访客——抽屉盖住了表格，不写就不知道在看谁的。 */
const drawerTitleName = computed(() => {
  const record = drawerRecord.value;
  if (!record) return '';
  return record.first_name || record.username || `TG ${record.telegram_id}`;
});

/** 标题下面那行身份：名字会重，TG ID 不会。 */
const drawerSubtitle = computed(() => {
  const record = drawerRecord.value;
  if (!record) return '';
  const handle = record.username ? `@${record.username}` : '';
  return [handle, `TG ${record.telegram_id}`].filter(Boolean).join(' · ');
});

const drawerBlocks = computed(() => {
  const translation = drawerRecord.value?.translation;
  return translation ? directionBlocks(translation) : [];
});

const drawerLastUsed = computed(() => {
  const translation = drawerRecord.value?.translation;
  return translation ? lastUsedText(translation, formatBeijingDateTime) : null;
});

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

const columns = computed<TableColumnsType>(() => [
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
  // 翻译那一列**只有有权限的人看得到**。没有权限时后端也不下发这份数据，两处一致。
  ...(canTranslate.value
    ? [
        {
          title: '翻译',
          key: 'translation',
          width: 75,
          align: 'center' as const,
          customRender: ({ record }: { record: Conversation }) => {
            const label = directionTag(record.translation);
            return label ? h(Tag, { color: 'blue' }, () => label) : '-';
          },
        },
      ]
    : []),
  { title: '操作', key: 'action', width: canTranslate.value ? 150 : 100 },
]);

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
  columns.value.reduce(
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
    <!--
      五张卡用 :sm="8"（桌面端一行三张，3+2）而不是原来的 ":sm=6"（一行四张）：
      4 + 1 会让第二行孤零零挂着一张，看着像漏排了。
    -->
    <Row :gutter="[16, 16]" style="margin-bottom: 16px">
      <Col :xs="12" :sm="8">
        <Card>
          <Statistic title="总访客" :value="conversations.length" />
        </Card>
      </Col>
      <Col :xs="12" :sm="8">
        <Card>
          <Statistic
            title="活跃中"
            :value="activeCount"
            :value-style="{ color: '#52c41a' }"
          />
        </Card>
      </Col>
      <Col :xs="12" :sm="8">
        <Card>
          <Statistic
            title="已拉黑"
            :value="blockedCount"
            :value-style="{ color: '#ff4d4f' }"
          />
        </Card>
      </Col>
      <Col :xs="12" :sm="8">
        <Card>
          <Statistic
            title="会员"
            :value="premiumCount"
            :value-style="{ color: '#faad14' }"
          />
        </Card>
      </Col>
      <!-- 「翻译中」跟着那一列一起藏：没有 translation:use 的人连这一列都看不到，
           顶上一张恒为 0 的统计卡只会让人来问「这个 0 是什么意思」。 -->
      <Col v-if="canTranslate" :xs="12" :sm="8">
        <Card>
          <Statistic
            title="翻译中"
            :value="translatingCount"
            :value-style="{ color: '#1677ff' }"
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
          <Space :size="4">
            <!-- 翻译是**只读**的：面板是「回头看一眼」的地方，改留在 Telegram 那张卡上
                 （抽屉底部也这么写着）。没有权限的人连这颗按钮都看不到。 -->
            <Button
              v-if="canTranslate"
              size="small"
              @click="drawerRecord = record as Conversation"
            >
              翻译
            </Button>
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
          </Space>
        </template>
      </template>
    </Table>

    <Drawer v-model:open="drawerOpen" :width="isMobile ? '100%' : 440">
      <template #title>
        <Space :size="8" align="center">
          <IconifyIcon icon="lucide:languages" style="color: #1677ff" />
          <span style="font-weight: 600">访客翻译</span>
        </Space>
      </template>

      <template v-if="drawerRecord?.translation">
        <!-- 先说这是谁：抽屉盖住了表格，而名字会重、TG ID 不会 -->
        <div class="vt-head">
          <span class="vt-head__name">{{ drawerTitleName }}</span>
          <span class="vt-head__meta">{{ drawerSubtitle }}</span>
        </div>

        <!--
          两个方向各成一块，形状一致（标题 + 状态标签 + 一句说明），扫一眼就能比出哪边
          是活的：关着的那块没有服务商那一行，因此更矮，左侧色条也撤掉了。
        -->
        <div
          v-for="block in drawerBlocks"
          :key="block.key"
          class="vt-block"
          :class="{ 'vt-block--off': !block.enabled }"
        >
          <div class="vt-block__head">
            <Space :size="6" align="center">
              <IconifyIcon :icon="block.icon" class="vt-block__icon" />
              <span class="vt-block__title">{{ block.title }}</span>
            </Space>
            <Tag :color="block.enabled ? 'success' : 'default'">
              {{ block.statusText }}
            </Tag>
          </div>
          <div class="vt-block__desc">{{ block.description }}</div>
          <div v-if="block.providerLine" class="vt-block__meta">
            {{ block.providerLine }}
          </div>
        </div>

        <div v-if="drawerLastUsed" class="vt-lastused">
          <span class="vt-lastused__label">上次翻译</span>
          <span>{{ drawerLastUsed }}</span>
        </div>

        <Alert
          class="vt-hint"
          type="info"
          show-icon
          :message="DRAWER_SCOPE"
          :description="DRAWER_HINT"
        />
      </template>

      <!-- 正常走不到（没有权限的人连这一列都看不到），但抽屉开着时数据被换掉之类的
           情况不该给一个空白抽屉 -->
      <p v-else class="vt-empty">没有可显示的翻译设置。</p>
    </Drawer>
  </Page>
</template>

<style scoped>
/* 抽屉内部那几块的排版。用 class 而不是一长串内联 style：这块有层次
   （标题行 / 说明 / 服务商），内联写着读不出来。 */

.vt-head {
  margin-bottom: 16px;
}

.vt-head__name {
  display: block;
  font-size: 15px;
  font-weight: 600;
}

.vt-head__meta {
  font-size: 12px;
  color: hsl(var(--muted-foreground) / 80%);
}

.vt-block {
  padding: 12px 14px;
  margin-bottom: 10px;
  border: 1px solid hsl(var(--border));
  border-left: 3px solid #1677ff;
  border-radius: 6px;
}

/* 关着的那块：去掉左侧色条、不铺底色、文字压暗。
   色条是「这条路是通的」的信号，不该给一个没在工作的方向。

   **刻意不铺底色**（试过 `hsl(var(--muted) / 40%)`，渲染出来是一团糊的）：那块里的
   标签本身就是灰的，再垫一层灰底，三者叠在一起「未启用」几乎读不出来。空心 + 灰边
   与「已启用」那块的实心 + 蓝条对比也更清楚——实心/空心的差别一眼就分得出。 */
.vt-block--off {
  border-left-color: hsl(var(--border));
}

.vt-block__head {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.vt-block__icon {
  font-size: 15px;
  color: #1677ff;
}

.vt-block--off .vt-block__icon {
  color: hsl(var(--muted-foreground));
}

.vt-block__title {
  font-weight: 600;
}

.vt-block__desc {
  margin-top: 6px;
  font-size: 13px;
}

.vt-block--off .vt-block__desc {
  color: hsl(var(--muted-foreground) / 80%);
}

.vt-block__meta {
  margin-top: 2px;
  font-size: 12px;
  color: hsl(var(--muted-foreground) / 80%);
}

.vt-lastused {
  display: flex;
  gap: 8px;
  padding: 10px 2px;
  margin-top: 4px;
  font-size: 13px;
  border-top: 1px solid hsl(var(--border));
}

.vt-lastused__label {
  color: hsl(var(--muted-foreground) / 80%);
}

.vt-hint {
  margin-top: 12px;
}

.vt-empty {
  font-size: 13px;
  color: hsl(var(--muted-foreground) / 80%);
}
</style>
