<script setup>
/**
 * 资源类型图标组件
 * 显示圣经（书本）、注释（对话气泡）、词典（翻译）对应的 SVG 图标
 * 颜色通过 CSS currentColor 继承，方便外部控制
 */
defineProps({
  /** 资源类型：bible / commentary / dictionary */
  type: { type: String, required: true },
  /** 图标尺寸（px） */
  size: { type: Number, default: 24 }
})
</script>

<template>
  <!-- 圣经：书本带书签 -->
  <svg v-if="type === 'bible'" :width="size" :height="size" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 2C4.9 2 4 2.9 4 4v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2H6zm1 2h5v8l-2.5-1.5L7 12V4z" fill="currentColor"/>
  </svg>
  <!-- 注释：对话气泡带文字行 -->
  <svg v-else-if="type === 'commentary'" :width="size" :height="size" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12zM7 9h10v2H7zm0-3h10v2H7z" fill="currentColor"/>
  </svg>
  <!-- 素材库：网格/相册图标 -->
  <svg v-else-if="type === 'material'" :width="size" :height="size" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z" fill="currentColor"/>
  </svg>
  <!-- 词典：翻译/Aa 图标 -->
  <svg v-else :width="size" :height="size" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z" fill="currentColor"/>
  </svg>
</template>
