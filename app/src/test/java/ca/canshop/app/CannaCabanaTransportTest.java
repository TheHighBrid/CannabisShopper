package ca.canshop.app;

import org.junit.Before;
import org.junit.Test;

import java.io.IOException;
import java.net.URL;
import java.util.concurrent.atomic.AtomicBoolean;

import okhttp3.Call;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

import static org.junit.Assert.*;

public class CannaCabanaTransportTest {
    private MainActivity activity;

    @Before
    public void setUp() {
        activity = new MainActivity();
    }

    private static final String VALID_URL =
            "https://app.cannacabana.com/api/product/filterv2?selectedOptions=28+G&collection=whole-flower&price_min=0&cbd_level_min=0&cbd_level_max=100&thc_level_min=29.97&thc_level_max=34.97&storeId=3658&page=1&limit=100&sortOrder=asc&sortField=title&priceType=elite_price";

    @Test
    public void testValidateCannaCabanaUrl_validUrl() throws Exception {
        URL validated = activity.validateCannaCabanaUrl(VALID_URL);
        assertNotNull(validated);
        assertEquals("app.cannacabana.com", validated.getHost());
        assertEquals("/api/product/filterv2", validated.getPath());
    }

    @Test(expected = SecurityException.class)
    public void testValidateCannaCabanaUrl_rejectsHttp() throws Exception {
        activity.validateCannaCabanaUrl(VALID_URL.replace("https://", "http://"));
    }

    @Test(expected = SecurityException.class)
    public void testValidateCannaCabanaUrl_rejectsWrongHost() throws Exception {
        activity.validateCannaCabanaUrl(VALID_URL.replace("app.cannacabana.com", "malicious.com"));
    }

    @Test(expected = SecurityException.class)
    public void testValidateCannaCabanaUrl_rejectsWrongPath() throws Exception {
        activity.validateCannaCabanaUrl(VALID_URL.replace("/api/product/filterv2", "/api/admin"));
    }

    @Test(expected = SecurityException.class)
    public void testValidateCannaCabanaUrl_rejectsWrongStore() throws Exception {
        activity.validateCannaCabanaUrl(VALID_URL.replace("storeId=3658", "storeId=9999"));
    }

    @Test(expected = SecurityException.class)
    public void testValidateCannaCabanaUrl_rejectsWrongSize() throws Exception {
        activity.validateCannaCabanaUrl(VALID_URL.replace("selectedOptions=28+G", "selectedOptions=3.5+G"));
    }

    @Test(expected = SecurityException.class)
    public void testValidateCannaCabanaUrl_rejectsHighPage() throws Exception {
        activity.validateCannaCabanaUrl(VALID_URL.replace("page=1", "page=25"));
    }

    @Test
    public void testCannaHttpClient_timeouts() {
        OkHttpClient client = activity.cannaHttpClient;
        assertEquals(6000, client.connectTimeoutMillis());
        assertEquals(10000, client.readTimeoutMillis());
        assertEquals(12000, client.callTimeoutMillis());
    }

    @Test
    public void testCannaHttpClient_interceptorBlocksUnauthorizedUrl() {
        OkHttpClient client = activity.cannaHttpClient;
        Request request = new Request.Builder()
                .url("https://malicious.com/api/product/filterv2")
                .build();

        try {
            client.newCall(request).execute();
            fail("Expected interceptor to block unapproved URL");
        } catch (IOException expected) {
            assertTrue(expected.getMessage().contains("Blocked unapproved Canna Cabana request"));
        }
    }

    @Test
    public void testCancelCannaCabanaRequest_tracksCancellation() {
        MainActivity.AndroidBridge bridge = activity.new AndroidBridge();
        String requestId = "canna-test-123";

        assertFalse(activity.cancelledCannaRequests.contains(requestId));
        bridge.cancelCannaCabanaRequest(requestId);
        assertTrue(activity.cancelledCannaRequests.contains(requestId));
    }
}
