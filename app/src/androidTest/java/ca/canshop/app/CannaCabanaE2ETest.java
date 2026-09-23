package ca.canshop.app;

import static org.junit.Assert.assertTrue;

import android.os.SystemClock;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

@RunWith(AndroidJUnit4.class)
public final class CannaCabanaE2ETest {
    private static final long PAGE_READY_TIMEOUT_MS = 15_000L;
    private static final long FETCH_TIMEOUT_MS = 33_000L;

    @Test
    public void cannaFetchCompletesInsideSafetyWindowAndReturnsResults() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            WebView webView = getWebView(scenario);
            waitForDocumentReady(webView);

            long started = SystemClock.elapsedRealtime();
            evaluate(webView, "document.getElementById('fetchCannaButton').click(); true;");

            assertTrue(
                    "Canna Cabana fetch did not produce a successful non-zero result inside 33 seconds.",
                    waitForCondition(webView,
                            "(() => {" +
                                    "const s=(document.getElementById('cannaStatus')?.textContent||'').toLowerCase();" +
                                    "const c=Number(document.getElementById('cannaCount')?.textContent||'0');" +
                                    "return c>0 && s.startsWith('fetched ') && !s.includes('timed out') && !s.includes('safety window') && !s.includes('failed');" +
                                    "})()",
                            FETCH_TIMEOUT_MS)
            );

            long elapsed = SystemClock.elapsedRealtime() - started;
            assertTrue("Successful fetch exceeded the 35-second UI safety budget: " + elapsed + " ms", elapsed < 35_000L);
        }
    }

    @Test
    public void cannaResultsPersistAndPopulateCrossSourceComparison() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            WebView webView = getWebView(scenario);
            waitForDocumentReady(webView);

            evaluate(webView, "document.getElementById('fetchCannaButton').click(); true;");
            assertTrue(
                    "Canna Cabana fetch did not complete successfully for persistence validation.",
                    waitForCondition(webView,
                            "(() => {" +
                                    "const s=(document.getElementById('cannaStatus')?.textContent||'').toLowerCase();" +
                                    "const c=Number(document.getElementById('cannaCount')?.textContent||'0');" +
                                    "return c>0 && s.startsWith('fetched ');" +
                                    "})()",
                            FETCH_TIMEOUT_MS)
            );

            assertTrue(
                    "Saved Canna Cabana localStorage payload is empty.",
                    Boolean.parseBoolean(evaluate(webView,
                            "(() => {try {return JSON.parse(localStorage.getItem('canshop_cannacabana_elite_v1')||'[]').length>0;} catch(e){return false;}})()"))
            );

            assertTrue(
                    "Rendered Canna Cabana cards do not match the saved eligible count.",
                    Boolean.parseBoolean(evaluate(webView,
                            "(() => {const c=Number(document.getElementById('cannaCount')?.textContent||'0'); return c>0 && document.querySelectorAll('#cannaResults .canna-card').length===c;})()"))
            );

            assertTrue(
                    "Cross-source comparison did not receive Canna Cabana products.",
                    Boolean.parseBoolean(evaluate(webView,
                            "(() => {const s=document.getElementById('crossSourceSummary')?.textContent||''; return /Canna Cabana Elite 28g/.test(s) && !/^Fetch one or both/.test(s);})()"))
            );
        }
    }

    private WebView getWebView(ActivityScenario<MainActivity> scenario) {
        AtomicReference<WebView> ref = new AtomicReference<>();
        scenario.onActivity(activity -> {
            ViewGroup content = activity.findViewById(android.R.id.content);
            if (content != null && content.getChildCount() > 0 && content.getChildAt(0) instanceof WebView) {
                ref.set((WebView) content.getChildAt(0));
            }
        });
        WebView webView = ref.get();
        if (webView == null) throw new AssertionError("MainActivity WebView was not created.");
        return webView;
    }

    private void waitForDocumentReady(WebView webView) throws Exception {
        assertTrue(
                "CanShop document did not become ready.",
                waitForCondition(webView,
                        "document.readyState==='complete' && !!document.getElementById('fetchCannaButton')",
                        PAGE_READY_TIMEOUT_MS)
        );
    }

    private boolean waitForCondition(WebView webView, String expression, long timeoutMs) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + timeoutMs;
        while (SystemClock.elapsedRealtime() < deadline) {
            String result = evaluate(webView, expression);
            if ("true".equalsIgnoreCase(result)) return true;
            SystemClock.sleep(500L);
        }
        return false;
    }

    private String evaluate(WebView webView, String script) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> value = new AtomicReference<>("null");
        webView.post(() -> webView.evaluateJavascript(script, result -> {
            value.set(result == null ? "null" : result);
            latch.countDown();
        }));
        if (!latch.await(5, TimeUnit.SECONDS)) {
            throw new AssertionError("WebView JavaScript callback did not return within 5 seconds.");
        }
        return value.get();
    }
}
