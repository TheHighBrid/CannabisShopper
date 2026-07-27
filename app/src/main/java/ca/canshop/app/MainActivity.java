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
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final int MAX_RESPONSE_BYTES = 6 * 1024 * 1024;
    private static final String APP_VERSION = "1.0.1";
    private static final String BROWSER_USER_AGENT =
            "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 CanShop/1.0.1";

    private WebView webView;
    private final ExecutorService networkExecutor = Executors.newSingleThreadExecutor();

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
                // CanShop extracts public listing data but never opens the storefront or checkout.
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
        HttpURLConnection connection = null;
        try {
            URL safeUrl = validateBulkBuddyUrl(rawUrl);
            connection = (HttpURLConnection) safeUrl.openConnection();
            connection.setConnectTimeout(18_000);
            connection.setReadTimeout(25_000);
            connection.setInstanceFollowRedirects(true);
            connection.setRequestMethod("GET");
            connection.setRequestProperty("User-Agent", BROWSER_USER_AGENT);
            connection.setRequestProperty("Accept", "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8");
            connection.setRequestProperty("Accept-Language", "en-CA,en;q=0.9");
            connection.setRequestProperty("Cache-Control", "no-cache");

            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                throw new IllegalStateException("Bulk Buddy returned HTTP " + status + ".");
            }

            try (BufferedInputStream input = new BufferedInputStream(connection.getInputStream());
                 ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int total = 0;
                int read;
                while ((read = input.read(buffer)) != -1) {
                    total += read;
                    if (total > MAX_RESPONSE_BYTES) {
                        throw new IllegalStateException("The page exceeded CanShop's 6 MB safety limit.");
                    }
                    output.write(buffer, 0, read);
                }

                String html = output.toString(StandardCharsets.UTF_8.name());
                String resolvedUrl = connection.getURL().toString();
                dispatchJavascript(
                        "window.CanShop.receivePage(" +
                                JSONObject.quote(requestId) + "," +
                                JSONObject.quote(resolvedUrl) + "," +
                                JSONObject.quote(html) +
                                ");"
                );
            }
        } catch (Exception error) {
            String message = error.getMessage() == null
                    ? "Unable to fetch the Bulk Buddy page."
                    : error.getMessage();
            dispatchJavascript(
                    "window.CanShop.receiveFetchError(" +
                            JSONObject.quote(requestId) + "," +
                            JSONObject.quote(message) +
                            ");"
            );
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private URL validateBulkBuddyUrl(String rawUrl) throws Exception {
        URI uri = new URI(rawUrl == null ? "" : rawUrl.trim());
        String scheme = uri.getScheme();
        String host = uri.getHost();
        String path = uri.getPath() == null ? "/" : uri.getPath();
        String query = uri.getRawQuery() == null ? "" : uri.getRawQuery();

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

        boolean productPage = path.startsWith("/product/");
        boolean categoryPage = path.startsWith("/product-category/cannabis/craft-cannabis-flowers");
        boolean craftSearch = "/".equals(path)
                && query.contains("post_type=product")
                && query.contains("taxonomy=product_cat")
                && query.contains("craft-cannabis-flowers");

        if (!productPage && !categoryPage && !craftSearch) {
            throw new SecurityException("That Bulk Buddy page is outside the craft-flower crawler scope.");
        }

        return uri.toURL();
    }

    private void dispatchJavascript(String script) {
        if (webView == null) return;
        webView.post(() -> {
            if (webView != null) {
                webView.evaluateJavascript(script, null);
            }
        });
    }
}
