/* جميع الحقوق محفوظة © 2026 وطن النهار */
package live.clipkat.app;

import android.app.Dialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Message;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ConsoleMessage;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.widget.FrameLayout;

import androidx.activity.result.ActivityResultLauncher;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatDialog;
import androidx.core.content.FileProvider;

import java.io.File;

/**
 * getUserMedia grants (after the runtime permission prompt), file chooser with
 * camera capture, HTML fullscreen, and GIS/window.open popups.
 */
final class AppChromeClient extends WebChromeClient {
    private final MainActivity activity;
    private ValueCallback<Uri[]> filePathCallback;
    @Nullable Uri captureUri;
    @Nullable PermissionRequest pendingWebPermission;
    @Nullable Dialog popupDialog;
    @Nullable WebView popupWebView;
    @Nullable View customView;
    @Nullable CustomViewCallback customViewCallback;

    AppChromeClient(MainActivity activity) {
        this.activity = activity;
    }

    @Override
    public void onPermissionRequest(final PermissionRequest request) {
        if (request == null) return;
        activity.runOnUiThread(() -> activity.handleWebPermission(request));
    }

    @Override
    public void onPermissionRequestCanceled(PermissionRequest request) {
        if (pendingWebPermission == request) pendingWebPermission = null;
    }

    @Override
    public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback,
                                     FileChooserParams params) {
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(null);
        }
        filePathCallback = callback;
        captureUri = null;

        Intent open = null;
        if (params != null) {
            open = params.createIntent();
        }
        if (open == null) {
            open = new Intent(Intent.ACTION_GET_CONTENT);
            open.addCategory(Intent.CATEGORY_OPENABLE);
            open.setType("*/*");
            open.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params != null && params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
        }

        boolean wantImage = acceptMatches(params, "image/");
        boolean wantVideo = acceptMatches(params, "video/");
        boolean wantAny = !wantImage && !wantVideo;
        boolean capture = params != null && params.isCaptureEnabled();

        Intent chooser = Intent.createChooser(open, activity.getString(R.string.file_chooser_title));
        Intent[] extras = buildCaptureIntents(wantImage || wantAny, wantVideo || wantAny, capture);
        if (extras.length > 0) {
            if (capture && extras.length == 1) {
                // Prefer the camera when the input asked for capture.
                try {
                    activity.fileChooserLauncher.launch(extras[0]);
                    return true;
                } catch (ActivityNotFoundException e) {
                    // Fall through to the chooser.
                }
            }
            chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, extras);
        }
        try {
            activity.fileChooserLauncher.launch(chooser);
        } catch (ActivityNotFoundException e) {
            filePathCallback.onReceiveValue(null);
            filePathCallback = null;
            return false;
        }
        return true;
    }

    void onFileChooserResult(int resultCode, @Nullable Intent data) {
        Uri[] result = null;
        if (resultCode == android.app.Activity.RESULT_OK) {
            if (data != null && data.getData() != null) {
                result = new Uri[]{data.getData()};
            } else if (data != null && data.getClipData() != null) {
                int n = data.getClipData().getItemCount();
                result = new Uri[n];
                for (int i = 0; i < n; i++) {
                    result[i] = data.getClipData().getItemAt(i).getUri();
                }
            } else if (captureUri != null) {
                result = new Uri[]{captureUri};
            }
        }
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(result);
            filePathCallback = null;
        }
        captureUri = null;
    }

    private Intent[] buildCaptureIntents(boolean image, boolean video, boolean capturePreferred) {
        java.util.ArrayList<Intent> list = new java.util.ArrayList<>();
        if (image) {
            Intent photo = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
            Uri uri = createCaptureUri("capture", ".jpg", "image/jpeg");
            if (uri != null) {
                photo.putExtra(android.provider.MediaStore.EXTRA_OUTPUT, uri);
                photo.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                if (capturePreferred && !video) captureUri = uri;
                else if (captureUri == null) captureUri = uri;
                list.add(photo);
            }
        }
        if (video) {
            Intent rec = new Intent(android.provider.MediaStore.ACTION_VIDEO_CAPTURE);
            Uri uri = createCaptureUri("capture", ".mp4", "video/mp4");
            if (uri != null) {
                rec.putExtra(android.provider.MediaStore.EXTRA_OUTPUT, uri);
                rec.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                if (capturePreferred) captureUri = uri;
                list.add(rec);
            }
        }
        return list.toArray(new Intent[0]);
    }

    @Nullable
    private Uri createCaptureUri(String prefix, String ext, String mime) {
        try {
            File dir = new File(activity.getCacheDir(), "captures");
            if (!dir.exists() && !dir.mkdirs()) return null;
            File file = File.createTempFile(prefix, ext, dir);
            String authority = activity.getPackageName() + ".fileprovider";
            return FileProvider.getUriForFile(activity, authority, file);
        } catch (Exception e) {
            return null;
        }
    }

    private static boolean acceptMatches(@Nullable FileChooserParams params, String prefix) {
        if (params == null || params.getAcceptTypes() == null) return false;
        for (String t : params.getAcceptTypes()) {
            if (t == null || t.isEmpty()) continue;
            String s = t.toLowerCase(java.util.Locale.ROOT);
            if ("*/*".equals(s) || s.startsWith(prefix) || s.equals(prefix.substring(0, prefix.length() - 1))) {
                return true;
            }
        }
        return false;
    }

    @Override
    public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
        if (resultMsg == null || resultMsg.obj == null) return false;
        closePopup();
        WebView child = new WebView(activity);
        activity.configureWebView(child);
        child.setWebViewClient(new AppWebViewClient(activity));
        child.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onCloseWindow(WebView window) {
                closePopup();
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                activity.handleWebPermission(request);
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams params) {
                return AppChromeClient.this.onShowFileChooser(webView, callback, params);
            }
        });

        FrameLayout wrap = new FrameLayout(activity);
        wrap.setBackgroundColor(0xFF0B1020);
        wrap.addView(child, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        AppCompatDialog dialog = new AppCompatDialog(activity, R.style.AppTheme);
        dialog.setContentView(wrap);
        dialog.setOnDismissListener(d -> {
            try { child.destroy(); } catch (Exception ignored) {}
            if (popupWebView == child) {
                popupWebView = null;
                popupDialog = null;
            }
        });
        if (dialog.getWindow() != null) {
            dialog.getWindow().setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
            dialog.getWindow().setBackgroundDrawableResource(R.color.ckBackground);
        }
        popupDialog = dialog;
        popupWebView = child;
        dialog.show();

        WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
        transport.setWebView(child);
        resultMsg.sendToTarget();
        return true;
    }

    @Override
    public void onCloseWindow(WebView window) {
        closePopup();
    }

    boolean onBackPressed() {
        if (customView != null) {
            onHideCustomView();
            return true;
        }
        if (popupWebView != null && popupWebView.canGoBack()) {
            popupWebView.goBack();
            return true;
        }
        if (popupDialog != null && popupDialog.isShowing()) {
            closePopup();
            return true;
        }
        return false;
    }

    void closePopup() {
        Dialog d = popupDialog;
        popupDialog = null;
        popupWebView = null;
        if (d != null && d.isShowing()) {
            d.dismiss();
        }
    }

    @Override
    public void onShowCustomView(View view, CustomViewCallback callback) {
        if (customView != null) {
            if (callback != null) callback.onCustomViewHidden();
            return;
        }
        customView = view;
        customViewCallback = callback;
        activity.showCustomView(view);
    }

    @Override
    public void onHideCustomView() {
        activity.hideCustomView();
        if (customViewCallback != null) {
            customViewCallback.onCustomViewHidden();
        }
        customView = null;
        customViewCallback = null;
    }

    @Override
    public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
        return true;
    }
}
