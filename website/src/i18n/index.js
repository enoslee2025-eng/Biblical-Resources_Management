/**
 * 国际化配置
 * 支持 8 种语言：中文、英文、泰语、韩语、日语、缅甸语、希腊语、希伯来语
 */
import { createI18n } from 'vue-i18n'
import zh from './zh'
import en from './en'
import th from './th'
import ko from './ko'
import ja from './ja'
import my from './my'
import el from './el'
import he from './he'

/** 从 localStorage 读取用户之前选择的语言，默认中文 */
const savedLocale = localStorage.getItem('locale') || 'zh'

export const i18n = createI18n({
  legacy: false,
  locale: savedLocale,
  fallbackLocale: 'zh',
  messages: { zh, en, th, ko, ja, my, el, he }
})

/**
 * 支持的语言列表（带国旗图标）
 */
export const supportedLocales = [
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'th', name: 'ไทย', flag: '🇹🇭' },
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'my', name: 'မြန်မာ', flag: '🇲🇲' },
  { code: 'el', name: 'Ελληνικά', flag: '🇬🇷' },
  { code: 'he', name: 'עברית', flag: '🇮🇱' }
]
