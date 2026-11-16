/* جميع الحقوق محفوظة © 2026 وطن النهار */
package live.clipkat.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.browser.customtabs.CustomTabColorSchemeParams;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.splashscreen.SplashScreen;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {
    private WebView webView;
    private SwipeRefreshLayout swipe;
    private FrameLayout customViewContainer;
    private AppChromeClient chrome;
    private boolean showingOffline;
    @Nullable private String lastFailedUrl;
    private boolean googleBlockDialogShown;
    ActivityResultLauncher<Intent> fileChooserLauncher;
    private ActivityResultLauncher<String[]> permissionLauncher;
    private ActivityResultLauncher<String> notificationLauncher;
    @Nullable private PermissionRequest pendingWebPermission;
    @Nullable private ConnectivityManager.NetworkCallback networkCallback;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(ContextCompat.getColor(this, R.color.ckBackground));
        getWindow().setNavigationBarColor(ContextCompat.getColor(this, R.color.ckBackground));
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.web);
        swipe = findViewById(R.id.swipe);
        customViewContainer = findViewById(R.id.customViewContainer);
        View root = findViewById(R.id.root);
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return insets;
        });

        fileChooserLauncher = registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(),
                result -> {
                    if (chrome != null) {
                        chrome.onFileChooserResult(result.getResultCode(), result.getData());
                    }
                });
        permissionLauncher = registerForActivityResult(
                new ActivityResultContracts.RequestMultiplePermissions(),
                granted -> {
                    boolean all = true;
                    for (Boolean ok : granted.values()) {
                        if (ok == null || !ok) { all = false; break; }
                    }
                    finishWebPermission(all);
                });
        // Separate launcher so a download-notification prompt cannot settle a pending getUserMedia request.
        notificationLauncher = registerForActivityResult(
                new ActivityResultContracts.RequestPermission(),
                granted -> { /* DownloadManager still enqueues without it. */ });

        chrome = new AppChromeClient(this);
        configureWebView(webView);
        webView.setWebViewClient(new AppWebViewClient(this));
        webView.setWebChromeClient(chrome);
        webView.setDownloadListener(this::onDownload);

        swipe.setColorSchemeColors(ContextCompat.getColor(this, R.color.ckPrimary));
        swipe.setProgressBackgroundColorSchemeColor(ContextCompat.getColor(this, R.color.ckBackground));
        swipe.setOnChildScrollUpCallback((parent, child) -> !canSwipeRefresh());
        swipe.setOnRefreshListener(this::reloadCurrent);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (chrome != null && chrome.onBackPressed()) return;
                if (showingOffline) {
                    reloadCurrent();
                    return;
                }
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                    return;
                }
                moveTaskToBack(true);
            }
        });

        registerNetworkCallback();
        handleIntent(getIntent(), true);

        if (BuildConfig.DEBUG && getIntent().getBooleanExtra("probeMediaPermission", false)) {
            webView.postDelayed(() -> {
                PermissionRequest probe = new PermissionRequest() {
                    @NonNull @Override public Uri getOrigin() { return Uri.parse(Urls.HOME); }
                    @Override public String[] getResources() {
                        return new String[]{RESOURCE_VIDEO_CAPTURE, RESOURCE_AUDIO_CAPTURE};
                    }
                    @Override public void grant(String[] resources) { /* no-op: debug probe of the Android prompt only */ }
                    @Override public void deny() {}
                };
                handleWebPermission(probe);
            }, 1500);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent, false);
    }

    private void handleIntent(Intent intent, boolean first) {
        String url = Urls.HOME;
        if (intent != null && intent.getData() != null) {
            String d = intent.getData().toString();
            if (Urls.isAppHost(d)) url = d;
        }
        if (webView != null) webView.loadUrl(url);
    }

    @SuppressLint("SetJavaScriptEnabled")
    void configureWebView(WebView view) {
        WebSettings s = view.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setSupportMultipleWindows(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        if (Build.VERSION.SDK_INT >= 21) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }
        if (Build.VERSION.SDK_INT >= 26) {
            s.setSafeBrowsingEnabled(true);
        }
        // Avoid Google's "disallowed_useragent" dead end on GIS / OAuth pages.
        // Email/password login does not depend on this. See README-native.
        String ua = s.getUserAgentString();
        if (ua != null) {
            s.setUserAgentString(ua.replace("; wv", "").replace(" Version/4.0", ""));
        }
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= 21) {
            cookies.setAcceptThirdPartyCookies(view, true);
        }
        view.setOverScrollMode(View.OVER_SCROLL_NEVER);
        if (Build.VERSION.SDK_INT >= 33) {
            view.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_YES);
        }
    }

    WebView webView() { return webView; }

    void setShowingOffline(boolean value) { showingOffline = value; }

    void showOffline(@Nullable String failedUrl) {
        if (failedUrl != null && !Urls.isOfflineUrl(failedUrl)) lastFailedUrl = failedUrl;
        showingOffline = true;
        if (swipe != null) swipe.setRefreshing(false);
        if (webView != null && (webView.getUrl() == null || !Urls.isOfflineUrl(webView.getUrl()))) {
            webView.loadUrl(Urls.OFFLINE);
        }
    }

    void onPageFinished(String url, boolean hadError) {
        if (swipe != null) swipe.setRefreshing(false);
        if (!hadError && url != null && !Urls.isOfflineUrl(url)) {
            showingOffline = false;
        }
    }

    void onHistoryUrl(String url) {
        // Used so swipe-to-refresh can read the latest hash route.
    }

    private boolean canSwipeRefresh() {
        if (showingOffline) return true;
        if (webView == null) return false;
        if (webView.getScrollY() > 0) return false;
        String url = webView.getUrl();
        // Don't fight the vertical video feed or a live session.
        return url != null && !Urls.isImmersiveRoute(url);
    }

    void reloadCurrent() {
        if (webView == null) return;
        if (showingOffline || Urls.isOfflineUrl(webView.getUrl())) {
            String target = lastFailedUrl != null ? lastFailedUrl : Urls.HOME;
            showingOffline = false;
            webView.loadUrl(target);
            return;
        }
        webView.reload();
    }

    /**
     * @return true if the WebView should NOT load the URL itself (we consumed it).
     */
    boolean handleUrl(String url, boolean fromUser) {
        if (url == null || url.isEmpty()) return false;
        if (Urls.shouldStayInWebView(url)) {
            return false;
        }
        if (Urls.isExternalScheme(url) || url.toLowerCase(java.util.Locale.ROOT).startsWith("intent:")) {
            openExternal(url);
            return true;
        }
        // Any other top-level http(s) host: WhatsApp, payment links, stores, etc.
        if (url.startsWith("http://") || url.startsWith("https://")) {
            openCustomTab(url);
            return true;
        }
        openExternal(url);
        return true;
    }

    private void openCustomTab(String url) {
        try {
            int bg = ContextCompat.getColor(this, R.color.ckBackground);
            CustomTabColorSchemeParams colors = new CustomTabColorSchemeParams.Builder()
                    .setToolbarColor(bg)
                    .setNavigationBarColor(bg)
                    .setSecondaryToolbarColor(bg)
                    .build();
            CustomTabsIntent tabs = new CustomTabsIntent.Builder()
                    .setDefaultColorSchemeParams(colors)
                    .setColorScheme(CustomTabsIntent.COLOR_SCHEME_DARK)
                    .setShareState(CustomTabsIntent.SHARE_STATE_ON)
                    .setShowTitle(true)
                    .build();
            tabs.launchUrl(this, Uri.parse(url));
        } catch (Exception e) {
            openExternal(url);
        }
    }

    private void openExternal(String url) {
        try {
            Intent intent;
            if (url.startsWith("intent:")) {
                intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                if (intent.resolveActivity(getPackageManager()) == null) {
                    String fallback = intent.getStringExtra("browser_fallback_url");
                    if (fallback != null) {
                        openCustomTab(fallback);
                        return;
                    }
                    Toast.makeText(this, R.string.download_failed, Toast.LENGTH_SHORT).show();
                    return;
                }
            } else {
                intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, R.string.download_failed, Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(this, R.string.download_failed, Toast.LENGTH_SHORT).show();
        }
    }

    void handleWebPermission(PermissionRequest request) {
        if (request == null) return;
        pendingWebPermission = request;
        if (chrome != null) chrome.pendingWebPermission = request;
        String[] resources = request.getResources();
        List<String> needed = new ArrayList<>();
        boolean wantCamera = false, wantMic = false;
        if (resources != null) {
            for (String r : resources) {
                if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) wantCamera = true;
                if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) wantMic = true;
            }
        }
        if (wantCamera && ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.CAMERA);
        }
        if (wantMic && ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.RECORD_AUDIO);
        }
        if (needed.isEmpty()) {
            finishWebPermission(true);
        } else {
            permissionLauncher.launch(needed.toArray(new String[0]));
        }
    }

    private void finishWebPermission(boolean granted) {
        PermissionRequest req = pendingWebPermission;
        pendingWebPermission = null;
        if (chrome != null) chrome.pendingWebPermission = req;
        if (req == null) return;
        try {
            if (granted) {
                req.grant(req.getResources());
            } else {
                req.deny();
            }
        } catch (Exception ignored) {
        }
        if (chrome != null) chrome.pendingWebPermission = null;
    }

    void onGoogleSignInBlocked() {
        if (googleBlockDialogShown || isFinishing()) return;
        googleBlockDialogShown = true;
        if (chrome != null) chrome.closePopup();
        new AlertDialog.Builder(this)
                .setTitle(R.string.google_blocked_title)
                .setMessage(R.string.google_blocked_message)
                .setPositiveButton(R.string.google_blocked_password, (d, w) -> {
                    if (webView != null) webView.loadUrl(Urls.LOGIN);
                })
                .setNeutralButton(R.string.google_blocked_browser, (d, w) -> openCustomTab(Urls.LOGIN))
                .setOnDismissListener(d -> {})
                .show();
    }

    private void onDownload(String url, String userAgent, String contentDisposition, String mimeType, long contentLength) {
        if (url == null) return;
        if (url.startsWith("blob:") || url.startsWith("data:")) {
            Toast.makeText(this, R.string.download_failed, Toast.LENGTH_SHORT).show();
            return;
        }
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            notificationLauncher.launch(Manifest.permission.POST_NOTIFICATIONS);
            // Continue anyway — the file can still be enqueued.
        }
        try {
            String name = URLUtil.guessFileName(url, contentDisposition, mimeType);
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            req.setMimeType(mimeType);
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null) req.addRequestHeader("Cookie", cookies);
            if (userAgent != null) req.addRequestHeader("User-Agent", userAgent);
            req.addRequestHeader("Referer", Urls.HOME);
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setTitle(name);
            req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            req.setAllowedOverMetered(true);
            req.setAllowedOverRoaming(true);
            DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            if (dm != null) {
                dm.enqueue(req);
                Toast.makeText(this, R.string.download_started, Toast.LENGTH_SHORT).show();
            }
        } catch (Exception e) {
            // Fall back to the system browser if the DownloadManager refuses the URL.
            openCustomTab(url);
        }
    }

    void showCustomView(View view) {
        if (customViewContainer == null) return;
        customViewContainer.removeAllViews();
        customViewContainer.addView(view, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        customViewContainer.setVisibility(View.VISIBLE);
        swipe.setVisibility(View.GONE);
    }

    void hideCustomView() {
        if (customViewContainer == null) return;
        customViewContainer.removeAllViews();
        customViewContainer.setVisibility(View.GONE);
        swipe.setVisibility(View.VISIBLE);
    }

    private void registerNetworkCallback() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (cm == null) return;
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(@NonNull Network network) {
                runOnUiThread(() -> {
                    if (showingOffline) reloadCurrent();
                });
            }
        };
        try {
            if (Build.VERSION.SDK_INT >= 24) {
                cm.registerDefaultNetworkCallback(networkCallback);
            } else {
                cm.registerNetworkCallback(new NetworkRequest.Builder()
                        .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                        .build(), networkCallback);
            }
        } catch (Exception ignored) {
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        // Do not call webView.onPause() — that would freeze LiveKit streams and calls.
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onDestroy() {
        if (networkCallback != null) {
            try {
                ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
                if (cm != null) cm.unregisterNetworkCallback(networkCallback);
            } catch (Exception ignored) {}
            networkCallback = null;
        }
        if (webView != null) {
            webView.setDownloadListener(null);
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.loadUrl("about:blank");
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    @Override
    public void onConfigurationChanged(@NonNull Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
    }
}
