import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { VantResolver } from '@vant/auto-import-resolver'
import { fileURLToPath, URL } from 'node:url'

/**
 * Vite 配置
 * https://vitejs.dev/config/
 */
export default defineConfig({
  plugins: [
    vue(),
    // Vant 组件自动按需引入
    Components({
      resolvers: [VantResolver()]
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5174,
    host: '0.0.0.0',
    // 开发环境代理配置
    // 将 /public 和 /private 开头的请求代理到后端
    proxy: {
      '/public': {
        target: 'http://localhost:8080',
        changeOrigin: true
      },
      '/private': {
        target: 'http://localhost:8080',
        changeOrigin: true
      }
    }
  }
})
