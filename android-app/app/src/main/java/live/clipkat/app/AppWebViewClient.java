/* جميع الحقوق محفوظة © 2026 وطن النهار */
package live.clipkat.app;

import android.graphics.Bitmap;
import android.net.http.SslError;
import android.os.Build;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;


/** Navigation, SSL (never bypassed), offline page, Google WebView-block detection. */
final class AppWebViewClient extends WebViewClient {
    private final MainActivity activity;
    private boolean lastErrorWasMain;

    AppWebViewClient(MainActivity activity) {
        this.activity = activity;
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        if (request == null) return false;
        if (Build.VERSION.SDK_INT >= 24 && request.isForMainFrame() == false) {
            return false; // iframes (GIS, ads, LiveKit) stay in the WebView
        }
        return activity.handleUrl(request.getUrl() == null ? "" : request.getUrl().toString(), true);
    }

    @Override
    @SuppressWarnings("deprecation")
    public boolean shouldOverrideUrlLoading(WebView view, String url) {
        return activity.handleUrl(url, true);
    }

    @Override
    public void onPageStarted(WebView view, String url, Bitmap favicon) {
        lastErrorWasMain = false;
        if (!Urls.isOfflineUrl(url)) {
            activity.setShowingOffline(false);
        }
    }

    @Override
    public void onPageFinished(WebView view, String url) {
        activity.onPageFinished(url, lastErrorWasMain);
        if (Urls.isGoogleAuthHost(url) && view != null) {
            view.evaluateJavascript(
                    "(function(){try{var t=(document.body&&document.body.innerText)||'';"
                            + "t=t.toLowerCase();"
                            + "return t.indexOf('disallowed_useragent')>=0"
                            + "||(t.indexOf('webview')>=0&&t.indexOf('403')>=0);}"
                            + "catch(e){return false;}})()",
                    value -> {
                        if ("true".equalsIgnoreCase(value)) {
                            activity.onGoogleSignInBlocked();
                        }
                    });
        }
    }

    @Override
    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        if (request != null && request.isForMainFrame()) {
            lastErrorWasMain = true;
            activity.showOffline(request.getUrl() != null ? request.getUrl().toString() : Urls.HOME);
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
        // Pre-M fallback; on M+ the other overload is also called.
        if (Build.VERSION.SDK_INT < 23) {
            lastErrorWasMain = true;
            activity.showOffline(failingUrl);
        }
    }

    @Override
    public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
        if (request == null || !request.isForMainFrame() || errorResponse == null) return;
        int code = errorResponse.getStatusCode();
        if (code == 502 || code == 503 || code == 504) {
            lastErrorWasMain = true;
            activity.showOffline(request.getUrl() != null ? request.getUrl().toString() : Urls.HOME);
        }
    }

    @Override
    public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
        // Never bypass SSL errors.
        if (handler != null) handler.cancel();
        if (view == activity.webView()) {
            lastErrorWasMain = true;
            activity.showOffline(error != null && error.getUrl() != null ? error.getUrl() : Urls.HOME);
        }
    }

    @Override
    public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
        activity.onHistoryUrl(url);
    }
}
