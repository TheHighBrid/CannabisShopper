package ca.canshop.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.CookiePolicy;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final int MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
    private static final int MAX_ATTEMPTS = 4;
    private static final int MAX_REDIRECTS = 5;
    private static final String APP_VERSION = "2.0.2";
    private static final String BULK_BUDDY_ORIGIN = "https://www.bulkbuddy.co";
    private static final String VARIATION_ENDPOINT = BULK_BUDDY_ORIGIN + "/?wc-ajax=get_variation";
    private static final String BROWSER_USER_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 CanShop/2.0.2";

    private WebView webView;
    private final ExecutorService networkExecutor = Executors.newFixedThreadPool(3);
    private final java.net.CookieManager httpCookieManager =
            new java.net.CookieManager(null, CookiePolicy.ACCEPT_ALL);

    @Override
    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportZoom(false);

        CookieManager.getInstance().setAcceptCookie(false);
        WebView.setWebContentsDebuggingEnabled(false);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return true;
            }
        });
        webView.addJavascriptInterface(new AndroidBridge(), "Android");
        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        networkExecutor.shutdownNow();
        if (webView != null) {
            webView.removeJavascriptInterface("Android");
            webView.destroy();
        }
        super.onDestroy();
    }

    public final class AndroidBridge {
        @JavascriptInterface
        public void fetchBulkBuddyPage(String requestId, String rawUrl) {
            networkExecutor.execute(() -> fetchPage(requestId, rawUrl));
        }

        @JavascriptInterface
        public void fetchBulkBuddyVariation(String requestId, String rawProductUrl, String payloadJson) {
            networkExecutor.execute(() -> fetchVariation(requestId, rawProductUrl, payloadJson));
        }

        @JavascriptInterface
        public String appVersion() {
            return APP_VERSION;
        }
    }

    private void fetchPage(String requestId, String rawUrl) {
        Exception lastError = null;

        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                PageResponse response = fetchPageOnce(rawUrl);
                dispatchPage(requestId, response.url, response.html);
                return;
            } catch (Exception error) {
                lastError = error;
                if (!sleepBeforeRetry(attempt, MAX_ATTEMPTS)) break;
            }
        }

        dispatchFetchError(requestId, errorMessage(lastError, "Unable to fetch the Bulk Buddy page after retries."));
    }

    private void fetchVariation(String requestId, String rawProductUrl, String payloadJson) {
        Exception lastError = null;
        final int maxAttempts = 3;

        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                PageResponse response = fetchVariationOnce(rawProductUrl, payloadJson);
                dispatchPage(requestId, response.url, response.html);
                return;
            } catch (Exception error) {
                lastError = error;
                if (!sleepBeforeRetry(attempt, maxAttempts)) break;
            }
        }

        dispatchFetchError(requestId, errorMessage(lastError, "Unable to verify the selected package after retries."));
    }

    private boolean sleepBeforeRetry(int attempt, int maxAttempts) {
        if (attempt >= maxAttempts) return false;
        try {
            long delay = Math.min(5_000L, 750L * (1L << Math.max(0, attempt - 1)));
            Thread.sleep(delay);
            return true;
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    private String errorMessage(Exception error, String fallback) {
        return error == null || error.getMessage() == null ? fallback : error.getMessage();
    }

    private PageResponse fetchPageOnce(String rawUrl) throws Exception {
        URL currentUrl = validateBulkBuddyUrl(rawUrl);

        for (int redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) currentUrl.openConnection();
                configureConnection(connection, currentUrl.toURI(), BULK_BUDDY_ORIGIN + "/product-category/cannabis/");
                connection.setRequestMethod("GET");

                int status = connection.getResponseCode();
                storeCookies(connection);

                if (isRedirectStatus(status)) {
                    if (redirectCount >= MAX_REDIRECTS) {
                        throw new IllegalStateException("Bulk Buddy exceeded CanShop's redirect safety limit.");
                    }
                    String location = connection.getHeaderField("Location");
                    if (location == null || location.trim().isEmpty()) {
                        throw new IllegalStateException(
                                "Bulk Buddy returned HTTP " + status + " without a redirect location."
                        );
                    }
                    URL redirectedUrl = new URL(currentUrl, location);
                    currentUrl = validateBulkBuddyUrl(redirectedUrl.toString());
                    continue;
                }

                if (status < 200 || status >= 300) {
                    throw new IllegalStateException(
                            "Bulk Buddy returned HTTP " + status + " for " + currentUrl.getPath() + "."
                    );
                }

                String html = readResponse(connection.getInputStream());
                return new PageResponse(currentUrl.toString(), html);
            } finally {
                if (connection != null) connection.disconnect();
            }
        }

        throw new IllegalStateException("Bulk Buddy redirect handling ended unexpectedly.");
    }

    private boolean isRedirectStatus(int status) {
        return status == HttpURLConnection.HTTP_MOVED_PERM
                || status == HttpURLConnection.HTTP_MOVED_TEMP
                || status == HttpURLConnection.HTTP_SEE_OTHER
                || status == 307
                || status == 308;
    }

    private PageResponse fetchVariationOnce(String rawProductUrl, String payloadJson) throws Exception {
        URL productUrl = validateBulkBuddyUrl(rawProductUrl);
        if (!productUrl.getPath().toLowerCase(Locale.CANADA).startsWith("/product/")) {
            throw new SecurityException("Variation requests require a Bulk Buddy product page.");
        }

        String body = buildVariationForm(payloadJson);
        URL endpoint = new URL(VARIATION_ENDPOINT);
        validateBulkBuddyScope(endpoint.toURI());
        HttpURLConnection connection = null;

        try {
            connection = (HttpURLConnection) endpoint.openConnection();
            configureConnection(connection, endpoint.toURI(), productUrl.toString());
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
            connection.setRequestProperty("X-Requested-With", "XMLHttpRequest");
            byte[] bodyBytes = body.getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(bodyBytes.length);

            try (OutputStream output = new BufferedOutputStream(connection.getOutputStream())) {
                output.write(bodyBytes);
            }

            int status = connection.getResponseCode();
            storeCookies(connection);
            if (status < 200 || status >= 300) {
                throw new IllegalStateException(
                        "Bulk Buddy variation endpoint returned HTTP " + status + "."
                );
            }

            String json = readResponse(connection.getInputStream());
            String trimmed = json.trim();
            if (!("false".equals(trimmed) || trimmed.startsWith("{"))) {
                throw new IllegalStateException("Bulk Buddy returned an unexpected variation response.");
            }
            return new PageResponse(productUrl.toString(), trimmed);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void configureConnection(HttpURLConnection connection, URI cookieUri, String referer) throws Exception {
        connection.setConnectTimeout(20_000);
        connection.setReadTimeout(35_000);
        connection.setUseCaches(false);
        connection.setDefaultUseCaches(false);
        connection.setInstanceFollowRedirects(false);
        connection.setRequestProperty("User-Agent", BROWSER_USER_AGENT);
        connection.setRequestProperty("Accept", "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8");
        connection.setRequestProperty("Accept-Language", "en-CA,en;q=0.9");
        connection.setRequestProperty("Cache-Control", "no-cache, must-revalidate, max-age=0");
        connection.setRequestProperty("Pragma", "no-cache");
        connection.setRequestProperty("Referer", referer);
        connection.setRequestProperty("DNT", "1");
        connection.setRequestProperty("Connection", "keep-alive");
        applyCookies(connection, cookieUri);
    }

    private String buildVariationForm(String payloadJson) throws Exception {
        JSONObject payload = new JSONObject(payloadJson == null ? "{}" : payloadJson);
        String productId = payload.optString("product_id", "").trim();
        if (!productId.matches("\\d+")) {
            throw new SecurityException("Variation payload is missing a valid product id.");
        }

        StringBuilder form = new StringBuilder();
        appendFormField(form, "product_id", productId);
        Iterator<String> keys = payload.keys();
        int attributeCount = 0;
        while (keys.hasNext()) {
            String key = keys.next();
            if ("product_id".equals(key)) continue;
            if (!key.matches("attribute_[A-Za-z0-9_-]+")) {
                throw new SecurityException("Unexpected variation attribute name.");
            }
            String value = payload.optString(key, "");
            if (value.length() > 160) throw new SecurityException("Variation attribute value is too long.");
            appendFormField(form, key, value);
            attributeCount++;
        }
        if (attributeCount == 0) {
            throw new IllegalArgumentException("Variation payload has no package attribute.");
        }
        return form.toString();
    }

    private void appendFormField(StringBuilder form, String key, String value) throws Exception {
        if (form.length() > 0) form.append('&');
        form.append(URLEncoder.encode(key, StandardCharsets.UTF_8.name()));
        form.append('=');
        form.append(URLEncoder.encode(value, StandardCharsets.UTF_8.name()));
    }

    private void applyCookies(HttpURLConnection connection, URI uri) throws Exception {
        Map<String, List<String>> headers = httpCookieManager.get(uri, Collections.emptyMap());
        for (Map.Entry<String, List<String>> entry : headers.entrySet()) {
            if ("Cookie".equalsIgnoreCase(entry.getKey())) {
                connection.setRequestProperty("Cookie", joinHeaderValues(entry.getValue()));
            }
        }
    }

    private String joinHeaderValues(List<String> values) {
        StringBuilder joined = new StringBuilder();
        for (String value : values) {
            if (value == null || value.isEmpty()) continue;
            if (joined.length() > 0) joined.append("; ");
            joined.append(value);
        }
        return joined.toString();
    }

    private void storeCookies(HttpURLConnection connection) {
        try {
            httpCookieManager.put(connection.getURL().toURI(), connection.getHeaderFields());
        } catch (Exception ignored) {
        }
    }

    private String readResponse(InputStream stream) throws Exception {
        try (BufferedInputStream input = new BufferedInputStream(stream);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int total = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > MAX_RESPONSE_BYTES) {
                    throw new IllegalStateException("The page exceeded CanShop's 8 MB safety limit.");
                }
                output.write(buffer, 0, read);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    private URL validateBulkBuddyUrl(String rawUrl) throws Exception {
        URI input = new URI(rawUrl == null ? "" : rawUrl.trim());
        validateBulkBuddyScope(input);

        String path = input.getPath() == null || input.getPath().isEmpty() ? "/" : input.getPath();
        path = path.replaceAll("/{2,}", "/");
        path = path.replaceAll("(?i)/page/1/?$", "/");
        String normalizedPath = path.toLowerCase(Locale.CANADA);
        boolean productPage = normalizedPath.startsWith("/product/");
        boolean cannabisCategory = normalizedPath.startsWith("/product-category/cannabis");
        boolean homepageOrSearch = "/".equals(normalizedPath);

        if ((productPage || cannabisCategory) && !path.endsWith("/")) {
            path += "/";
        }

        String query;
        if (productPage) {
            query = null;
        } else if (cannabisCategory) {
            query = keepCategoryParameters(input.getRawQuery());
        } else if (homepageOrSearch) {
            query = keepSearchParameters(input.getRawQuery());
        } else {
            query = null;
        }

        StringBuilder canonical = new StringBuilder(BULK_BUDDY_ORIGIN).append(path);
        if (query != null && !query.isEmpty()) canonical.append('?').append(query);
        URL canonicalUrl = new URL(canonical.toString());
        validateBulkBuddyScope(canonicalUrl.toURI());
        return canonicalUrl;
    }

    private String keepCategoryParameters(String rawQuery) {
        if (rawQuery == null || rawQuery.isEmpty()) return null;
        StringBuilder kept = new StringBuilder();
        for (String part : rawQuery.split("&")) {
            if (part == null || part.isEmpty()) continue;
            int equals = part.indexOf('=');
            String key = (equals >= 0 ? part.substring(0, equals) : part).toLowerCase(Locale.CANADA);
            String value = equals >= 0 ? part.substring(equals + 1) : "";
            if (!"shop_view".equals(key)
                    && !"per_page".equals(key)
                    && !"paged".equals(key)
                    && !"product-page".equals(key)) {
                continue;
            }
            if (("paged".equals(key) || "product-page".equals(key)) && "1".equals(value)) {
                continue;
            }
            if (kept.length() > 0) kept.append('&');
            kept.append(part);
        }
        return kept.length() == 0 ? null : kept.toString();
    }

    private String keepSearchParameters(String rawQuery) {
        if (rawQuery == null || rawQuery.isEmpty()) return null;
        StringBuilder kept = new StringBuilder();
        for (String part : rawQuery.split("&")) {
            if (part == null || part.isEmpty()) continue;
            int equals = part.indexOf('=');
            String key = (equals >= 0 ? part.substring(0, equals) : part).toLowerCase(Locale.CANADA);
            String value = equals >= 0 ? part.substring(equals + 1) : "";
            if (!"term".equals(key)
                    && !"s".equals(key)
                    && !"post_type".equals(key)
                    && !"taxonomy".equals(key)
                    && !"paged".equals(key)) {
                continue;
            }
            if ("paged".equals(key) && "1".equals(value)) continue;
            if (kept.length() > 0) kept.append('&');
            kept.append(part);
        }
        return kept.length() == 0 ? null : kept.toString();
    }

    private void validateBulkBuddyScope(URI uri) {
        String scheme = uri.getScheme();
        String host = uri.getHost();
        String path = uri.getPath() == null ? "/" : uri.getPath();

        if (!"https".equalsIgnoreCase(scheme)) {
            throw new SecurityException("Only HTTPS Bulk Buddy pages can be fetched.");
        }
        if (host == null) {
            throw new SecurityException("The requested page has no valid host.");
        }

        String normalizedHost = host.toLowerCase(Locale.CANADA);
        if (!"bulkbuddy.co".equals(normalizedHost) && !"www.bulkbuddy.co".equals(normalizedHost)) {
            throw new SecurityException("CanShop only fetches bulkbuddy.co.");
        }

        String normalizedPath = path.toLowerCase(Locale.CANADA);
        boolean productPage = normalizedPath.startsWith("/product/");
        boolean cannabisCategory = normalizedPath.startsWith("/product-category/cannabis");
        boolean homepageOrSearch = "/".equals(normalizedPath);

        if (!productPage && !cannabisCategory && !homepageOrSearch) {
            throw new SecurityException("That Bulk Buddy page is outside the cannabis crawler scope.");
        }
    }

    private void dispatchPage(String requestId, String url, String body) {
        dispatchJavascript(
                "window.CanShop.receivePage(" +
                        JSONObject.quote(requestId) + "," +
                        JSONObject.quote(url) + "," +
                        JSONObject.quote(body) +
                        ");"
        );
    }

    private void dispatchFetchError(String requestId, String message) {
        dispatchJavascript(
                "window.CanShop.receiveFetchError(" +
                        JSONObject.quote(requestId) + "," +
                        JSONObject.quote(message) +
                        ");"
        );
    }

    private void dispatchJavascript(String script) {
        if (webView == null) return;
        webView.post(() -> {
            if (webView != null) webView.evaluateJavascript(script, null);
        });
    }

    private static final class PageResponse {
        final String url;
        final String html;

        PageResponse(String url, String html) {
            this.url = url;
            this.html = html;
        }
    }
}
