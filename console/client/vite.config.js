import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  server: {
    port: 5173,
    // 开发环境代理配置
    // 将 /public 和 /private 开头的请求代理到后端
    proxy: {
      '/public': {
        target: 'http://localhost:8081',
        changeOrigin: true
      },
      '/private': {
        target: 'http://localhost:8081',
        changeOrigin: true
      }
    }
  }
})
