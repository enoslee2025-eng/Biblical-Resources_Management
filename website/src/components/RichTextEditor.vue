<template>
  <div class="rich-editor-wrap">
    <!-- 精简工具栏：图片 + 撤销/重做 -->
    <div v-if="editor" class="rich-toolbar">
      <div class="toolbar-row">
        <!-- 插入图片 -->
        <div class="toolbar-group">
          <button class="tb-btn" @click="insertImage" :title="t('rte_insert_image')" :aria-label="t('rte_insert_image')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
            </svg>
          </button>
        </div>

        <div class="toolbar-sep" />

        <!-- 撤销 / 重做 -->
        <div class="toolbar-group">
          <button
            class="tb-btn"
            @click="editor.chain().focus().undo().run()"
            :disabled="!editor.can().undo()"
            :title="t('rte_undo') + ' (Ctrl+Z)'"
            :aria-label="t('rte_undo')"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/>
            </svg>
          </button>
          <button
            class="tb-btn"
            @click="editor.chain().focus().redo().run()"
            :disabled="!editor.can().redo()"
            :title="t('rte_redo') + ' (Ctrl+Y)'"
            :aria-label="t('rte_redo')"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- 编辑区域 -->
    <editor-content :editor="editor" class="rich-content" />

    <!-- 隐藏的文件选择器 -->
    <input
      ref="fileInputRef"
      type="file"
      accept="image/*"
      style="display: none;"
      @change="handleImageSelected"
    />
  </div>
</template>

<script setup>
/**
 * 富文本编辑器组件
 * 基于 TipTap，Office/WPS 风格工具栏
 * 支持字体、字号、加粗、斜体、下划线、删除线、颜色、高亮、对齐、列表、图片等
 */
import { ref, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import FontFamily from '@tiptap/extension-font-family'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { Mark } from '@tiptap/core'

/**
 * 自定义人名标注扩展
 * 渲染为 <span class="person-name">，让 TipTap 识别并保留此标签
 */
const PersonName = Mark.create({
  name: 'personName',
  parseHTML() {
    return [{ tag: 'span.person-name' }]
  },
  renderHTML() {
    return ['span', { class: 'person-name' }, 0]
  }
})

/**
 * 自定义地名标注扩展
 * 渲染为 <span class="place-name">，让 TipTap 识别并保留此标签
 */
const PlaceName = Mark.create({
  name: 'placeName',
  parseHTML() {
    return [{ tag: 'span.place-name' }]
  },
  renderHTML() {
    return ['span', { class: 'place-name' }, 0]
  }
})

/**
 * 自定义字号扩展（基于 TextStyle）
 * TipTap 默认不包含字号控制，通过扩展 mark 添加 fontSize 属性
 */
const FontSize = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: el => el.style.fontSize || null,
        renderHTML: attrs => {
          if (!attrs.fontSize) return {}
          return { style: `font-size: ${attrs.fontSize}` }
        }
      }
    }
  },
  addCommands() {
    return {
      ...this.parent?.(),
      setFontSize: (size) => ({ chain }) => {
        return chain().setMark('textStyle', { fontSize: size }).run()
      },
      unsetFontSize: () => ({ chain }) => {
        return chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run()
      }
    }
  }
})

