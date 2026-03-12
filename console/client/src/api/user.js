/**
 * 用户管理 API
 * 获取用户列表等接口
 */
import request from './request'

/**
 * 获取用户列表
 * @returns {Promise} 用户列表数据
 */
export function getUserList() {
  return request.get('/private/api/admin/user/list')
}
