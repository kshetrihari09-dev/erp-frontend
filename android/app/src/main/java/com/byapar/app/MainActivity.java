package com.byapar.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.PermissionRequest;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {

    // Holds the WebView's own pending getUserMedia() permission request
    // while we go ask the OS for the runtime CAMERA permission.
    private PermissionRequest pendingWebViewPermissionRequest;

    private final ActivityResultLauncher<String> cameraPermissionLauncher =
        registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
            if (pendingWebViewPermissionRequest == null) return;
            if (granted) {
                pendingWebViewPermissionRequest.grant(pendingWebViewPermissionRequest.getResources());
            } else {
                pendingWebViewPermissionRequest.deny();
            }
            pendingWebViewPermissionRequest = null;
        });

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // IMPORTANT: this must run AFTER super.onCreate(), because that's
        // what initializes this.bridge and its WebView. Replacing the
        // default BridgeWebChromeClient with this subclass is what
        // actually fixes the camera prompt — the manifest entry alone
        // does nothing for a WebView-level getUserMedia() call.
        this.bridge.getWebView().setWebChromeClient(new BridgeWebChromeClient(this.bridge) {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                boolean wantsVideo = false;
                for (String resource : request.getResources()) {
                    if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) {
                        wantsVideo = true;
                    }
                }

                // Anything that isn't a camera request (e.g. protected
                // media ID) falls back to Capacitor's normal handling.
                if (!wantsVideo) {
                    super.onPermissionRequest(request);
                    return;
                }

                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA)
                        == PackageManager.PERMISSION_GRANTED) {
                    request.grant(request.getResources());
                } else {
                    pendingWebViewPermissionRequest = request;
                    cameraPermissionLauncher.launch(Manifest.permission.CAMERA);
                }
            }
        });
    }
}
