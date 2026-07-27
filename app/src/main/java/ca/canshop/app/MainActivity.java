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
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.CookiePolicy;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final int MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
    private static final int MAX_ATTEMPTS = 3;
    private static final String APP_VERSION = "2.0.0";
    private static final String BULK_BUDDY_ORIGIN = "https://www.bulkbuddy.co";
    private static final String BROWSER_USER_AGENT =
            "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 CanShop/2.0.0";

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
        public String appVersion() {
            return APP_VERSION;
        }
    }

    private void fetchPage(String requestId, String rawUrl) {
        Exception lastError = null;

        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                PageResponse response = fetchPageOnce(rawUrl);
                dispatchJavascript(
                        "window.CanShop.receivePage(" +
                                JSONObject.quote(requestId) + "," +
                                JSONObject.quote(response.url) + "," +
                                JSONObject.quote(response.html) +
                                ");"
                );
                return;
            } catch (Exception error) {
                lastError = error;
                if (attempt < MAX_ATTEMPTS) {
                    try {
                        Thread.sleep(500L * attempt);
                    } catch (InterruptedException interrupted) {
                        Thread.currentThread().interrupt();
                        lastError = interrupted;
                        break;
                    }
                }
            }
        }

        String message = lastError == null || lastError.getMessage() == null
                ? "Unable to fetch the Bulk Buddy page after retries."
                : lastError.getMessage();
        dispatchJavascript(
                "window.CanShop.receiveFetchError(" +
                        JSONObject.quote(requestId) + "," +
                        JSONObject.quote(message) +
                        ");"
        );
    }

    private PageResponse fetchPageOnce(String rawUrl) throws Exception {
        URL safeUrl = validateBulkBuddyUrl(rawUrl);
        HttpURLConnection connection = null;

        try {
            connection = (HttpURLConnection) safeUrl.openConnection();
            connection.setConnectTimeout(20_000);
            connection.setReadTimeout(35_000);
            connection.setInstanceFollowRedirects(true);
            connection.setRequestMethod("GET");
            connection.setRequestProperty("User-Agent", BROWSER_USER_AGENT);
            connection.setRequestProperty("Accept", "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8");
            connection.setRequestProperty("Accept-Language", "en-CA,en;q=0.9");
            connection.setRequestProperty("Cache-Control", "no-cache, no-store, max-age=0");
            connection.setRequestProperty("Pragma", "no-cache");
            connection.setRequestProperty("Referer", BULK_BUDDY_ORIGIN + "/product-category/cannabis/");
            connection.setRequestProperty("DNT", "1");
            connection.setRequestProperty("Connection", "keep-alive");
            applyCookies(connection, safeUrl.toURI());

            int status = connection.getResponseCode();
            storeCookies(connection);
            if (status < 200 || status >= 300) {
                throw new IllegalStateException(
                        "Bulk Buddy returned HTTP " + status + " for " + safeUrl.getPath() + "."
                );
            }

            String html = readResponse(connection.getInputStream());
            String resolvedUrl = connection.getURL().toString();
            validateBulkBuddyUrl(resolvedUrl);
            return new PageResponse(resolvedUrl, html);
        } finally {
            if (connection != null) connection.disconnect();
        }
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
            // Cookie persistence improves resilience but is not required to parse a page.
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
        URI uri = new URI(rawUrl == null ? "" : rawUrl.trim());
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

        return uri.toURL();
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
