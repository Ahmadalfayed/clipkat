/* جميع الحقوق محفوظة © 2026 وطن النهار */
package live.clipkat.app;

import android.net.Uri;

import java.util.Locale;

/** URL policy for the ClipKat WebView wrapper. */
final class Urls {
    static final String HOME = "https://clipkat.live/";
    static final String LOGIN = "https://clipkat.live/#/login";
    static final String OFFLINE = "file:///android_asset/offline.html";

    private Urls() {}

    static String hostOf(String url) {
        if (url == null || url.isEmpty()) return "";
        Uri uri = Uri.parse(url);
        String host = uri.getHost();
        return host == null ? "" : host.toLowerCase(Locale.ROOT);
    }

    static boolean isAppHost(String url) {
        String host = hostOf(url);
        return "clipkat.live".equals(host)
                || "www.clipkat.live".equals(host)
                || "live.clipkat.live".equals(host);
    }

    static boolean isGoogleAuthHost(String url) {
        String host = hostOf(url);
        if (host.isEmpty()) return false;
        if ("accounts.google.com".equals(host)
                || "accounts.youtube.com".equals(host)
                || "account.google.com".equals(host)
                || "oauthaccountmanager.googleapis.com".equals(host)) {
            return true;
        }
        // GIS / OAuth helpers that may appear as top-level popup navigations
        return host.endsWith(".google.com") && (host.startsWith("accounts.")
                || host.startsWith("signin.")
                || host.contains("oauth"));
    }

    static boolean isOfflineUrl(String url) {
        return url != null && url.startsWith("file:///android_asset/offline.html");
    }

    static boolean shouldStayInWebView(String url) {
        if (url == null) return false;
        String lower = url.toLowerCase(Locale.ROOT);
        if (lower.startsWith("about:") || isOfflineUrl(url)) return true;
        if (lower.startsWith("blob:") || lower.startsWith("data:")) return true;
        if (isAppHost(url) || isGoogleAuthHost(url)) return true;
        return false;
    }

    static boolean isExternalScheme(String url) {
        if (url == null) return false;
        String lower = url.toLowerCase(Locale.ROOT);
        return lower.startsWith("mailto:")
                || lower.startsWith("tel:")
                || lower.startsWith("sms:")
                || lower.startsWith("whatsapp:")
                || lower.startsWith("intent:")
                || lower.startsWith("market:")
                || lower.startsWith("geo:");
    }

    /** Hash route of a clipkat.live URL, e.g. "feed", "login", "live". */
    static String hashRoute(String url) {
        if (url == null) return "";
        int hash = url.indexOf('#');
        if (hash < 0) return "";
        String frag = url.substring(hash + 1);
        if (frag.startsWith("/")) frag = frag.substring(1);
        int cut = frag.length();
        for (int i = 0; i < frag.length(); i++) {
            char c = frag.charAt(i);
            if (c == '/' || c == '?' || c == '&') {
                cut = i;
                break;
            }
        }
        return frag.substring(0, cut).toLowerCase(Locale.ROOT);
    }

    static boolean isImmersiveRoute(String url) {
        String r = hashRoute(url);
        return "feed".equals(r) || "following".equals(r) || "watch".equals(r)
                || "golive".equals(r) || "live".equals(r) || r.isEmpty();
    }
}
