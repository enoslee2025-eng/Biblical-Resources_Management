/**
 * Axios 请求实例
 * 统一处理请求拦截、响应拦截、错误处理
 */
import axios from 'axios'
import { useUserStore } from '@/stores/user'
import router from '@/router'

/** 创建 Axios 实例 */
const request = axios.create({
  timeout: 30000
})

/**
 * 请求拦截器
 * 自动附加 Token 到 Header
 */
request.interceptors.request.use(
  (config) => {
    const userStore = useUserStore()
    if (userStore.token) {
      config.headers.Authorization = `Bearer ${userStore.token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

/**
 * 响应拦截器
 * 统一处理错误和 Token 过期
 */
request.interceptors.response.use(
  (response) => {
    const data = response.data
    // 业务错误码处理
    if (data.code && data.code !== 200) {
      // 开发环境打印完整错误，方便复制给 Claude
      console.error('=== API 错误（可复制给 Claude）===')
      console.error('URL:', response.config?.url)
      console.error('Method:', response.config?.method)
      console.error('Response:', data)
      console.error('================================')
      return Promise.reject(new Error(data.message || '请求失败'))
    }
    return data
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

    // Token 过期，跳转登录页
    if (error.response?.status === 401) {
      const userStore = useUserStore()
      userStore.clearToken()
      router.push('/login')
    }

    return Promise.reject(error)
  }
)

export default request
