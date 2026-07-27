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
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final String SOURCE_URL =
            "https://www.bulkbuddy.co/product-category/cannabis/craft-cannabis-flowers/";
    private static final int MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

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
                // The application is a research comparator, not a storefront browser.
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
        public void refreshCraftFlowerCatalog() {
            networkExecutor.execute(() -> fetchCatalog(SOURCE_URL));
        }

        @JavascriptInterface
        public String appVersion() {
            return "1.0.0";
        }
    }

    private void fetchCatalog(String sourceUrl) {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(sourceUrl);
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(15_000);
            connection.setReadTimeout(20_000);
            connection.setInstanceFollowRedirects(true);
            connection.setRequestMethod("GET");
            connection.setRequestProperty(
                    "User-Agent",
                    "CanShop/1.0 Android; legal adult-use cannabis research in Canada"
            );
            connection.setRequestProperty("Accept", "text/html,application/xhtml+xml");

            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                throw new IllegalStateException("Catalog request returned HTTP " + status + ".");
            }

            try (BufferedInputStream input = new BufferedInputStream(connection.getInputStream());
                 ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int total = 0;
                int read;
                while ((read = input.read(buffer)) != -1) {
                    total += read;
                    if (total > MAX_RESPONSE_BYTES) {
                        throw new IllegalStateException("Catalog response exceeded the safe size limit.");
                    }
                    output.write(buffer, 0, read);
                }
                String html = output.toString(StandardCharsets.UTF_8.name());
                dispatchJavascript("window.CanShop.receiveCatalog(" + JSONObject.quote(html) + ");");
            }
        } catch (Exception error) {
            String message = error.getMessage() == null
                    ? "Unable to refresh the catalog."
                    : error.getMessage();
            dispatchJavascript("window.CanShop.receiveError(" + JSONObject.quote(message) + ");");
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
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
