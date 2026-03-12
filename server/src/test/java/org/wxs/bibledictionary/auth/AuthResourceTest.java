package org.wxs.bibledictionary.auth;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.TestMethodOrder;
import org.junit.jupiter.api.MethodOrderer;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

/**
 * 认证接口单元测试
 * 测试二维码登录的完整流程
 */
@QuarkusTest
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
public class AuthResourceTest {

    /** 保存二维码会话ID，用于后续测试 */
    private static String sessionId;
    private static String sessionCode;
    private static String loginToken;

    /**
     * 测试生成二维码
     */
    @Test
    @Order(1)
    public void testCreateQr() {
        var response = given()
                .contentType(ContentType.JSON)
                .when()
                .post("/public/api/auth/qr/create")
                .then()
                .statusCode(200)
                .body("code", equalTo(200))
                .body("data.id", notNullValue())
                .body("data.code", notNullValue())
                .body("data.status", equalTo(0))
                .extract().response();

        sessionId = response.jsonPath().getString("data.id");
        sessionCode = response.jsonPath().getString("data.code");
    }

    /**
     * 测试轮询二维码状态（未扫码）
     */
    @Test
    @Order(2)
    public void testQrStatusPending() {
        given()
                .when()
                .get("/public/api/auth/qr/status?id=" + sessionId)
                .then()
                .statusCode(200)
                .body("code", equalTo(200))
                .body("data.status", equalTo(0))
                .body("data.token", nullValue());
    }

    /**
     * 测试APP确认扫码登录
     */
    @Test
    @Order(3)
    public void testConfirmQrLogin() {
        given()
                .contentType(ContentType.JSON)
                .body("{\"id\":\"" + sessionId + "\",\"code\":\"" + sessionCode + "\",\"uid\":10001}")
                .when()
                .post("/public/api/auth/qr/confirm")
                .then()
                .statusCode(200)
                .body("code", equalTo(200));
    }

    /**
     * 测试轮询二维码状态（已登录，应返回Token）
     */
    @Test
    @Order(4)
    public void testQrStatusLoggedIn() {
        var response = given()
                .when()
                .get("/public/api/auth/qr/status?id=" + sessionId)
                .then()
                .statusCode(200)
                .body("code", equalTo(200))
                .body("data.status", equalTo(2))
                .body("data.token", notNullValue())
                .extract().response();

        loginToken = response.jsonPath().getString("data.token");
    }

    /**
     * 测试使用Token访问私有接口
     */
    @Test
    @Order(5)
    public void testAccessPrivateApi() {
        given()
                .header("Authorization", "Bearer " + loginToken)
                .when()
                .get("/private/api/resource/list")
                .then()
                .statusCode(200)
                .body("code", equalTo(200));
    }

    /**
     * 测试无Token访问私有接口（应返回401）
     */
    @Test
    @Order(6)
    public void testAccessPrivateApiWithoutToken() {
        given()
                .when()
                .get("/private/api/resource/list")
                .then()
                .statusCode(401);
    }
}
