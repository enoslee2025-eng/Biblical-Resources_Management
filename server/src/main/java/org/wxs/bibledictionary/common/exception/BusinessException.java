package org.wxs.bibledictionary.common.exception;

/**
 * 业务异常
 * 用于主动抛出的业务逻辑错误
 */
public class BusinessException extends RuntimeException {

    /** 错误码 */
    private final int code;

    public BusinessException(int code, String message) {
        super(message);
        this.code = code;
    }

    public int getCode() {
        return code;
    }
}
