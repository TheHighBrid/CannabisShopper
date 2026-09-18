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
import java.net.URLDecoder;
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
    private static final String APP_VERSION = "2.0.6";
    private static final String BULK_BUDDY_ORIGIN = "https://www.bulkbuddy.co";
    private static final String VARIATION_ENDPOINT = BULK_BUDDY_ORIGIN + "/?wc-ajax=get_variation";
    private static final String CANNA_CABANA_API_ORIGIN = "https://app.cannacabana.com";
    private static final String CANNA_CABANA_COLLECTION_URL =
            "https://cannacabana.com/collections/whole-flower?sID=3658";
    private static final String BROWSER_USER_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

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
        public void fetchCannaCabanaPage(String requestId, String rawUrl) {
            networkExecutor.execute(() -> fetchCannaCabanaPage(requestId, rawUrl));
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

    private void fetchCannaCabanaPage(String requestId, String rawUrl) {
        Exception lastError = null;

        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                PageResponse response = fetchCannaCabanaPageOnce(rawUrl);
                dispatchCannaPage(requestId, response.url, response.html);
                return;
            } catch (Exception error) {
                lastError = error;
                if (!sleepBeforeRetry(attempt, MAX_ATTEMPTS)) break;
            }
        }

        dispatchCannaFetchError(
                requestId,
                errorMessage(lastError, "Unable to fetch the Canna Cabana Elite inventory after retries.")
        );
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

    private boolean isProductUrl(URL url) {
        return url != null && url.getPath() != null
                && url.getPath().toLowerCase(Locale.CANADA).startsWith("/product/");
    }

    private URL withFreshProductToken(URL canonicalUrl) throws Exception {
        if (!isProductUrl(canonicalUrl)) return canonicalUrl;
        String separator = canonicalUrl.getQuery() == null ? "?" : "&";
        return new URL(canonicalUrl.toString() + separator + "_canshop=" + System.currentTimeMillis());
    }

    private PageResponse fetchPageOnce(String rawUrl) throws Exception {
        URL canonicalRequestUrl = validateBulkBuddyUrl(rawUrl);
        boolean productRequest = isProductUrl(canonicalRequestUrl);
        URL currentUrl = productRequest ? withFreshProductToken(canonicalRequestUrl) : canonicalRequestUrl;

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
                    URL validatedRedirect = validateBulkBuddyUrl(redirectedUrl.toString());
                    currentUrl = productRequest && isProductUrl(validatedRedirect)
                            ? withFreshProductToken(validatedRedirect)
                            : validatedRedirect;
                    continue;
                }

                if (status < 200 || status >= 300) {
                    throw new IllegalStateException(
                            "Bulk Buddy returned HTTP " + status + " for " + currentUrl.getPath() + "."
                    );
                }

                String html = readResponse(connection.getInputStream());
                URL responseUrl = validateBulkBuddyUrl(currentUrl.toString());
                return new PageResponse(responseUrl.toString(), html);
            } finally {
                if (connection != null) connection.disconnect();
            }
        }

        throw new IllegalStateException("Bulk Buddy redirect handling ended unexpectedly.");
    }

    private PageResponse fetchCannaCabanaPageOnce(String rawUrl) throws Exception {
        URL currentUrl = validateCannaCabanaUrl(rawUrl);

        for (int redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) currentUrl.openConnection();
                configureConnection(connection, currentUrl.toURI(), CANNA_CABANA_COLLECTION_URL);
                connection.setRequestMethod("GET");
                connection.setRequestProperty("Accept", "application/json");

                int status = connection.getResponseCode();
                storeCookies(connection);

                if (isRedirectStatus(status)) {
                    if (redirectCount >= MAX_REDIRECTS) {
                        throw new IllegalStateException("Canna Cabana exceeded CanShop's redirect safety limit.");
                    }
                    String location = connection.getHeaderField("Location");
                    if (location == null || location.trim().isEmpty()) {
                        throw new IllegalStateException(
                                "Canna Cabana returned HTTP " + status + " without a redirect location."
                        );
                    }
                    currentUrl = validateCannaCabanaUrl(new URL(currentUrl, location).toString());
                    continue;
                }

                if (status < 200 || status >= 300) {
                    throw new IllegalStateException(
                            "Canna Cabana returned HTTP " + status + " for the Whole Flower inventory request."
                    );
                }

                String json = readResponse(connection.getInputStream());
                JSONObject payload = new JSONObject(json);
                if (payload.optJSONArray("data") == null || payload.optJSONObject("pagination") == null) {
                    throw new IllegalStateException("Canna Cabana returned an unexpected inventory response.");
                }

                return new PageResponse(currentUrl.toString(), json);
            } finally {
                if (connection != null) connection.disconnect();
            }
        }

        throw new IllegalStateException("Canna Cabana redirect handling ended unexpectedly.");
    }

    private URL validateCannaCabanaUrl(String rawUrl) throws Exception {
        URI uri = new URI(rawUrl == null ? "" : rawUrl.trim());
        if (!"https".equalsIgnoreCase(uri.getScheme())) {
            throw new SecurityException("Only HTTPS Canna Cabana API requests are allowed.");
        }
        if (uri.getHost() == null || !"app.cannacabana.com".equalsIgnoreCase(uri.getHost())) {
            throw new SecurityException("CanShop only fetches the approved Canna Cabana inventory API.");
        }
        if (uri.getPort() != -1 && uri.getPort() != 443) {
            throw new SecurityException("Unexpected Canna Cabana API port.");
        }
        if (uri.getUserInfo() != null || uri.getFragment() != null) {
            throw new SecurityException("Unexpected Canna Cabana URL components.");
        }
        if (!"/api/product/filterv2".equals(uri.getPath())) {
            throw new SecurityException("That Canna Cabana endpoint is outside the Whole Flower crawler scope.");
        }

        Map<String, String> params = parseCannaQuery(uri.getRawQuery());
        requireCannaValue(params, "collection", "whole-flower");
        requireCannaValue(params, "selectedOptions", "28 G");
        requireCannaValue(params, "storeId", "3658");
        requireCannaValue(params, "priceType", "elite_price");
        requireCannaValue(params, "sortOrder", "asc");
        requireCannaValue(params, "sortField", "title");
        requireCannaNumber(params, "thc_level_min", 29.97);
        requireCannaNumber(params, "thc_level_max", 34.97);
        requireCannaNumber(params, "price_min", 0.0);
        requireCannaNumber(params, "cbd_level_min", 0.0);
        requireCannaNumber(params, "cbd_level_max", 100.0);

        int limit = parsePositiveInt(params.get("limit"), "limit");
        if (limit != 100) throw new SecurityException("Canna Cabana inventory limit must be 100.");

        int page = parsePositiveInt(params.get("page"), "page");
        if (page < 1 || page > 20) {
            throw new SecurityException("Canna Cabana page is outside the approved pagination range.");
        }

        return uri.toURL();
    }

    private Map<String, String> parseCannaQuery(String rawQuery) throws Exception {
        if (rawQuery == null || rawQuery.trim().isEmpty()) {
            throw new SecurityException("Canna Cabana inventory request is missing filters.");
        }

        Map<String, String> params = new java.util.HashMap<>();
        for (String part : rawQuery.split("&")) {
            if (part == null || part.isEmpty()) continue;
            int equals = part.indexOf('=');
            String rawKey = equals >= 0 ? part.substring(0, equals) : part;
            String rawValue = equals >= 0 ? part.substring(equals + 1) : "";
            String key = URLDecoder.decode(rawKey, StandardCharsets.UTF_8.name());
            String value = URLDecoder.decode(rawValue, StandardCharsets.UTF_8.name());

            if (!isAllowedCannaParameter(key)) {
                throw new SecurityException("Unexpected Canna Cabana inventory filter.");
            }
            if (params.put(key, value) != null) {
                throw new SecurityException("Duplicate Canna Cabana inventory filter.");
            }
        }
        return params;
    }

    private boolean isAllowedCannaParameter(String key) {
        return "selectedOptions".equals(key)
                || "collection".equals(key)
                || "price_min".equals(key)
                || "cbd_level_min".equals(key)
                || "cbd_level_max".equals(key)
                || "thc_level_min".equals(key)
                || "thc_level_max".equals(key)
                || "storeId".equals(key)
                || "page".equals(key)
                || "limit".equals(key)
                || "sortOrder".equals(key)
                || "sortField".equals(key)
                || "priceType".equals(key);
    }

    private void requireCannaValue(Map<String, String> params, String key, String expected) {
        String value = params.get(key);
        if (value == null || !expected.equalsIgnoreCase(value.trim())) {
            throw new SecurityException("Canna Cabana request has an unexpected " + key + " filter.");
        }
    }

    private void requireCannaNumber(Map<String, String> params, String key, double expected) {
        String value = params.get(key);
        if (value == null) {
            throw new SecurityException("Canna Cabana request is missing " + key + ".");
        }
        try {
            double parsed = Double.parseDouble(value);
            if (Math.abs(parsed - expected) > 0.0001) {
                throw new SecurityException("Canna Cabana request has an unexpected " + key + " filter.");
            }
        } catch (NumberFormatException error) {
            throw new SecurityException("Canna Cabana request has an invalid " + key + " filter.");
        }
    }

    private int parsePositiveInt(String value, String key) {
        if (value == null) throw new SecurityException("Canna Cabana request is missing " + key + ".");
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException error) {
            throw new SecurityException("Canna Cabana request has an invalid " + key + ".");
        }
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
        if (!isProductUrl(productUrl)) {
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
        connection.setRequestProperty("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0");
        connection.setRequestProperty("Pragma", "no-cache");
        connection.setRequestProperty("Expires", "0");
        connection.setRequestProperty("If-Modified-Since", "Thu, 01 Jan 1970 00:00:00 GMT");
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

    private void dispatchCannaPage(String requestId, String url, String body) {
        dispatchJavascript(
                "window.CanShopCanna.receivePage(" +
                        JSONObject.quote(requestId) + "," +
                        JSONObject.quote(url) + "," +
                        JSONObject.quote(body) +
                        ");"
        );
    }

    private void dispatchCannaFetchError(String requestId, String message) {
        dispatchJavascript(
                "window.CanShopCanna.receiveFetchError(" +
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
