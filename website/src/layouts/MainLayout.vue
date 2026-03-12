<script setup>
/**
 * 主布局组件
 * 教会风格：白色水平导航栏 + 内容区域 + 深色页脚
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useUserStore } from '@/stores/user'

const { t } = useI18n()

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

/** 导航菜单配置 */
const navItems = computed(() => [
  { key: 'home', label: t('nav_home'), path: '/' },
  { key: 'bible', label: t('nav_bible_list'), path: '/bible' },
  { key: 'commentary', label: t('nav_commentary_list'), path: '/commentary' },
  { key: 'dictionary', label: t('nav_dictionary_list'), path: '/dictionary' },
  { key: 'material', label: t('nav_material_list'), path: '/material' }
])

/** 判断导航项是否激活 */
function isActive(item) {
  if (item.path === '/') return route.path === '/'
  return route.path.startsWith(item.path)
}

/** 退出登录 */
function handleLogout() {
  userStore.clearToken()
  router.push('/login')
}
</script>

<template>
  <div class="main-layout">
    <!-- 顶部导航栏 -->
    <header class="top-navbar">
      <div class="navbar-inner">
        <!-- Logo -->
        <div class="logo" @click="router.push('/')">
          <div class="logo-inner">
            <span class="logo-text">{{ t('nav_bible') }}</span>
            <span class="logo-badge">Bible Pro</span>
          </div>
        </div>

        <!-- 水平导航链接 -->
        <nav class="nav-links" role="navigation" :aria-label="t('nav_home')">
          <router-link
            v-for="item in navItems"
            :key="item.key"
            :to="item.path"
            class="nav-item"
            :class="{ active: isActive(item) }"
          >
            {{ item.label }}
          </router-link>
        </nav>

        <!-- 右侧操作 -->
        <div class="navbar-right">
          <router-link to="/profile" class="nav-action">{{ t('nav_profile') }}</router-link>
          <a class="nav-action nav-logout" @click="handleLogout">{{ t('nav_logout') }}</a>
        </div>
      </div>
    </header>

    <!-- 内容区域 -->
    <main class="main-content">
      <router-view />
    </main>


  </div>
</template>

<style scoped>
.main-layout {
  min-height: 100vh;
  background: var(--app-bg, #f5f0eb);
  display: flex;
  flex-direction: column;
}

/* ==================== 顶部导航栏 ==================== */
.top-navbar {
  background: #fff;
  border-bottom: 1px solid var(--church-border, #e0d8cf);
  position: sticky;
  top: 0;
  z-index: 100;
}

.navbar-inner {
  max-width: 1200px;
  margin: 0 auto;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32px;
}

/* Logo */
.logo {
  cursor: pointer;
  flex-shrink: 0;
}

.logo-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2px 8px 2px;
  line-height: 1;
}

.logo-text {
  font-size: 20px;
  font-weight: 700;
  color: var(--church-charcoal, #3a3a3a);
  letter-spacing: 3px;
  font-family: var(--font-heading);
}

.logo-badge {
  font-size: 8px;
  background: #b33a2b;
  color: #fff;
  padding: 1px 10px 3px;
  border-radius: 0 0 10px 10px;
  font-weight: 600;
  margin-top: 1px;
  letter-spacing: 1.5px;
}

/* 导航链接 */
.nav-links {
  display: flex;
  align-items: center;
  gap: 0;
}

.nav-item {
  padding: 8px 22px;
  font-size: 17px;
  font-weight: 500;
  color: var(--church-charcoal, #3a3a3a);
  text-decoration: none;
  letter-spacing: 1.5px;
  transition: color 0.3s;
  position: relative;
}

.nav-item::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 20px;
  right: 20px;
  height: 2px;
  background: var(--church-navy, #3d5a80);
  transform: scaleX(0);
  transition: transform 0.3s ease;
}

.nav-item:hover {
  color: var(--church-navy, #3d5a80);
}

.nav-item:hover::after,
.nav-item.active::after {
  transform: scaleX(1);
}

.nav-item.active {
  color: var(--church-navy, #3d5a80);
}

/* 右侧操作 */
.navbar-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.nav-action {
  font-size: 14px;
  font-weight: 500;
  color: var(--church-warm-gray, #8a8178);
  text-decoration: none;
  letter-spacing: 1px;
  cursor: pointer;
  transition: color 0.3s;
}

.nav-action:hover {
  color: var(--church-navy, #3d5a80);
}

/* ==================== 内容区域 ==================== */
.main-content {
  flex: 1;
}

/* ==================== 响应式 ==================== */
@media (max-width: 900px) {
  .navbar-inner {
    padding: 0 16px;
  }

  .nav-item {
    padding: 8px 12px;
    font-size: 16px;
    letter-spacing: 1px;
  }

}

@media (max-width: 640px) {
  .nav-links {
    display: none;
  }

  .navbar-inner {
    height: 56px;
  }
}
</style>
