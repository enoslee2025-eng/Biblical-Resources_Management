/**
 * 管理员状态管理
 * 使用 Pinia 管理管理员登录状态、Token、用户信息
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { adminLogin as apiLogin, adminLogout as apiLogout } from '@/api/auth'
import router from '@/router'

/**
 * 管理员 Store
 * 管理 Token 和管理员信息的持久化存储
 */
export const useAdminStore = defineStore('admin', () => {
  /** 管理员 Token（从 localStorage 初始化） */
  const token = ref(localStorage.getItem('admin_token') || '')

  /** 管理员信息（从 localStorage 初始化） */
  const adminInfo = ref(JSON.parse(localStorage.getItem('admin_info') || '{}'))

  /**
   * 设置 Token
   * @param {string} newToken - 新的 Token
   */
  function setToken(newToken) {
    token.value = newToken
    if (newToken) {
      localStorage.setItem('admin_token', newToken)
    } else {
      localStorage.removeItem('admin_token')
    }
  }

  /**
   * 管理员登录
   * @param {string} username - 用户名
   * @param {string} password - 密码
   * @returns {Promise} 登录结果
   */
  async function login(username, password) {
    const res = await apiLogin(username, password)
    if (res.code === 200) {
      // 保存 Token 和管理员信息
      setToken(res.data.token)
      adminInfo.value = res.data.admin || { username }
      localStorage.setItem('admin_info', JSON.stringify(adminInfo.value))
    }
    return res
  }

  /**
   * 管理员登出
   * 清除本地存储并跳转到登录页
   */
  async function logout() {
    try {
      await apiLogout()
    } catch (e) {
      // 登出失败也继续清除本地状态
      console.warn('登出请求失败，已清除本地状态')
    }
    // 清除 Token 和管理员信息
    setToken('')
    adminInfo.value = {}
    localStorage.removeItem('admin_info')
    // 跳转到登录页
    router.push('/login')
  }

  return {
    token,
    adminInfo,
    setToken,
    login,
    logout
  }
})
