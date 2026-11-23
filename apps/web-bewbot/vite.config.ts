import { defineConfig } from '@vben/vite-config';

export default defineConfig(async () => {
  return {
    application: {},
    vite: {
      resolve: {
        // 与上游 web-antd 一致：构建产物里只保留一份 vue-router 实例
        dedupe: ['vue-router'],
      },
      server: {
        proxy: {
          '/api': {
            changeOrigin: true,
            // 代理到 Python FastAPI 后端
            target: 'http://localhost:8000',
            ws: true,
          },
        },
      },
    },
  };
});
