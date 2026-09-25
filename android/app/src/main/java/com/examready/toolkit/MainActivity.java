package com.examready.toolkit;

import android.Manifest;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.BridgeActivity;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.file.Files;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "ExamReadyNative";
    private static final int PERMISSION_REQ_CAMERA = 1001;
    private static final int REQ_CAMERA_CAPTURE = 1002;

    private File pendingCameraFile;
    private Uri pendingCameraUri;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        try {
            WebView webView = this.getBridge().getWebView();
            webView.addJavascriptInterface(new NativeAppBridge(), "AndroidBridge");
            Log.d(TAG, "NativeAppBridge successfully registered into WebView");
        } catch (Exception e) {
            Log.e(TAG, "Error adding JavascriptInterface", e);
        }
    }

    public void launchNativeCamera() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.CAMERA}, PERMISSION_REQ_CAMERA);
            return;
        }

        try {
            File cacheDir = new File(getCacheDir(), "camera");
            if (!cacheDir.exists()) {
                cacheDir.mkdirs();
            }
            pendingCameraFile = new File(cacheDir, "camera_" + System.currentTimeMillis() + ".jpg");
            pendingCameraUri = FileProvider.getUriForFile(
                this,
                getPackageName() + ".fileprovider",
                pendingCameraFile
            );

            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, pendingCameraUri);
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivityForResult(intent, REQ_CAMERA_CAPTURE);
        } catch (Exception e) {
            Log.e(TAG, "Failed to launch native camera", e);
            runOnUiThread(() -> Toast.makeText(MainActivity.this, "Could not launch camera: " + e.getMessage(), Toast.LENGTH_SHORT).show());
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == REQ_CAMERA_CAPTURE && resultCode == RESULT_OK) {
            if (pendingCameraFile != null && pendingCameraFile.exists() && pendingCameraFile.length() > 0) {
                try {
                    byte[] bytes;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        bytes = Files.readAllBytes(pendingCameraFile.toPath());
                    } else {
                        ByteArrayOutputStream baos = new ByteArrayOutputStream();
                        try (FileInputStream fis = new FileInputStream(pendingCameraFile)) {
                            byte[] buffer = new byte[8192];
                            int read;
                            while ((read = fis.read(buffer)) != -1) {
                                baos.write(buffer, 0, read);
                            }
                        }
                        bytes = baos.toByteArray();
                    }

                    String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
                    String dataUrl = "data:image/jpeg;base64," + base64;

                    String escapedUrl = dataUrl.replace("'", "\\'");
                    String js = "if (window.__handleNativePhoto) { window.__handleNativePhoto('" + escapedUrl + "'); }";
                    getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(js, null));
                } catch (Exception e) {
                    Log.e(TAG, "Error reading captured photo file", e);
                    runOnUiThread(() -> Toast.makeText(MainActivity.this, "Failed to load captured photo", Toast.LENGTH_SHORT).show());
                } finally {
                    try {
                        if (pendingCameraFile != null && pendingCameraFile.exists()) {
                            pendingCameraFile.delete();
                        }
                    } catch (Exception ignored) {}
                }
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQ_CAMERA) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                launchNativeCamera();
            } else {
                Toast.makeText(this, "Camera permission is required to capture photos.", Toast.LENGTH_LONG).show();
            }
        }
    }

    public class NativeAppBridge {

        @JavascriptInterface
        public void openCamera() {
            runOnUiThread(MainActivity.this::launchNativeCamera);
        }

        @JavascriptInterface
        public void saveFile(String base64Data, String filename, String mimeType) {
            try {
                if (base64Data == null || base64Data.isEmpty()) return;
                if (base64Data.contains(",")) {
                    base64Data = base64Data.substring(base64Data.indexOf(",") + 1);
                }
                byte[] fileBytes = Base64.decode(base64Data, Base64.DEFAULT);

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
                    values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);

                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (uri != null) {
                        try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                            if (os != null) {
                                os.write(fileBytes);
                                os.flush();
                            }
                        }
                    }
                } else {
                    File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                    if (!downloadsDir.exists()) {
                        downloadsDir.mkdirs();
                    }
                    File dest = new File(downloadsDir, filename);
                    try (FileOutputStream fos = new FileOutputStream(dest)) {
                        fos.write(fileBytes);
                        fos.flush();
                    }
                }

                runOnUiThread(() -> Toast.makeText(MainActivity.this, "Saved to Downloads: " + filename, Toast.LENGTH_LONG).show());
            } catch (Exception e) {
                Log.e(TAG, "Error saving file in NativeBridge", e);
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "Save error: " + e.getMessage(), Toast.LENGTH_SHORT).show());
            }
        }

        @JavascriptInterface
        public void shareFile(String base64Data, String filename, String mimeType) {
            try {
                if (base64Data == null || base64Data.isEmpty()) return;
                if (base64Data.contains(",")) {
                    base64Data = base64Data.substring(base64Data.indexOf(",") + 1);
                }
                byte[] fileBytes = Base64.decode(base64Data, Base64.DEFAULT);

                File cacheDir = new File(getCacheDir(), "shared");
                if (!cacheDir.exists()) {
                    cacheDir.mkdirs();
                }
                File dest = new File(cacheDir, filename);
                try (FileOutputStream fos = new FileOutputStream(dest)) {
                    fos.write(fileBytes);
                    fos.flush();
                }

                Uri contentUri = FileProvider.getUriForFile(
                    MainActivity.this,
                    getPackageName() + ".fileprovider",
                    dest
                );

                Intent shareIntent = new Intent(Intent.ACTION_SEND);
                shareIntent.setType(mimeType);
                shareIntent.putExtra(Intent.EXTRA_STREAM, contentUri);
                shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

                Intent chooser = Intent.createChooser(shareIntent, "Share file via");
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(chooser);
            } catch (Exception e) {
                Log.e(TAG, "Error sharing file in NativeBridge", e);
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "Share error: " + e.getMessage(), Toast.LENGTH_SHORT).show());
            }
        }
    }
}

