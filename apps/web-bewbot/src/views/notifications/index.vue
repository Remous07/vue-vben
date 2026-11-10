<script lang="ts" setup>
import type { PanelNotification } from '#/api';

import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';

import { Badge } from '@vben-core/shadcn-ui';

import { Button, Empty, Segmented, Spin } from 'ant-design-vue';

import {
  notificationAvatar,
  useNotifications,
} from '#/composables/use-notifications';
import { formatBeijingDateTime } from '#/utils/datetime';

defineOptions({ name: 'Notifications' });

const router = useRouter();
const { clearAll, dismiss, items, loading, markRead, refresh } =
  useNotifications();

const filter = ref<'alert' | 'all' | 'todo'>('all');

const FILTER_OPTIONS = [
  { label: '全部', value: 'all' },
  { label: '告警', value: 'alert' },
  { label: '待办', value: 'todo' },
];

const filtered = computed(() =>
  filter.value === 'all'
    ? items.value
    : items.value.filter((item) => item.kind === filter.value),
);

function open(item: PanelNotification) {
  if (item.link) {
    router.push({ path: item.link, query: item.query ?? {} });
  }
}
</script>

<template>
  <Page
    description="告警是已经发生的事，读过即可；待办是此刻成立的条件，做完或忽略后才会消失。"
    title="通知中心"
  >
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <Segmented v-model:value="filter" :options="FILTER_OPTIONS" />
      <Button :loading="loading" @click="refresh">刷新</Button>
      <span style="margin-left: auto"></span>
      <Button v-if="items.length > 0" @click="clearAll">全部已读</Button>
    </div>

    <Spin :spinning="loading">
      <div v-if="filtered.length === 0" class="py-16">
        <Empty description="没有需要处理的通知" />
      </div>

      <div v-else class="flex flex-col gap-2">
        <div
          v-for="item in filtered"
          :key="item.key"
          class="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
        >
          <img
            :src="notificationAvatar(item.kind)"
            alt=""
            class="size-9 shrink-0 rounded-full"
          />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <!-- 类型标注保留 Vben 的 Badge；页面其他控件仍是本应用惯用的 antd -->
              <Badge
                :variant="item.kind === 'alert' ? 'destructive' : 'default'"
              >
                {{ item.kind === 'alert' ? '告警' : '待办' }}
              </Badge>
              <span class="font-medium">{{ item.title }}</span>
            </div>
            <p class="text-muted-foreground mt-1 text-sm break-words">
              {{ item.message }}
            </p>
            <p v-if="item.date" class="text-muted-foreground mt-1 text-xs">
              {{ formatBeijingDateTime(item.date) }}
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <Button v-if="item.link" size="small" @click="open(item)">
              去处理
            </Button>
            <Button
              v-if="item.kind === 'alert'"
              size="small"
              type="link"
              @click="markRead(item.key)"
            >
              标记已读
            </Button>
            <Button v-else size="small" type="link" @click="dismiss(item.key)">
              忽略
            </Button>
          </div>
        </div>
      </div>
    </Spin>
  </Page>
</template>
