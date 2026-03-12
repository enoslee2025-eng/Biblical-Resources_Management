/**
 * 路由配置
 * 定义页面路由和导航守卫
 */
import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '@/stores/user'
import MainLayout from '@/layouts/MainLayout.vue'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/LoginNew.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/',
    component: MainLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'DataCenter',
        component: () => import('@/views/DataCenter.vue'),
        meta: { breadcrumb: [] }
      },
      /** 圣经译本 */
      {
        path: 'bible',
        name: 'BibleList',
        component: () => import('@/views/ResourceList.vue'),
        meta: {
          resourceType: 'bible',
          breadcrumb: [{ title: '圣经译本' }]
        }
      },
      {
        path: 'bible/detail/:id',
        name: 'BibleDetail',
        component: () => import('@/views/BibleDetail.vue'),
        meta: {
          breadcrumb: (route) => [
            { title: '圣经译本', path: '/bible' },
            { title: '译本详情' }
          ]
        }
      },
      {
        path: 'bible/read/:id',
        name: 'BibleRead',
        component: () => import('@/views/BibleRead.vue'),
        meta: {
          breadcrumb: (route) => [
            { title: '圣经译本', path: '/bible' },
            { title: '译本详情', path: `/bible/detail/${route.params.id}` },
            { title: '阅读' }
          ]
        }
      },
      {
        path: 'bible/edit/:id?',
        name: 'BibleEditor',
        component: () => import('@/views/BibleEditor.vue'),
        meta: {
          breadcrumb: (route) => {
            if (route.params.id) {
              return [
                { title: '圣经译本', path: '/bible' },
                { title: '译本详情', path: `/bible/detail/${route.params.id}` },
                { title: '编辑译本' }
              ]
            }
            return [
              { title: '圣经译本', path: '/bible' },
              { title: '新增译本' }
            ]
          }
        }
      },
      /** 词典 */
      {
        path: 'dictionary',
        name: 'DictionaryList',
        component: () => import('@/views/ResourceList.vue'),
        meta: {
          resourceType: 'dictionary',
          breadcrumb: [{ title: '词典' }]
        }
      },
      {
        path: 'dictionary/detail/:id',
        name: 'DictionaryDetail',
        component: () => import('@/views/DictionaryDetail.vue'),
        meta: {
          breadcrumb: (route) => [
            { title: '词典', path: '/dictionary' },
            { title: '词典详情' }
          ]
        }
      },
      {
        path: 'dictionary/edit/:id?',
        name: 'DictionaryEditor',
        component: () => import('@/views/DictionaryEditor.vue'),
        meta: {
          breadcrumb: (route) => [
            { title: '词典', path: '/dictionary' },
            { title: route.params.id ? '编辑词典' : '新增词汇' }
          ]
        }
      },
      /** 圣经注释 */
      {
        path: 'commentary',
        name: 'CommentaryList',
        component: () => import('@/views/ResourceList.vue'),
        meta: {
          resourceType: 'commentary',
          breadcrumb: [{ title: '圣经注释' }]
        }
      },
      {
        path: 'commentary/detail/:id',
        name: 'CommentaryDetail',
        component: () => import('@/views/CommentaryDetail.vue'),
        meta: {
          breadcrumb: (route) => [
            { title: '圣经注释', path: '/commentary' },
            { title: '注释详情' }
          ]
        }
      },
      {
        path: 'commentary/read/:id',
        name: 'CommentaryRead',
        component: () => import('@/views/CommentaryRead.vue'),
        meta: {
          breadcrumb: (route) => [
            { title: '圣经注释', path: '/commentary' },
            { title: '注释详情', path: `/commentary/detail/${route.params.id}` },
            { title: '逐节编辑' }
          ]
        }
      },
      {
        path: 'commentary/edit/:id?',
        name: 'CommentaryEditor',
        component: () => import('@/views/CommentaryEditor.vue'),
        meta: {
          breadcrumb: (route) => [
            { title: '圣经注释', path: '/commentary' },
            { title: route.params.id ? '编辑注释' : '新增注释' }
          ]
        }
      },
      /** 素材库 */
      {
        path: 'material',
        name: 'MaterialList',
        component: () => import('@/views/ResourceList.vue'),
        meta: {
          resourceType: 'material',
          breadcrumb: [{ title: '素材库' }]
        }
      },
      {
        path: 'material/edit/:id?',
        name: 'MaterialEditor',
        component: () => import('@/views/MaterialEditor.vue'),
        meta: {
          breadcrumb: (route) => [
            { title: '素材库', path: '/material' },
            { title: route.params.id ? '编辑素材' : '新建素材' }
          ]
        }
      },
      /** AI导入系统 - 词典 */
      {
        path: 'dictionary/import',
        name: 'DictionaryImport',
        component: () => import('@/views/DictionaryImport.vue'),
        meta: {
          breadcrumb: [
            { title: '词典', path: '/dictionary' },
            { title: 'AI导入' }
          ]
        }
      },
      /** AI导入系统 - 注释 */
      {
        path: 'commentary/import',
        name: 'CommentaryImport',
        component: () => import('@/views/CommentaryImport.vue'),
        meta: {
          breadcrumb: [
            { title: '圣经注释', path: '/commentary' },
            { title: 'AI导入' }
          ]
        }
      },
      /** AI导入系统 - 素材 */
      {
        path: 'material/import',
        name: 'MaterialImport',
        component: () => import('@/views/MaterialImport.vue'),
        meta: {
          breadcrumb: [
            { title: '素材库', path: '/material' },
            { title: 'AI导入' }
          ]
        }
      },
      /** AI导入系统 - 圣经 */
      {
        path: 'bible/import',
        name: 'BibleImport',
        component: () => import('@/views/BibleImport.vue'),
        meta: {
          breadcrumb: [
            { title: '圣经译本', path: '/bible' },
            { title: 'AI导入' }
          ]
        }
      },
      {
        path: 'bible/import/preview',
        name: 'BibleImportPreview',
        component: () => import('@/views/BibleImportPreview.vue'),
        meta: {
          breadcrumb: [
            { title: '圣经译本', path: '/bible' },
            { title: 'AI导入', path: '/bible/import' },
            { title: 'AI排版预览' }
          ]
        }
      },
      {
        path: 'bible/import/save',
        name: 'BibleImportSave',
        component: () => import('@/views/BibleImportSave.vue'),
        meta: {
          breadcrumb: [
            { title: '圣经译本', path: '/bible' },
            { title: 'AI导入', path: '/bible/import' },
            { title: '保存数据' }
          ]
        }
      },
      /** 资源发布/导出（4个板块通用） */
      {
        path: 'export/:id',
        name: 'ResourceExport',
        component: () => import('@/views/BibleExport.vue'),
        meta: {
          breadcrumb: (route) => [
            { title: '发布/导出' }
          ]
        }
      },
      /** 用户管理 */
      {
        path: 'users',
        name: 'UserManagement',
        component: () => import('@/views/UserManagement.vue'),
        meta: {
          breadcrumb: [{ title: '用户管理' }]
        }
      },
      /** 个人信息 */
      {
        path: 'profile',
        name: 'Profile',
        component: () => import('@/views/Profile.vue'),
        meta: {
          breadcrumb: [{ title: '个人信息' }]
        }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  /** 每次路由切换时滚动到页面顶部 */
  scrollBehavior() {
    return { top: 0 }
  }
})

/**
 * 全局导航守卫
 * 未登录时跳转到登录页
 */
router.beforeEach((to, from, next) => {
  const userStore = useUserStore()

  if (to.meta.requiresAuth !== false && !userStore.isLoggedIn) {
    next('/login')
  } else if (to.path === '/login' && userStore.isLoggedIn) {
    next('/')
  } else {
    next()
  }
})

export default router
