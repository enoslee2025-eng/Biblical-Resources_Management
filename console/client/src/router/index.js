/**
 * 路由配置
 * 定义后台管理系统的所有页面路由
 * 包含登录页、仪表盘、用户管理、资源管理等
 */
import { createRouter, createWebHistory } from 'vue-router'

/** 路由规则定义 */
const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { title: '登录', requiresAuth: false }
  },
  {
    path: '/',
    component: () => import('@/layouts/AdminLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'Dashboard',
        component: () => import('@/views/Dashboard.vue'),
        meta: { title: '仪表盘' }
      },
      {
        path: '/users',
        name: 'UserManage',
        component: () => import('@/views/UserManage.vue'),
        meta: { title: '用户管理' }
      },
      {
        path: '/resources',
        name: 'ResourceManage',
        component: () => import('@/views/ResourceManage.vue'),
        meta: { title: '资源管理' }
      }
    ]
  }
]

/** 创建路由实例 */
const router = createRouter({
  history: createWebHistory(),
  routes
})

/**
 * 全局前置守卫
 * 检查用户是否已登录，未登录则跳转到登录页
 */
router.beforeEach((to, from, next) => {
  // 获取本地存储的管理员 Token
  const token = localStorage.getItem('admin_token')

  if (to.path === '/login') {
    // 已登录用户访问登录页时，重定向到首页
    if (token) {
      next({ path: '/' })
    } else {
      next()
    }
  } else {
    // 未登录用户访问需要认证的页面时，重定向到登录页
    if (!token) {
      next({ path: '/login' })
    } else {
      next()
    }
  }
})

export default router
