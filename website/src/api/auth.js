/**
 * 认证相关 API
 * 扫码登录、退出登录
 */
import request from './request'

/**
 * 生成二维码会话
 * @returns {Promise} 返回 { id, code, status }
 */
export function createQr() {
  return request.post('/public/api/auth/qr/create')
}

/**
 * 轮询二维码状态
 * @param {string} id 会话ID
 * @returns {Promise} 返回 { status, token }
 */
export function getQrStatus(id) {
  return request.get('/public/api/auth/qr/status', { params: { id } })
}

/**
 * 退出登录
 */
export function logout() {
  return request.post('/private/api/auth/logout')
}

/**
 * 【开发测试用】模拟APP确认扫码登录
 * 正式环境中由主内圣经APP调用
 * @param {string} id 会话ID
 * @param {string} code 验证码
 */
export function devConfirmQr(id, code) {
  return request.post('/public/api/auth/qr/confirm', {
    id,
    code,
    uid: 10001
  })
}
