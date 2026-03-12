package org.wxs.bibledictionary.auth.dto;

/**
 * APP 确认扫码登录请求
 * 由主内圣经 APP 扫码后调用
 */
public class QrConfirmRequest {

    /** 二维码会话ID */
    public String id;

    /** 验证码 */
    public String code;

    /** APP 用户的 UID */
    public Long uid;
}
