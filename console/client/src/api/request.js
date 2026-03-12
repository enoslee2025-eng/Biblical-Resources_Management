/**
 * Axios 请求封装
 * 统一处理请求拦截、响应拦截、错误处理
 */
import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '@/router'

/** 创建 Axios 实例，baseURL 为空（使用 Vite 代理） */
const request = axios.create({
  baseURL: '',
  timeout: 15000
})

/**
 * 请求拦截器
 * 自动在请求头中添加 Authorization Token
 */
request.interceptors.request.use(
  (config) => {
    // 从本地存储获取管理员 Token
    const token = localStorage.getItem('admin_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

/**
 * 响应拦截器
 * 统一处理响应数据和错误
 */
request.interceptors.response.use(
  (response) => {
    return response.data
  },
  (error) => {
    // 开发环境打印完整错误，方便复制给 Claude
    console.error('=== API 错误（可复制给 Claude）===')
    console.error('URL:', error.config?.url)
    console.error('Method:', error.config?.method)
    console.error('Request:', error.config?.data)
    console.error('Response:', error.response?.data)
    console.error('Status:', error.response?.status)
    console.error('================================')

    // 401 未授权：清除 Token 并跳转到登录页
    if (error.response?.status === 401) {
      localStorage.removeItem('admin_token')
      localStorage.removeItem('admin_info')
      router.push('/login')
      ElMessage.error('登录已过期，请重新登录')
    } else {
      // 显示错误提示
      const message = error.response?.data?.message || '请求失败，请稍后重试'
      ElMessage.error(message)
    }

    return Promise.reject(error)
  }
)

export default request
