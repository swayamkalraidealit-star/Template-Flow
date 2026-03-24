import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/api/render-image': {
        target: 'https://templated-assets.s3.amazonaws.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/render-image/, ''),
      },
    },
  },
});
