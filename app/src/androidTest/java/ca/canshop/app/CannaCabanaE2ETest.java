package ca.canshop.app;

import static org.junit.Assert.assertTrue;

import android.os.SystemClock;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

@RunWith(AndroidJUnit4.class)
public final class CannaCabanaE2ETest {
    private static final long PAGE_READY_TIMEOUT_MS = 20_000L;
    private static final long FETCH_TIMEOUT_MS = 33_000L;
    private static final long JS_CALLBACK_TIMEOUT_MS = 10_000L;

    @Test
    public void cannaEndToEndFetchBridgePersistenceAndComparison() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.moveToState(Lifecycle.State.RESUMED);
            waitForDocumentReady(scenario);

            long started = SystemClock.elapsedRealtime();
            assertTrue(
                    "Canna Cabana fetch button could not be invoked.",
                    waitForCondition(scenario,
                            "(() => {const b=document.getElementById('fetchCannaButton'); if(!b) return false; b.click(); return true;})()",
                            5_000L)
            );

            assertTrue(
                    "Canna Cabana fetch did not produce a successful non-zero result inside 33 seconds.",
                    waitForCondition(scenario,
                            "(() => {" +
                                    "const s=(document.getElementById('cannaStatus')?.textContent||'').toLowerCase();" +
                                    "const c=Number(document.getElementById('cannaCount')?.textContent||'0');" +
                                    "return c>0 && s.startsWith('fetched ') && !s.includes('timed out') && !s.includes('safety window') && !s.includes('failed');" +
                                    "})()",
                            FETCH_TIMEOUT_MS)
            );

            long elapsed = SystemClock.elapsedRealtime() - started;
            assertTrue("Successful fetch exceeded the 35-second UI safety budget: " + elapsed + " ms", elapsed < 35_000L);

            assertTrue(
                    "Saved Canna Cabana localStorage payload is empty.",
                    waitForCondition(scenario,
                            "(() => {try {return JSON.parse(localStorage.getItem('canshop_cannacabana_elite_v1')||'[]').length>0;} catch(e){return false;}})()",
                            5_000L)
            );

            assertTrue(
                    "Rendered Canna Cabana cards do not match the saved eligible count.",
                    waitForCondition(scenario,
                            "(() => {const c=Number(document.getElementById('cannaCount')?.textContent||'0'); return c>0 && document.querySelectorAll('#cannaResults .canna-card').length===c;})()",
                            5_000L)
            );

            assertTrue(
                    "Cross-source comparison did not receive Canna Cabana products.",
                    waitForCondition(scenario,
                            "(() => {const s=document.getElementById('crossSourceSummary')?.textContent||''; return /Canna Cabana Elite 28g/.test(s) && !/^Fetch one or both/.test(s);})()",
                            5_000L)
            );

            assertTrue(
                    "Fetch button did not return to an enabled state after a successful request.",
                    waitForCondition(scenario,
                            "(() => {const b=document.getElementById('fetchCannaButton'); return !!b && !b.disabled && /fetch elite/i.test(b.textContent||'');})()",
                            5_000L)
            );
        }
    }

    private WebView findWebView(MainActivity activity) {
        ViewGroup content = activity.findViewById(android.R.id.content);
        if (content != null && content.getChildCount() > 0 && content.getChildAt(0) instanceof WebView) {
            return (WebView) content.getChildAt(0);
        }
        throw new AssertionError("MainActivity WebView was not created.");
    }

    private void waitForDocumentReady(ActivityScenario<MainActivity> scenario) throws Exception {
        assertTrue(
                "CanShop document did not become ready.",
                waitForCondition(scenario,
                        "document.readyState==='complete' && !!document.getElementById('fetchCannaButton')",
                        PAGE_READY_TIMEOUT_MS)
        );
    }

    private boolean waitForCondition(ActivityScenario<MainActivity> scenario, String expression, long timeoutMs) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + timeoutMs;
        while (SystemClock.elapsedRealtime() < deadline) {
            String result = tryEvaluate(scenario, expression);
            if ("true".equalsIgnoreCase(result)) return true;
            SystemClock.sleep(350L);
        }
        return false;
    }

    private String tryEvaluate(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> value = new AtomicReference<>("null");
        scenario.onActivity(activity -> {
            WebView webView = findWebView(activity);
            webView.evaluateJavascript(script, result -> {
                value.set(result == null ? "null" : result);
                latch.countDown();
            });
        });
        if (!latch.await(JS_CALLBACK_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
            return "null";
        }
        return value.get();
    }
}
