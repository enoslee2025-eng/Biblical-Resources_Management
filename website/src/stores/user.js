/**
 * 用户状态管理
 * 管理登录状态、Token、用户信息
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useUserStore = defineStore('user', () => {
  /** 登录Token */
  const token = ref(localStorage.getItem('token') || '')

  /** 用户信息 */
  const userInfo = ref(JSON.parse(localStorage.getItem('userInfo') || 'null'))

  /** 是否已登录 */
  const isLoggedIn = computed(() => !!token.value)

  /** 是否管理员 */
  const isAdmin = computed(() => userInfo.value?.role === '管理员')

  /**
   * 设置Token（登录成功时调用）
   */
  function setToken(newToken) {
    token.value = newToken
    localStorage.setItem('token', newToken)
  }

  /**
   * 设置用户信息
   */
  function setUserInfo(info) {
    userInfo.value = info
    localStorage.setItem('userInfo', JSON.stringify(info))
  }

  /**
   * 清除Token（退出登录时调用）
   */
  function clearToken() {
    token.value = ''
    userInfo.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('userInfo')
  }

  return {
    token,
    userInfo,
    isLoggedIn,
    isAdmin,
    setToken,
    setUserInfo,
    clearToken
  }
})