const props = defineProps({
  /** 编辑器内容（HTML 字符串） */
  modelValue: {
    type: String,
    default: ''
  },
  /** 占位提示文字 */
  placeholder: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:modelValue'])

const fileInputRef = ref(null)



/** 创建编辑器实例 */
const editor = useEditor({
  content: props.modelValue,
  extensions: [
    StarterKit,
    Underline,
    PersonName,
    PlaceName,
    FontSize,
    FontFamily,
    Color,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({
      types: ['heading', 'paragraph']
    }),
    Image.configure({
      inline: true,
      allowBase64: true
    }),
    Placeholder.configure({
      placeholder: props.placeholder
    })
  ],
  onUpdate: ({ editor: ed }) => {
    emit('update:modelValue', ed.getHTML())
  }
})

/** 外部 modelValue 变化时同步到编辑器 */
watch(() => props.modelValue, (newVal) => {
  if (!editor.value) return
  const currentHtml = editor.value.getHTML()
  if (currentHtml !== newVal) {
    editor.value.commands.setContent(newVal || '', false)
  }
})



/** 插入图片 */
function insertImage() {
  fileInputRef.value?.click()
}

/** 处理选择的图片 */
function handleImageSelected(event) {
  const file = event.target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    editor.value.chain().focus().setImage({ src: e.target.result }).run()
  }
  reader.readAsDataURL(file)
  event.target.value = ''
}

onBeforeUnmount(() => {
  editor.value?.destroy()
})
</script>

<style scoped>
.rich-editor-wrap {
  border: 1px solid #d0d3d9;
  border-radius: 4px;
  overflow: hidden;
  background: #fff;
}

/* ====== Office 风格工具栏 ====== */
.rich-toolbar {
  background: linear-gradient(to bottom, #f9fafb, #f0f1f3);
  border-bottom: 1px solid #d0d3d9;
  padding: 4px 8px;
  user-select: none;
}

.toolbar-row {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-wrap: wrap;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 1px;
}

.toolbar-sep {
  width: 1px;
  height: 22px;
  background: #c8ccd3;
  margin: 0 5px;
  flex-shrink: 0;
}

/* 工具栏按钮 */
.tb-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: 3px;
  background: transparent;
  color: #444;
  cursor: pointer;
  transition: all 0.12s;
  padding: 0;
  position: relative;
}

.tb-btn:hover {
  background: #dae3f0;
  border-color: #b4c6de;
}

.tb-btn.active {
  background: #cddaed;
  border-color: #a0b4ce;
  color: #1a4a7a;
}

.tb-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.tb-btn:disabled:hover {
  background: transparent;
  border-color: transparent;
}

/* ====== 编辑区域 ====== */
.rich-content {
  min-height: 200px;
  max-height: 60vh;
  overflow-y: auto;
  padding: 20px 24px;
}

/* TipTap 编辑器内部样式 */
.rich-content :deep(.tiptap) {
  outline: none;
  min-height: 180px;
  font-size: 15px;
  line-height: 1.8;
  color: #333;
}

.rich-content :deep(.tiptap p) {
  margin: 0 0 0.6em 0;
  padding-bottom: 0.3em;
  border-bottom: 1px solid #f5f5f5;
  /* Hanging Indent：续行与正文首行对齐，不跑到节号下方 */
  padding-left: 2.5em;
  text-indent: -2.5em;
}

/* 经文节号样式（strong 标签） */
.rich-content :deep(.tiptap p strong) {
  color: #409eff;
  font-weight: 700;
  font-size: 0.9em;
  user-select: none;
}

.rich-content :deep(.tiptap p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  color: #bbb;
  pointer-events: none;
  height: 0;
}

.rich-content :deep(.tiptap img) {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  margin: 8px 0;
  cursor: pointer;
}

.rich-content :deep(.tiptap img.ProseMirror-selectednode) {
  outline: 2px solid #4a86c8;
  outline-offset: 2px;
}

.rich-content :deep(.tiptap ul),
.rich-content :deep(.tiptap ol) {
  padding-left: 1.5em;
  margin: 0.5em 0;
}

.rich-content :deep(.tiptap li) {
  margin: 0.25em 0;
}

.rich-content :deep(.tiptap mark) {
  border-radius: 2px;
  padding: 0 2px;
}

/* 人名标注样式 */
.rich-content :deep(.tiptap .person-name) {
  text-decoration: underline;
  text-decoration-color: #333;
  text-underline-offset: 3px;
  color: inherit;
  cursor: default;
}

/* 地名标注样式 */
.rich-content :deep(.tiptap .place-name) {
  text-decoration: underline wavy;
  text-decoration-color: var(--church-navy, #3d5a80);
  text-underline-offset: 3px;
  color: inherit;
  cursor: default;
}
</style>
