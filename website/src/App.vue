<script setup>
/**
 * 根组件
 * 提供路由视图容器
 * 初始化应用设置（深色模式等）
 */
import { useSettingsStore } from '@/stores/settings'

/** 初始化设置，应用深色模式 */
const settingsStore = useSettingsStore()
settingsStore.applyDarkMode()
</script>

<template>
  <router-view v-slot="{ Component }">
    <transition name="page-fade" mode="out-in">
      <component :is="Component" />
    </transition>
  </router-view>
</template>

<style>
/* 全局样式重置 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: var(--app-text-primary);
  background: var(--app-bg);
}

/* 页面切换过渡动画（淡入 + 微上移） */
.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.page-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.page-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
