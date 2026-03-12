package org.wxs.bibledictionary.auth.dto;

/**
 * 轮询二维码状态响应
 * status=2 时返回 token，其他状态 token 为 null
 */
public class QrStatusResponse {

    /** 状态：0-未扫码，1-已扫码未确认，2-已登录，3-已失效 */
    public int status;

    /** 登录Token（仅 status=2 时有值） */
    public String token;

    public QrStatusResponse() {}

    public QrStatusResponse(int status, String token) {
        this.status = status;
        this.token = token;
    }
}
