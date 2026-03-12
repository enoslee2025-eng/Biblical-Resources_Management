/**
 * 资源管理 API
 * 获取资源列表、删除资源等接口
 */
import request from './request'

/**
 * 获取资源列表
 * @param {string} [type] - 资源类型筛选（可选），如：bible、commentary、dictionary
 * @returns {Promise} 资源列表数据
 */
export function getResourceList(type) {
  const params = {}
  if (type) {
    params.type = type
  }
  return request.get('/private/api/admin/resource/list', { params })
}

/**
 * 删除资源
 * @param {number} id - 资源 ID
 * @returns {Promise} 删除结果
 */
export function deleteResource(id) {
  return request.delete(`/private/api/admin/resource/delete/${id}`)
}
