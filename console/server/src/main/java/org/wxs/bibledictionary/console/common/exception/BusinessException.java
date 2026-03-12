package org.wxs.bibledictionary.console.common.exception;

/**
 * 业务异常
 * 用于主动抛出的业务逻辑错误，如参数校验失败、资源不存在等
 */
public class BusinessException extends RuntimeException {

    /** 错误码 */
    private final int code;

    /**
     * 构造业务异常
     * @param code 错误码
     * @param message 错误描述信息
     */
    public BusinessException(int code, String message) {
        super(message);
        this.code = code;
    }

    /**
     * 获取错误码
     * @return 错误码
     */
    public int getCode() {
        return code;
    }
}
