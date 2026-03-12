/**
 * 仪表盘 API
 * 获取后台管理统计数据
 */
import request from './request'

/**
 * 获取仪表盘统计数据
 * @returns {Promise} 统计数据，包含用户数、资源数等
 */
export function getStats() {
  return request.get('/private/api/admin/dashboard/stats')
}
