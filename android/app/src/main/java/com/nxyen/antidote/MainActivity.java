package com.nxyen.antidote;

import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Request runtime RECORD_AUDIO permission on startup if not already granted
        if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{
                android.Manifest.permission.RECORD_AUDIO,
                android.Manifest.permission.MODIFY_AUDIO_SETTINGS
            }, 101);
        }

        // Auto-grant HTML5 getUserMedia() microphone permissions inside Capacitor WebView
        WebView webView = this.getBridge().getWebView();
        if (webView != null) {
            webView.setWebChromeClient(new WebChromeClient() {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    runOnUiThread(() -> {
                        try {
                            request.grant(request.getResources());
                        } catch (Exception e) {
                            e.printStackTrace();
                        }
                    });
                }
            });
        }
    }
}
