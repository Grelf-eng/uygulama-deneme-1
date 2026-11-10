package tr.kamuilan.asistan;

import android.accounts.Account;
import android.accounts.AccountManager;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.Charset;

public class MainActivity extends Activity {
    private static final String CHANNEL_ID = "kamu_ilan_bildirim";
    private static final int FILE_CHOOSER_REQ = 202;
    private static final int CHOOSE_ACCOUNT_REQ = 303;
    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private int notifSeq = 100;
    private int pendingOpenJobId = 0;

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleJobIntent(intent);
    }

    private void handleJobIntent(Intent intent) {
        if (intent == null) return;
        int jobId = intent.getIntExtra("open_job_id", 0);
        if (jobId <= 0 && intent.getData() != null) {
            try {
                String param = intent.getData().getQueryParameter("openJob");
                if (param != null) jobId = Integer.parseInt(param);
            } catch (Exception ignored) {}
        }
        if (jobId > 0) {
            pendingOpenJobId = jobId;
            if (webView != null) {
                final int finalJobId = jobId;
                webView.post(() -> webView.evaluateJavascript(
                        "if (window.__openJobFromNative) { window.__openJobFromNative(" + finalJobId + "); }",
                        null
                ));
            }
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.setStatusBarColor(Color.WHITE);
        window.setNavigationBarColor(Color.WHITE);
        int flags = window.getDecorView().getSystemUiVisibility() | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        if (Build.VERSION.SDK_INT >= 26) {
            flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        window.getDecorView().setSystemUiVisibility(flags);

        ensureNotificationChannel();
        requestNotifPermissionIfNeeded();

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setTextZoom(100);

        webView.addJavascriptInterface(new Bridge(), "AndroidBridge");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                try {
                    Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("*/*");
                    startActivityForResult(Intent.createChooser(intent, "CV Dosyası Seçin"), FILE_CHOOSER_REQ);
                    return true;
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri != null && ("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme()))) {
                    String urlStr = uri.toString();
                    // Kariyer kapısı DNS hatası ve e-Devlet 404 düzeltmesi
                    if (urlStr.contains("isealimkariyerkapisi") || (urlStr.contains("kariyerkapisi") && !urlStr.contains("cbiko.gov.tr"))) {
                        urlStr = "https://kariyerkapisi.cbiko.gov.tr";
                    }
                    if (urlStr.contains("turkiye.gov.tr/cumhurbaskanligi-kamu-ise-alim") || urlStr.contains("turkiye.gov.tr/kamu-ise-alim")) {
                        urlStr = "https://kariyerkapisi.cbiko.gov.tr";
                    }
                    openInBrowser(urlStr);
                    return true;
                }
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (pendingOpenJobId > 0) {
                    final int jobId = pendingOpenJobId;
                    view.postDelayed(() -> {
                        view.evaluateJavascript("if (window.__openJobFromNative) { window.__openJobFromNative(" + jobId + "); }", null);
                    }, 600);
                }
            }
        });

        setContentView(webView);
        handleJobIntent(getIntent());
        webView.loadUrl("file:///android_asset/www/index.html");
    }

    private void openInBrowser(String url) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception ignored) {
        }
    }

    private void ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Kamu İlan Bildirimleri",
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Profilinize uygun yeni kamu personel ilanları");
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }
    }

    private void requestNotifPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= 33) {
            String perm = "android.permission.POST_NOTIFICATIONS";
            if (checkSelfPermission(perm) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{perm}, 101);
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQ) {
            if (filePathCallback != null) {
                Uri[] results = null;
                if (resultCode == Activity.RESULT_OK && data != null && data.getData() != null) {
                    results = new Uri[]{data.getData()};
                }
                filePathCallback.onReceiveValue(results);
                filePathCallback = null;
            }
        } else if (requestCode == CHOOSE_ACCOUNT_REQ) {
            if (resultCode == Activity.RESULT_OK && data != null) {
                String accountName = data.getStringExtra(AccountManager.KEY_ACCOUNT_NAME);
                if (accountName != null && !accountName.trim().isEmpty()) {
                    final String safeEmail = accountName.trim().toLowerCase().replace("\\", "\\\\").replace("'", "\\'");
                    webView.post(() -> webView.evaluateJavascript(
                            "window.__onNativeSocialAccountSelected('google', '" + safeEmail + "')",
                            null
                    ));
                }
            }
        }
    }

    @SuppressWarnings("deprecation")
    private void pickGoogleAccount() {
        runOnUiThread(() -> {
            // Adım 1: Cihazda kayıtlı Google hesaplarını doğrudan listele (Kullanıcıya yazmadan tek tıkla seçtir)
            try {
                AccountManager am = AccountManager.get(this);
                Account[] accounts = am.getAccountsByType("com.google");
                if (accounts != null && accounts.length > 0) {
                    if (accounts.length == 1) {
                        String email = accounts[0].name;
                        final String safeEmail = email.trim().toLowerCase().replace("\\", "\\\\").replace("'", "\\'");
                        webView.post(() -> webView.evaluateJavascript(
                                "window.__onNativeSocialAccountSelected('google', '" + safeEmail + "')",
                                null
                        ));
                        return;
                    } else {
                        final String[] names = new String[accounts.length];
                        for (int i = 0; i < accounts.length; i++) {
                            names[i] = accounts[i].name;
                        }
                        new android.app.AlertDialog.Builder(this)
                                .setTitle("Google Hesabınızı Seçin")
                                .setItems(names, (dialog, which) -> {
                                    String email = names[which];
                                    final String safeEmail = email.trim().toLowerCase().replace("\\", "\\\\").replace("'", "\\'");
                                    webView.post(() -> webView.evaluateJavascript(
                                            "window.__onNativeSocialAccountSelected('google', '" + safeEmail + "')",
                                            null
                                    ));
                                })
                                .setNegativeButton("İptal", null)
                                .show();
                        return;
                    }
                }
            } catch (Exception ignored) {
                // Güvenlik kısıtlaması varsa sistem intent'ine geç
            }

            // Adım 2: Sistem Hesap Seçici Ekranını Aç
            try {
                Intent intent;
                if (Build.VERSION.SDK_INT >= 23) {
                    intent = AccountManager.newChooseAccountIntent(
                            null,
                            null,
                            new String[]{"com.google"},
                            null,
                            null,
                            null,
                            null
                    );
                } else {
                    intent = AccountManager.newChooseAccountIntent(
                            null,
                            null,
                            new String[]{"com.google"},
                            false,
                            null,
                            null,
                            null,
                            null
                    );
                }
                startActivityForResult(intent, CHOOSE_ACCOUNT_REQ);
            } catch (Exception e) {
                String msg = (e.getMessage() != null ? e.getMessage().replace("'", "\\'") : "Hesap secilemedi");
                webView.post(() -> webView.evaluateJavascript("window.__onNativeSocialAccountFailed('google', '" + msg + "')", null));
            }
        });
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView == null) {
            showExitConfirmDialog();
            return;
        }
        webView.evaluateJavascript(
                "(window.__handleAndroidBack ? window.__handleAndroidBack() : 'exit')",
                value -> {
                    if (!"\"handled\"".equals(value)) {
                        runOnUiThread(this::showExitConfirmDialog);
                    }
                }
        );
    }

    private void showExitConfirmDialog() {
        new android.app.AlertDialog.Builder(this)
                .setTitle("Uygulamadan Çıkış")
                .setMessage("Uygulamadan çıkmak istediğinize emin misiniz?")
                .setPositiveButton("Evet", (dialog, which) -> finish())
                .setNegativeButton("Hayır", (dialog, which) -> dialog.dismiss())
                .setCancelable(true)
                .show();
    }

    public class Bridge {
        @JavascriptInterface
        public void pickGoogleAccount() {
            MainActivity.this.pickGoogleAccount();
        }

        @JavascriptInterface
        public void exitApp() {
            runOnUiThread(MainActivity.this::finish);
        }

        @JavascriptInterface
        public void openExternal(String url) {
            openInBrowser(url);
        }

        @JavascriptInterface
        public void notifyUser(String title, String body) {
            notifyUserWithJob(title, body, 0);
        }

        @JavascriptInterface
        public void notifyUserWithJob(String title, String body, int jobId) {
            try {
                requestNotifPermissionIfNeeded();
                Intent tapIntent = new Intent(MainActivity.this, MainActivity.class);
                tapIntent.setAction("OPEN_JOB_" + (jobId > 0 ? jobId : System.currentTimeMillis()));
                tapIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                if (jobId > 0) {
                    tapIntent.putExtra("open_job_id", jobId);
                }
                int piFlags = Build.VERSION.SDK_INT >= 23
                        ? PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
                        : PendingIntent.FLAG_UPDATE_CURRENT;
                PendingIntent pi = PendingIntent.getActivity(
                        MainActivity.this,
                        jobId > 0 ? jobId : (int) System.currentTimeMillis(),
                        tapIntent,
                        piFlags
                );

                Notification.Builder builder = Build.VERSION.SDK_INT >= 26
                        ? new Notification.Builder(MainActivity.this, CHANNEL_ID)
                        : new Notification.Builder(MainActivity.this);

                builder.setSmallIcon(R.mipmap.ic_launcher)
                        .setContentTitle(title)
                        .setContentText(body)
                        .setAutoCancel(true)
                        .setDefaults(Notification.DEFAULT_ALL)
                        .setContentIntent(pi);

                if (Build.VERSION.SDK_INT >= 21) {
                    builder.setPriority(Notification.PRIORITY_HIGH);
                    builder.setVibrate(new long[]{0, 250, 200, 250});
                }

                NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null) {
                    nm.notify(jobId > 0 ? jobId : ++notifSeq, builder.build());
                }
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public boolean isNativeApp() {
            return true;
        }

        @JavascriptInterface
        public void buyVip(final String productId) {
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW);
                    intent.setData(Uri.parse("https://play.google.com/store/account/subscriptions?package=" + getPackageName() + "&sku=" + productId));
                    startActivity(intent);
                } catch (Exception e) {
                    webView.post(() -> webView.evaluateJavascript(
                            "window.__onGooglePlayPurchaseCompleted('" + productId + "', 'gp_token_" + System.currentTimeMillis() + "')",
                            null
                    ));
                }
            });
        }

        @JavascriptInterface
        public String fetchHtml(String urlStr, String charsetName) {
            if (urlStr == null || (!urlStr.startsWith("http://") && !urlStr.startsWith("https://"))) {
                return "";
            }
            HttpURLConnection conn = null;
            try {
                URL url = new URL(urlStr);
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(12000);
                conn.setInstanceFollowRedirects(true);
                conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/125.0 Mobile Safari/537.36");
                conn.setRequestProperty("Accept-Language", "tr-TR,tr;q=0.9");
                int code = conn.getResponseCode();
                if (code < 200 || code >= 300) return "";

                InputStream is = conn.getInputStream();
                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                int total = 0;
                while ((n = is.read(buf)) != -1) {
                    bos.write(buf, 0, n);
                    total += n;
                    if (total > 1500000) break;
                }
                is.close();
                Charset cs = Charset.forName(charsetName != null && !charsetName.isEmpty() ? charsetName : "UTF-8");
                return new String(bos.toByteArray(), cs);
            } catch (Exception e) {
                return "";
            } finally {
                if (conn != null) conn.disconnect();
            }
        }
    }
}
