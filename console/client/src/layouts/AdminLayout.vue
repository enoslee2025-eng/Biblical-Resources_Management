<!--
  后台管理布局组件
  包含左侧导航栏、顶部标题栏、主内容区域
  支持侧边栏折叠/展开
-->
<template>
  <el-container class="admin-layout">
    <!-- 左侧导航栏 -->
    <el-aside :width="isCollapsed ? '64px' : '220px'" class="admin-aside">
      <!-- 系统标题 -->
      <div class="aside-header">
        <el-icon :size="24" color="#409eff"><DataBoard /></el-icon>
        <span v-show="!isCollapsed" class="aside-title">后台管理</span>
      </div>

      <!-- 导航菜单 -->
      <el-menu
        :default-active="currentRoute"
        :collapse="isCollapsed"
        router
        background-color="#001529"
        text-color="#ffffffb3"
        active-text-color="#409eff"
        class="admin-menu"
      >
        <!-- 仪表盘 -->
        <el-menu-item index="/">
          <el-icon><Odometer /></el-icon>
          <template #title>仪表盘</template>
        </el-menu-item>

        <!-- 用户管理 -->
        <el-menu-item index="/users">
          <el-icon><User /></el-icon>
          <template #title>用户管理</template>
        </el-menu-item>

        <!-- 资源管理 -->
        <el-menu-item index="/resources">
          <el-icon><Document /></el-icon>
          <template #title>资源管理</template>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <!-- 右侧内容区域 -->
    <el-container>
      <!-- 顶部标题栏 -->
      <el-header class="admin-header">
        <div class="header-left">
          <!-- 折叠/展开按钮 -->
          <el-icon
            class="collapse-btn"
            :size="20"
            @click="toggleCollapse"
          >
            <Fold v-if="!isCollapsed" />
            <Expand v-else />
          </el-icon>
          <!-- 当前页面标题 -->
          <span class="page-title">{{ currentTitle }}</span>
        </div>

        <div class="header-right">
          <!-- 管理员信息和登出 -->
          <span class="admin-name">
            <el-icon><UserFilled /></el-icon>
            {{ adminInfo.username || '管理员' }}
          </span>
          <el-button type="danger" text @click="handleLogout">
            <el-icon><SwitchButton /></el-icon>
            退出登录
          </el-button>
        </div>
      </el-header>

      <!-- 主内容区域 -->
      <el-main class="admin-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
/**
 * 后台管理布局组件
 * 包含侧边栏导航、顶部栏、主内容区
 */
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAdminStore } from '@/stores/admin'
import { ElMessageBox } from 'element-plus'

/** 路由实例，用于获取当前路由信息 */
const route = useRoute()

/** 管理员 Store */
const adminStore = useAdminStore()

/** 管理员信息 */
const adminInfo = computed(() => adminStore.adminInfo)

/** 侧边栏是否折叠 */
const isCollapsed = ref(false)

/** 当前激活的路由路径 */
const currentRoute = computed(() => route.path)

/** 页面标题映射 */
const titleMap = {
  '/': '仪表盘',
  '/users': '用户管理',
  '/resources': '资源管理'
}

/** 当前页面标题 */
const currentTitle = computed(() => titleMap[route.path] || '后台管理')

/**
 * 切换侧边栏折叠状态
 */
function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}

/**
 * 退出登录
 * 弹出确认对话框后执行登出操作
 */
async function handleLogout() {
  try {
    await ElMessageBox.confirm('确定要退出登录吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await adminStore.logout()
  } catch {
    // 用户取消操作，不做处理
  }
}
</script>

<style scoped>
/* 整体布局：撑满整个视口 */
.admin-layout {
  height: 100vh;
  overflow: hidden;
}

/* 左侧导航栏样式 */
.admin-aside {
  background-color: #001529;
  transition: width 0.3s;
  overflow: hidden;
}

/* 导航栏头部：系统标题 */
.aside-header {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-bottom: 1px solid #ffffff1a;
}

.aside-title {
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
}

/* 导航菜单：去除边框 */
.admin-menu {
  border-right: none;
}

/* 顶部标题栏样式 */
.admin-header {
  background-color: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  padding: 0 20px;
  z-index: 1;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 折叠按钮 */
.collapse-btn {
  cursor: pointer;
  color: #606266;
  transition: color 0.2s;
}

.collapse-btn:hover {
  color: #409eff;
}

/* 页面标题 */
.page-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

/* 管理员名称 */
.admin-name {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #606266;
  font-size: 14px;
}

/* 主内容区域 */
.admin-main {
  background-color: #f5f7fa;
  overflow-y: auto;
}
</style>
