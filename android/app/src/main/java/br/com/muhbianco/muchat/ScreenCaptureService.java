package br.com.muhbianco.muchat;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.util.DisplayMetrics;
import android.view.WindowManager;
import androidx.core.app.NotificationCompat;
import java.io.ByteArrayOutputStream;
import java.lang.ref.WeakReference;
import java.nio.ByteBuffer;

/**
 * Holds the MediaProjection token and pushes JPEG frames to the WebView.
 * Must be started only after the user accepts the system capture dialog:
 * Android 14+ crashes a mediaProjection FGS that starts without that token.
 */
public class ScreenCaptureService extends Service {
    public static final String CHANNEL_ID = "muchat_capture";
    public static final String EXTRA_RESULT_CODE = "resultCode";
    public static final String EXTRA_DATA = "data";
    public static final String EXTRA_WIDTH = "width";
    public static final String EXTRA_HEIGHT = "height";
    public static final String EXTRA_FPS = "fps";

    private static final int NOTIFICATION_ID = 41;
    private static final int JPEG_QUALITY = 55;

    public interface FrameListener {
        void onCaptureReady();

        void onCaptureEnded();

        void onCaptureError(String message);

        void onFrame(byte[] jpeg);
    }

    private static WeakReference<FrameListener> listenerRef = new WeakReference<>(null);

    public static void setListener(FrameListener listener) {
        listenerRef = new WeakReference<>(listener);
    }

    private static FrameListener listener() {
        return listenerRef.get();
    }

    private MediaProjection projection;
    private VirtualDisplay virtualDisplay;
    private ImageReader imageReader;
    private HandlerThread captureThread;
    private Handler captureHandler;
    private Bitmap reuseBitmap;
    private final ByteArrayOutputStream jpegOut = new ByteArrayOutputStream(64 * 1024);
    private int width;
    private int height;
    private long minFrameGapMs;
    private long lastFrameAt;
    private boolean readyEmitted;

    private final MediaProjection.Callback projectionCallback = new MediaProjection.Callback() {
        @Override
        public void onStop() {
            stopSelf();
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel =
                    new NotificationChannel(CHANNEL_ID, "Muchat", NotificationManager.IMPORTANCE_LOW);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || !intent.hasExtra(EXTRA_RESULT_CODE) || !intent.hasExtra(EXTRA_DATA)) {
            FrameListener current = listener();
            if (current != null) {
                current.onCaptureError("Compartilhamento de tela sem permissão do sistema.");
            }
            stopSelf();
            return START_NOT_STICKY;
        }

        int resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0);
        Intent data = extraData(intent);
        width = Math.max(320, Math.min(1920, intent.getIntExtra(EXTRA_WIDTH, 1280)));
        height = Math.max(180, Math.min(1080, intent.getIntExtra(EXTRA_HEIGHT, 720)));
        int fps = Math.max(5, Math.min(15, intent.getIntExtra(EXTRA_FPS, 10)));
        minFrameGapMs = 1000L / fps;

        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(
                    NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        if (data == null || resultCode == 0) {
            fail("Permissão de tela recusada.");
            return START_NOT_STICKY;
        }

        MediaProjectionManager manager =
                (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
        if (manager == null) {
            fail("Sem MediaProjection neste aparelho.");
            return START_NOT_STICKY;
        }

        try {
            projection = manager.getMediaProjection(resultCode, data);
        } catch (SecurityException e) {
            fail("O Android recusou o compartilhamento de tela.");
            return START_NOT_STICKY;
        }
        if (projection == null) {
            fail("Não deu para iniciar o compartilhamento de tela.");
            return START_NOT_STICKY;
        }

        captureThread = new HandlerThread("muchat-capture");
        captureThread.start();
        captureHandler = new Handler(captureThread.getLooper());
        projection.registerCallback(projectionCallback, captureHandler);

        imageReader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2);
        imageReader.setOnImageAvailableListener(this::onImage, captureHandler);

        DisplayMetrics metrics = new DisplayMetrics();
        WindowManager windows = (WindowManager) getSystemService(WINDOW_SERVICE);
        if (windows != null) {
            windows.getDefaultDisplay().getRealMetrics(metrics);
        }
        int dpi = metrics.densityDpi > 0 ? metrics.densityDpi : DisplayMetrics.DENSITY_DEFAULT;

        virtualDisplay = projection.createVirtualDisplay(
                "muchat-share",
                width,
                height,
                dpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                imageReader.getSurface(),
                null,
                captureHandler);

        if (virtualDisplay == null) {
            fail("Não criou a captura da tela.");
            return START_NOT_STICKY;
        }

        FrameListener current = listener();
        if (current != null) current.onCaptureReady();
        readyEmitted = true;
        return START_STICKY;
    }

