/**
 * 资源相关 API
 * 圣经译本等资源的增删改查和导出
 */
import request from './request'

/**
 * 创建资源
 * @param {Object} data { type, title, metaJson }
 */
export function createResource(data) {
  return request.post('/private/api/resource/create', data)
}

/**
 * 获取资源列表
 * @param {string} type 资源类型（可选）
 */
export function getResourceList(type) {
  return request.get('/private/api/resource/list', { params: { type } })
}

/**
 * 获取资源详情
 * @param {number} id 资源ID
 */
export function getResourceDetail(id) {
  return request.get(`/private/api/resource/detail/${id}`)
}

/**
 * 更新资源
 * @param {number} id 资源ID
 * @param {Object} data { title, metaJson, contentJson }
 */
export function updateResource(id, data) {
  return request.put(`/private/api/resource/update/${id}`, data)
}

/**
 * 删除资源
 * @param {number} id 资源ID
 */
export function deleteResource(id) {
  return request.delete(`/private/api/resource/delete/${id}`)
}

/**
 * 复制资源
 * @param {number} id 要复制的资源ID
 */
export function copyResource(id) {
  return request.post(`/private/api/resource/copy/${id}`)
}

/**
 * 获取资源内容摘要统计
 * @param {number} id 资源ID
 */
export function getResourceSummary(id) {
  return request.get(`/private/api/resource/summary/${id}`)
}

/**
 * 切换资源公开/私有状态
 * @param {number} id 资源ID
 * @param {boolean} isPublic 是否公开
 */
export function togglePublic(id, isPublic) {
  return request.put(`/private/api/resource/update/${id}`, { isPublic: isPublic ? 1 : 0 })
}

/**
 * 获取用户资源统计（首页数据中心用）
 * 返回各类型数量和最近编辑列表
 */
export function getResourceStats() {
  return request.get('/private/api/resource/stats')
}

/**
 * 获取资源版本历史列表
 * @param {number} resourceId 资源ID
 */
export function getVersionList(resourceId) {
  return request.get(`/private/api/resource/versions/${resourceId}`)
}

/**
 * 获取版本详情（含完整内容）
 * @param {number} versionId 版本ID
 */
export function getVersionDetail(versionId) {
  return request.get(`/private/api/resource/version-detail/${versionId}`)
}

/**
 * 恢复到指定版本
 * @param {number} resourceId 资源ID
 * @param {number} versionId 版本ID
 */
export function restoreVersion(resourceId, versionId) {
  return request.post(`/private/api/resource/restore/${resourceId}/${versionId}`)
}

/**
 * 删除单个版本
 * @param {number} versionId 版本ID
 */
export function deleteVersion(versionId) {
  return request.delete(`/private/api/resource/version/${versionId}`)
}

/**
 * 清空资源的所有版本历史
 * @param {number} resourceId 资源ID
 */
export function clearVersions(resourceId) {
  return request.delete(`/private/api/resource/versions/${resourceId}`)
}

/**
 * 获取导出资源的下载地址
 * @param {number} id 资源ID
 * @returns {string} 下载URL
 */
export function getExportUrl(id) {
  const token = localStorage.getItem('token')
  return `/private/api/resource/export/${id}?token=${token}`
}

/**
 * 导入资源文件
 * @param {FormData} formData 包含 file（文件）和 type（资源类型）
 */
export function importResource(formData) {
  return request.post('/private/api/resource/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000
  })
}

/**
 * 解析 .doc 文件（服务端用 Apache POI 提取文本）
 * @param {File} file .doc 文件
 * @returns {{ text: string }} 提取的纯文本
 */
export function parseDocFile(file) {
  const formData = new FormData()
  formData.append('file', file)
  /* 不要手动设置 Content-Type，让浏览器自动生成含 boundary 的 multipart 头 */
  return request.post('/private/api/resource/parse-doc', formData, {
    timeout: 60000
  })
}

/**
 * 获取资源下载信息（公开接口，供 APP 扫码后调用）
 * 返回资源元数据 + 文件下载地址
 * @param {number} id 资源ID
 * @param {string} uid 用户ID（APP 端传入）
 */
export function getDownloadInfo(id, uid) {
  return request.get(`/public/api/resource/download-info/${id}`, { params: { uid } })
}
