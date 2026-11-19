package it.rabel.gestione;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.IOException;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final int PICK = 101;
    private static final String HOST = "appassets.androidplatform.net";
    private ValueCallback<Uri[]> uploadCallback;
    private Uri cameraUri;
    private WebView web;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        setContentView(web);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true); // needed for the Android photo picker
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                return !"https".equals(uri.getScheme()) || !HOST.equals(uri.getHost());
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!"https".equals(uri.getScheme()) || !HOST.equals(uri.getHost())) return null;
                String path = uri.getPath();
                if (path == null || !path.startsWith("/assets/") || path.contains("..")) return blocked();
                String name = path.substring("/assets/".length());
                if (!(name.equals("index.html") || name.equals("domain.js") || name.equals("client.js") || name.equals("ui.js"))) return blocked();
                String type = name.endsWith(".html") ? "text/html" : "application/javascript";
                try { return new WebResourceResponse(type, "UTF-8", getAssets().open(name)); }
                catch (IOException e) { return blocked(); }
            }
            private WebResourceResponse blocked() { return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null, null); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (uploadCallback != null) uploadCallback.onReceiveValue(null);
                uploadCallback = callback;
                cameraUri = null;
                try {
                    if (params.isCaptureEnabled()) {
                        ContentValues values = new ContentValues();
                        values.put(MediaStore.Images.Media.DISPLAY_NAME, "rabel-" + System.currentTimeMillis() + ".jpg");
                        values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                        cameraUri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                        if (cameraUri == null) throw new IOException("Camera destination unavailable");
                        Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                        intent.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                        intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivityForResult(intent, PICK);
                    } else {
                        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                        intent.addCategory(Intent.CATEGORY_OPENABLE);
                        intent.setType("image/*");
                        startActivityForResult(intent, PICK);
                    }
                    return true;
                } catch (Exception e) {
                    if (cameraUri != null) getContentResolver().delete(cameraUri, null, null);
                    cameraUri = null; uploadCallback.onReceiveValue(null); uploadCallback = null;
                    return true;
                }
            }
        });
        web.loadUrl("https://" + HOST + "/assets/index.html");
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != PICK || uploadCallback == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK) {
            if (cameraUri != null) result = new Uri[]{cameraUri};
            else if (data != null && data.getData() != null) result = new Uri[]{data.getData()};
        } else if (cameraUri != null) getContentResolver().delete(cameraUri, null, null);
        cameraUri = null; uploadCallback.onReceiveValue(result); uploadCallback = null;
    }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
    @Override protected void onDestroy() { if (uploadCallback != null) uploadCallback.onReceiveValue(null); web.destroy(); super.onDestroy(); }
}
