import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    component: () => import('#/views/account/passkeys/index.vue'),
    meta: {
      // 入口在个人中心的「两步验证」卡片里；菜单再列一遍只会分散注意力。
      hideInMenu: true,
      title: '通行密钥',
    },
    name: 'Passkeys',
    path: '/passkeys',
  },
];

export default routes;
