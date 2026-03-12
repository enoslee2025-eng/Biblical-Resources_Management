/**
 * 应用设置状态管理
 * 管理深色模式和语言偏好
 */
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
  /** 是否为深色模式 */
  const isDark = ref(localStorage.getItem('darkMode') === 'true')

  /** 当前语言 */
  const locale = ref(localStorage.getItem('locale') || 'zh')

  /**
   * 切换深色模式
   */
  function toggleDark() {
    isDark.value = !isDark.value
    localStorage.setItem('darkMode', isDark.value)
    applyDarkMode()
  }

  /**
   * 设置语言
   */
  function setLocale(lang) {
    locale.value = lang
    localStorage.setItem('locale', lang)
  }

  /**
   * 应用深色模式到 DOM
   * 使用 Vant 4 内置的深色主题类名
   */
  function applyDarkMode() {
    if (isDark.value) {
      document.documentElement.classList.add('van-theme-dark')
    } else {
      document.documentElement.classList.remove('van-theme-dark')
    }
  }

  // 初始化时应用
  applyDarkMode()

  return {
    isDark,
    locale,
    toggleDark,
    setLocale,
    applyDarkMode
  }
})
