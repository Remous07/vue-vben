import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    component: () => import('#/views/notifications/index.vue'),
    meta: {
      // 内容按后端权限过滤，页面本身对所有角色可见（support 也能进来，只是看到的东西少）。
      authority: ['superadmin', 'operator', 'support'],
      icon: 'lucide:bell',
      order: 15,
      title: '通知中心',
    },
    name: 'Notifications',
    path: '/notifications',
  },
];

export default routes;
