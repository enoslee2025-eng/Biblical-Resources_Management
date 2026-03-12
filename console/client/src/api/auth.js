/**
 * 管理员认证 API
 * 包含登录、登出等接口
 */
import request from './request'

/**
 * 管理员登录
 * @param {string} username - 用户名
 * @param {string} password - 密码
 * @returns {Promise} 登录结果，包含 Token 和管理员信息
 */
export function adminLogin(username, password) {
  return request.post('/public/api/admin/auth/login', {
    username,
    password
  })
}

/**
 * 管理员登出
 * @returns {Promise} 登出结果
 */
export function adminLogout() {
  return request.post('/private/api/admin/auth/logout')
}
