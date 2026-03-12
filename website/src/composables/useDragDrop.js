/**
 * 拖拽上传文件组合式函数
 * 为编辑器提供统一的拖拽导入功能
 * @param {Function} onFilesDropped - 文件拖入后的回调，接收 File[] 参数
 */
import { ref } from 'vue'

export function useDragDrop(onFilesDropped) {
  /** 是否正在拖拽文件到区域上 */
  const isDragOver = ref(false)

  /** 拖拽进入：显示遮罩 */
  function onDragOver(e) {
    e.preventDefault()
    isDragOver.value = true
  }

  /** 拖拽离开：隐藏遮罩 */
  function onDragLeave() {
    isDragOver.value = false
  }

  /** 文件放下：读取文件并触发回调 */
  function onDrop(e) {
    e.preventDefault()
    isDragOver.value = false

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return

    if (onFilesDropped) {
      onFilesDropped(files)
    }
  }

  return {
    isDragOver,
    onDragOver,
    onDragLeave,
    onDrop
  }
}
