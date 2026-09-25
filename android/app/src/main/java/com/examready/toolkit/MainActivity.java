package com.examready.toolkit;

import android.Manifest;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
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
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "ExamReadyNative";
    private static final String PREFS_NAME = "ExamReadyPrefs";
    private static final String KEY_PENDING_CAMERA = "pending_camera_path";
    private static final int PERMISSION_REQ_CAMERA = 1001;
    private static final int REQ_CAMERA_CAPTURE = 1002;

    private File pendingCameraFile;
    private Uri pendingCameraUri;
    private String latestCapturedPhotoDataUrl = null;

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

        // Restore pending camera file if activity was recreated
        if (savedInstanceState != null && savedInstanceState.containsKey(KEY_PENDING_CAMERA)) {
            String path = savedInstanceState.getString(KEY_PENDING_CAMERA);
            if (path != null) {
                pendingCameraFile = new File(path);
            }
        }
        if (pendingCameraFile == null) {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String path = prefs.getString(KEY_PENDING_CAMERA, null);
            if (path != null) {
                pendingCameraFile = new File(path);
            }
        }
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        if (pendingCameraFile != null) {
            outState.putString(KEY_PENDING_CAMERA, pendingCameraFile.getAbsolutePath());
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
            
            // Persist path so activity destruction doesn't lose it
            getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_PENDING_CAMERA, pendingCameraFile.getAbsolutePath())
                .apply();

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
            if (pendingCameraFile == null) {
                SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                String path = prefs.getString(KEY_PENDING_CAMERA, null);
                if (path != null) {
                    pendingCameraFile = new File(path);
                }
            }

            if (pendingCameraFile != null && pendingCameraFile.exists() && pendingCameraFile.length() > 0) {
                try {
                    String dataUrl = processAndCompressCapturedPhoto(pendingCameraFile);
                    if (dataUrl != null) {
                        latestCapturedPhotoDataUrl = dataUrl;
                        String escapedUrl = dataUrl.replace("'", "\\'");
                        String js = "if (window.__handleNativePhoto) { window.__handleNativePhoto('" + escapedUrl + "'); }";
                        getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(js, null));
                    } else {
                        runOnUiThread(() -> Toast.makeText(MainActivity.this, "Failed to process photo", Toast.LENGTH_SHORT).show());
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error reading captured photo file", e);
                    runOnUiThread(() -> Toast.makeText(MainActivity.this, "Failed to load captured photo", Toast.LENGTH_SHORT).show());
                } finally {
                    try {
                        if (pendingCameraFile != null && pendingCameraFile.exists()) {
                            pendingCameraFile.delete();
                        }
                        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().remove(KEY_PENDING_CAMERA).apply();
                    } catch (Exception ignored) {}
                }
            }
        }
    }

    private String processAndCompressCapturedPhoto(File photoFile) {
        try {
            String filePath = photoFile.getAbsolutePath();

            // 1. Check EXIF orientation
            int rotationAngle = 0;
            try {
                ExifInterface exif = new ExifInterface(filePath);
                int orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
                if (orientation == ExifInterface.ORIENTATION_ROTATE_90) {
                    rotationAngle = 90;
                } else if (orientation == ExifInterface.ORIENTATION_ROTATE_180) {
                    rotationAngle = 180;
                } else if (orientation == ExifInterface.ORIENTATION_ROTATE_270) {
                    rotationAngle = 270;
                }
            } catch (Exception ignored) {}

            // 2. Read dimensions with inJustDecodeBounds
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(filePath, opts);

            int maxDim = 2048;
            int sampleSize = 1;
            while ((opts.outWidth / sampleSize > maxDim) || (opts.outHeight / sampleSize > maxDim)) {
                sampleSize *= 2;
            }

            // 3. Decode downsampled bitmap
            opts.inJustDecodeBounds = false;
            opts.inSampleSize = sampleSize;
            Bitmap bitmap = BitmapFactory.decodeFile(filePath, opts);
            if (bitmap == null) return null;

            // 4. Apply rotation if needed
            if (rotationAngle != 0) {
                Matrix matrix = new Matrix();
                matrix.postRotate(rotationAngle);
                Bitmap rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
                if (rotated != bitmap) {
                    bitmap.recycle();
                    bitmap = rotated;
                }
            }

            // 5. Compress to JPEG (88% quality, ~250KB - immune to WebView IPC limit)
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.JPEG, 88, baos);
            byte[] compressedBytes = baos.toByteArray();
            bitmap.recycle();

            String base64 = Base64.encodeToString(compressedBytes, Base64.NO_WRAP);
            return "data:image/jpeg;base64," + base64;
        } catch (Exception e) {
            Log.e(TAG, "Error processing and downsampling captured photo", e);
            return null;
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
        public String getLatestCapturedPhoto() {
            String photo = latestCapturedPhotoDataUrl;
            latestCapturedPhotoDataUrl = null;
            return photo;
        }

        @JavascriptInterface
        public void saveFile(String base64Data, String filename, String mimeType) {
            try {
                if (base64Data == null || base64Data.isEmpty()) return;
                if (base64Data.contains(",")) {
                    base64Data = base64Data.substring(base64Data.indexOf(",") + 1);
                }
                base64Data = base64Data.trim();
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
                base64Data = base64Data.trim();
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