    @SuppressWarnings("deprecation")
    private Intent extraData(Intent intent) {
        if (Build.VERSION.SDK_INT >= 33) {
            return intent.getParcelableExtra(EXTRA_DATA, Intent.class);
        }
        return intent.getParcelableExtra(EXTRA_DATA);
    }

    private void onImage(ImageReader reader) {
        Image image = reader.acquireLatestImage();
        if (image == null) return;
        long now = System.currentTimeMillis();
        if (now - lastFrameAt < minFrameGapMs) {
            image.close();
            return;
        }
        lastFrameAt = now;
        try {
            byte[] jpeg = encodeJpeg(image);
            FrameListener current = listener();
            if (jpeg != null && current != null) current.onFrame(jpeg);
        } catch (RuntimeException ignored) {
            /* drop a bad frame rather than killing the share */
        } finally {
            image.close();
        }
    }

    private byte[] encodeJpeg(Image image) {
        Image.Plane plane = image.getPlanes()[0];
        ByteBuffer buffer = plane.getBuffer();
        int pixelStride = plane.getPixelStride();
        int rowStride = plane.getRowStride();
        int rowPadding = rowStride - pixelStride * width;
        int bitmapWidth = width + (pixelStride > 0 ? rowPadding / pixelStride : 0);
        if (reuseBitmap == null
                || reuseBitmap.getWidth() != bitmapWidth
                || reuseBitmap.getHeight() != height) {
            reuseBitmap = Bitmap.createBitmap(bitmapWidth, height, Bitmap.Config.ARGB_8888);
        }
        buffer.rewind();
        reuseBitmap.copyPixelsFromBuffer(buffer);
        Bitmap framed = reuseBitmap;
        if (bitmapWidth != width) {
            framed = Bitmap.createBitmap(reuseBitmap, 0, 0, width, height);
        }
        jpegOut.reset();
        if (!framed.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, jpegOut)) {
            return null;
        }
        return jpegOut.toByteArray();
    }

    private Notification buildNotification() {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Muchat")
                .setContentText("Compartilhamento de tela")
                .setSmallIcon(R.drawable.ic_stat_muchat)
                .setOngoing(true)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .build();
    }

    private void fail(String message) {
        FrameListener current = listener();
        if (current != null) current.onCaptureError(message);
        stopSelf();
    }

    private void releaseCapture() {
        if (imageReader != null) {
            imageReader.setOnImageAvailableListener(null, null);
            imageReader.close();
            imageReader = null;
        }
        if (virtualDisplay != null) {
            virtualDisplay.release();
            virtualDisplay = null;
        }
        if (projection != null) {
            MediaProjection stopping = projection;
            projection = null;
            try {
                stopping.unregisterCallback(projectionCallback);
            } catch (RuntimeException ignored) {
                /* already stopped */
            }
            try {
                stopping.stop();
            } catch (RuntimeException ignored) {
                /* already stopped */
            }
        }
        if (captureThread != null) {
            captureThread.quitSafely();
            captureThread = null;
            captureHandler = null;
        }
        reuseBitmap = null;
    }

    @Override
    public void onDestroy() {
        boolean wasReady = readyEmitted;
        releaseCapture();
        FrameListener current = listener();
        if (wasReady && current != null) current.onCaptureEnded();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
