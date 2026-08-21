package br.com.muhbianco.muchat;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ImageView;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;

public class MainActivity extends AppCompatActivity implements ScreenCaptureService.FrameListener {
    private static final String APP_HOST = "chat.muhbianco.com.br";

    private WebView webView;
    private ImageView splash;
    private PermissionRequest pendingWebRequest;
    private ValueCallback<Uri[]> fileCallback;
    private boolean splashHidden = false;
    private int pendingShareWidth = 1280;
    private int pendingShareHeight = 720;
    private int pendingShareFps = 10;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private final ActivityResultLauncher<String[]> permissionLauncher =
            registerForActivityResult(new ActivityResultContracts.RequestMultiplePermissions(), unused -> {
                mainHandler.post(() -> {
                    if (pendingWebRequest == null) return;
                    pendingWebRequest.grant(pendingWebRequest.getResources());
                    pendingWebRequest = null;
                });
            });

    private final ActivityResultLauncher<String[]> startupPerms =
            registerForActivityResult(new ActivityResultContracts.RequestMultiplePermissions(), unused -> {});

    private final ActivityResultLauncher<Intent> fileChooser =
            registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
                if (fileCallback == null) return;
                Uri[] uris = WebChromeClient.FileChooserParams.parseResult(
                        result.getResultCode(), result.getData());
                fileCallback.onReceiveValue(uris);
                fileCallback = null;
            });

    private final ActivityResultLauncher<Intent> screenCapture =
            registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
                if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
                    emitScreenShare("error", JSONObject.quote("Compartilhamento de tela cancelado."));
                    return;
                }
                Intent service = new Intent(this, ScreenCaptureService.class);
                service.putExtra(ScreenCaptureService.EXTRA_RESULT_CODE, result.getResultCode());
                service.putExtra(ScreenCaptureService.EXTRA_DATA, result.getData());
                service.putExtra(ScreenCaptureService.EXTRA_WIDTH, pendingShareWidth);
                service.putExtra(ScreenCaptureService.EXTRA_HEIGHT, pendingShareHeight);
                service.putExtra(ScreenCaptureService.EXTRA_FPS, pendingShareFps);
                ContextCompat.startForegroundService(this, service);
            });

    public class MuchatNative {
        @JavascriptInterface
        public void hideSplash() {
            mainHandler.post(MainActivity.this::hideSplashView);
        }

        @JavascriptInterface
        public void startScreenShare(int width, int height, int frameRate) {
            mainHandler.post(() -> beginScreenShare(width, height, frameRate));
        }

        @JavascriptInterface
        public void stopScreenShare() {
            mainHandler.post(MainActivity.this::stopScreenShare);
        }
    }

    private void hideSplashView() {
        if (splashHidden) return;
        splashHidden = true;
        if (webView != null) webView.setVisibility(View.VISIBLE);
        if (splash != null) splash.setVisibility(View.GONE);
    }

    private void emitScreenShare(String event, String payloadJson) {
        if (webView == null) return;
        String js = "window.__muchatScreenShare&&window.__muchatScreenShare("
                + JSONObject.quote(event)
                + ","
                + (payloadJson == null ? "null" : payloadJson)
                + ")";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    private void beginScreenShare(int width, int height, int frameRate) {
        pendingShareWidth = Math.max(320, Math.min(1920, width));
        pendingShareHeight = Math.max(180, Math.min(1080, height));
        pendingShareFps = Math.max(5, Math.min(15, frameRate));
        stopScreenShare();
        MediaProjectionManager manager =
                (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
        if (manager == null) {
            emitScreenShare("error", JSONObject.quote("Sem MediaProjection neste aparelho."));
            return;
        }
        try {
            screenCapture.launch(manager.createScreenCaptureIntent());
        } catch (RuntimeException e) {
            emitScreenShare("error", JSONObject.quote("Não abriu o seletor de tela."));
        }
    }

    private void stopScreenShare() {
        stopService(new Intent(this, ScreenCaptureService.class));
    }

    @Override
    public void onCaptureReady() {
        emitScreenShare("ready", null);
    }

    @Override
    public void onCaptureEnded() {
        emitScreenShare("ended", null);
    }

    @Override
    public void onCaptureError(String message) {
        emitScreenShare("error", JSONObject.quote(message == null ? "" : message));
    }

    @Override
    public void onFrame(byte[] jpeg) {
        if (jpeg == null || jpeg.length == 0) return;
        String b64 = Base64.encodeToString(jpeg, Base64.NO_WRAP);
        emitScreenShare("frame", JSONObject.quote(b64));
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        webView = findViewById(R.id.web);
        splash = findViewById(R.id.splash);
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        ScreenCaptureService.setListener(this);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        String versionName = "1.0.8";
        try {
            versionName = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (PackageManager.NameNotFoundException ignored) {
            /* keep fallback */
        }
        settings.setUserAgentString(settings.getUserAgentString() + " Muchat/" + versionName);
        webView.addJavascriptInterface(new MuchatNative(), "MuchatNative");

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        List<String> startup = new ArrayList<>();
        startup.add(Manifest.permission.CAMERA);
        startup.add(Manifest.permission.RECORD_AUDIO);
        if (Build.VERSION.SDK_INT >= 33) {
            startup.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        startupPerms.launch(startup.toArray(new String[0]));

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost() == null ? "" : uri.getHost();
                if (host.equals(APP_HOST) || host.endsWith(".muhbianco.com.br")) {
                    return false;
                }
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                mainHandler.postDelayed(MainActivity.this::hideSplashView, 12000);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                mainHandler.post(() -> handlePermissionRequest(request));
            }

            @Override
            public boolean onShowFileChooser(
                    WebView view,
                    ValueCallback<Uri[]> callback,
                    FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                fileChooser.launch(params.createIntent());
                return true;
            }
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack();
                    return;
                }
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
            }
        });

        if (savedInstanceState == null) {
            webView.setVisibility(View.INVISIBLE);
            webView.loadUrl(getString(R.string.app_url));
        } else {
            hideSplashView();
            webView.restoreState(savedInstanceState);
        }
    }

    private void handlePermissionRequest(PermissionRequest request) {
        String origin = request.getOrigin() == null ? "" : request.getOrigin().toString();
        if (!origin.startsWith("https://" + APP_HOST)) {
            request.deny();
            return;
        }
        List<String> needed = new ArrayList<>();
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)
                    && ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                            != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.CAMERA);
            }
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)
                    && ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                            != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.RECORD_AUDIO);
            }
        }
        if (needed.isEmpty()) {
            request.grant(request.getResources());
            return;
        }
        pendingWebRequest = request;
        permissionLauncher.launch(needed.toArray(new String[0]));
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        ScreenCaptureService.setListener(null);
        stopScreenShare();
        super.onDestroy();
    }
}
