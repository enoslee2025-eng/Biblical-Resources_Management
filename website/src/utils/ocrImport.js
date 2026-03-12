/**
 * OCR 文字识别工具
 * 基于 tesseract.js 实现图片文字提取
 * 支持中文（简/繁）和英文识别
 */
import { createWorker } from 'tesseract.js'

/**
 * 从图片文件中识别文字
 * @param {File|Blob|string} image - 图片文件、Blob 或 URL
 * @param {Function} onProgress - 进度回调 (progress: 0~1)
 * @param {string} lang - 识别语言，默认 chi_sim（简体中文）
 * @returns {Promise<string>} 识别出的文字
 */
export async function recognizeText(image, onProgress, lang = 'chi_sim') {
  const worker = await createWorker(lang, 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(m.progress || 0)
      }
    }
  })

  const { data } = await worker.recognize(image)
  await worker.terminate()

  return data.text || ''
}

/**
 * 从多张图片中批量识别文字
 * @param {Array<File>} images - 图片文件数组
 * @param {Function} onProgress - 进度回调 (current, total, progress)
 * @param {string} lang - 识别语言
 * @returns {Promise<string>} 所有图片识别结果拼接
 */
export async function recognizeMultiple(images, onProgress, lang = 'chi_sim') {
  const results = []

  for (let i = 0; i < images.length; i++) {
    const text = await recognizeText(images[i], (p) => {
      if (onProgress) onProgress(i + 1, images.length, p)
    }, lang)
    results.push(text)
  }

  return results.join('\n')
}

/**
 * 支持的图片格式
 */
export const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/bmp', 'image/webp', 'image/tiff']

/**
 * 判断文件是否为支持的图片格式
 * @param {File} file
 * @returns {boolean}
 */
export function isSupportedImage(file) {
  return SUPPORTED_IMAGE_TYPES.includes(file.type)
}
