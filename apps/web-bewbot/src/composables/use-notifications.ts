import type { NotificationItem } from '@vben/layouts';

import type { PanelNotification } from '#/api';

import { computed, ref } from 'vue';

import { message } from 'ant-design-vue';

import {
  clearNotificationsApi,
  getNotificationsApi,
  setNotificationStateApi,
} from '#/api';
import { formatBeijingDateTime } from '#/utils/datetime';

/** 轮询间隔。告警是「事后才知道」的东西，60 秒足够，也不必为它引入 SSE。 */
const POLL_INTERVAL = 60_000;

const base = import.meta.env.BASE_URL;

const AVATARS = {
  // 告警：红色感叹号圆环（warn）；待办：蓝色加号圆环（todo）。
  // 两张都是 public/svg/ 下的静态图，不依赖外网。
  alert: `${base}svg/warn.svg`,
  todo: `${base}svg/todo.svg`,
} as const;

// 模块级状态：顶栏铃铛和「通知中心」页共用同一份，不会各拉各的、各标各的。
const items = ref<PanelNotification[]>([]);
const unreadAlerts = ref(0);
const loading = ref(false);

let pollTimer: null | ReturnType<typeof setInterval> = null;

async function refresh() {
  if (loading.value) return;
  loading.value = true;
  try {
    const data = await getNotificationsApi();
    items.value = data.items;
    unreadAlerts.value = data.unread_alerts;
  } catch {
    // 一次网络抖动不该把铃铛清空：保留上一轮结果，等下一次轮询。
  } finally {
    loading.value = false;
  }
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') {
    void refresh();
  }
}

/**
 * 开始轮询。只该由布局调用一次；页面隐藏时跳过请求，重新可见时立刻补一次。
 */
export function startNotificationPolling() {
  if (pollTimer !== null) return;
  void refresh();
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') {
      void refresh();
    }
  }, POLL_INTERVAL);
  document.addEventListener('visibilitychange', onVisibilityChange);
}

export function stopNotificationPolling() {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  document.removeEventListener('visibilitychange', onVisibilityChange);
}

function dropLocally(key: string) {
  const item = items.value.find((entry) => entry.key === key);
  items.value = items.value.filter((entry) => entry.key !== key);
  if (item?.kind === 'alert') {
    unreadAlerts.value = Math.max(0, unreadAlerts.value - 1);
  }
}

/** 告警：读过就不再出现。 */
async function markRead(key: string) {
  try {
    await setNotificationStateApi(key, 'read');
    dropLocally(key);
  } catch {
    message.error('操作失败，请稍后重试');
  }
}

/** 待办：这次先忽略；条件不消失的话 7 天后会回来。 */
async function dismiss(key: string) {
  try {
    await setNotificationStateApi(key, 'dismissed');
    dropLocally(key);
  } catch {
    message.error('操作失败，请稍后重试');
  }
}

/** 「全部已读」= 告警记 read、待办记 dismissed。 */
async function clearAll() {
  try {
    await clearNotificationsApi();
    items.value = [];
    unreadAlerts.value = 0;
  } catch {
    message.error('操作失败，请稍后重试');
  }
}

const widgetItems = computed<NotificationItem[]>(() =>
  items.value.map((item) => ({
    avatar: AVATARS[item.kind],
    date: item.date ? formatBeijingDateTime(item.date) : '',
    id: item.key,
    // 告警没读 → 显示 ✓（标记已读）；待办没有「已读」这回事，直接显示 ✗（这次忽略）。
    isRead: item.kind === 'todo',
    link: item.link ?? undefined,
    message: item.message,
    query: item.query ?? undefined,
    title: item.title,
  })),
);

const showDot = computed(() => unreadAlerts.value > 0);

/** 通知类型对应的头像（通知中心页也用同一张）。 */
export function notificationAvatar(kind: PanelNotification['kind']): string {
  return AVATARS[kind];
}

/** 顶栏与通知中心共用的读数。轮询生命周期由布局管理（见 start/stop）。 */
export function useNotifications() {
  return {
    clearAll,
    dismiss,
    items,
    loading,
    markRead,
    refresh,
    showDot,
    unreadAlerts,
    widgetItems,
  };
}
