package org.wxs.bibledictionary.auth.dto;

/**
 * 创建二维码响应
 * 返回二维码会话ID和验证码，前端用于生成二维码
 */
public class QrCreateResponse {

    /** 会话ID */
    public String id;

    /** 验证码 */
    public String code;

    /** 状态：0-未扫码 */
    public int status;

    public QrCreateResponse() {}

    public QrCreateResponse(String id, String code, int status) {
        this.id = id;
        this.code = code;
        this.status = status;
    }
}
