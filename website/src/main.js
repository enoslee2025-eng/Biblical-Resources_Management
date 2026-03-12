/**
 * 应用入口
 * 初始化 Vue 应用，注册路由、状态管理、国际化、Element Plus
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import App from './App.vue'
import router from './router'
import { i18n } from './i18n'
import './styles/global.css'

/**
 * Element Plus 语言包映射
 * 根据当前 i18n 语言动态加载对应的 Element Plus 语言包
 */
const elLocaleMap = {
  zh: () => import('element-plus/dist/locale/zh-cn.mjs'),
  en: () => import('element-plus/dist/locale/en.mjs'),
  th: () => import('element-plus/dist/locale/th.mjs'),
  ko: () => import('element-plus/dist/locale/ko.mjs'),
  ja: () => import('element-plus/dist/locale/ja.mjs'),
  el: () => import('element-plus/dist/locale/el.mjs'),
  he: () => import('element-plus/dist/locale/he.mjs'),
  my: () => import('element-plus/dist/locale/en.mjs') // 缅甸语无对应包，使用英文
}

/** 初始化应用 */
async function initApp() {
  const app = createApp(App)

  app.use(createPinia())
  app.use(router)
  app.use(i18n)

  /** 动态加载当前语言对应的 Element Plus 语言包 */
  const currentLocale = i18n.global.locale.value || 'zh'
  const loader = elLocaleMap[currentLocale] || elLocaleMap.zh
  try {
    const localeModule = await loader()
    app.use(ElementPlus, { locale: localeModule.default })
  } catch {
    // 加载失败时使用默认中文
    const zhLocale = await import('element-plus/dist/locale/zh-cn.mjs')
    app.use(ElementPlus, { locale: zhLocale.default })
  }

  /** 注册所有 Element Plus 图标 */
  for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component)
  }

  app.mount('#app')
}

initApp()
