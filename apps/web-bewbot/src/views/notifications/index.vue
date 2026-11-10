<script lang="ts" setup>
import type { PanelNotification } from '#/api';

import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import {
  Badge,
  Card,
  CardContent,
  VbenAvatar,
  VbenButton,
  VbenSegmented,
  VbenSpinner,
} from '@vben-core/shadcn-ui';

import {
  notificationAvatar,
  useNotifications,
} from '#/composables/use-notifications';
import { formatBeijingDateTime } from '#/utils/datetime';

defineOptions({ name: 'Notifications' });

const router = useRouter();
const { clearAll, dismiss, items, loading, markRead, refresh } =
  useNotifications();

// VbenSegmented 的 v-model 是 string（不是字面量联合），这里按 string 存。
const filter = ref('all');

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
    <!-- 工具栏上的按钮用默认尺寸（h-9）：VbenSegmented 的 TabsList 就是 h-9，
         `sm` 是 h-8，放在同一行会差 4px，看着不齐。 -->
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <div class="w-64 max-w-full">
        <VbenSegmented v-model="filter" :tabs="FILTER_OPTIONS" />
      </div>
      <VbenButton :loading="loading" variant="outline" @click="refresh">
        刷新
      </VbenButton>
      <span class="flex-1"></span>
      <VbenButton v-if="items.length > 0" variant="secondary" @click="clearAll">
        全部已读
      </VbenButton>
    </div>

    <div class="relative min-h-30">
      <!-- Vben 的 Spinner 是覆盖层：放在 relative 容器里，不撑开布局 -->
      <VbenSpinner :spinning="loading" />

      <div
        v-if="filtered.length === 0"
        class="text-muted-foreground py-16 text-center"
      >
        <IconifyIcon
          icon="lucide:inbox"
          class="mx-auto mb-2 size-8 opacity-60"
        />
        <p class="text-sm">没有需要处理的通知</p>
      </div>

      <div v-else class="flex flex-col gap-2">
        <Card v-for="item in filtered" :key="item.key" class="gap-0 py-0">
          <CardContent class="flex items-start gap-3 p-3">
            <VbenAvatar
              :alt="item.kind === 'alert' ? '告警' : '待办'"
              :size="36"
              :src="notificationAvatar(item.kind)"
            />
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
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
              <VbenButton
                v-if="item.link"
                size="sm"
                variant="outline"
                @click="open(item)"
              >
                去处理
              </VbenButton>
              <VbenButton
                v-if="item.kind === 'alert'"
                size="sm"
                variant="ghost"
                @click="markRead(item.key)"
              >
                标记已读
              </VbenButton>
              <VbenButton
                v-else
                size="sm"
                variant="ghost"
                @click="dismiss(item.key)"
              >
                忽略
              </VbenButton>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </Page>
</template>
