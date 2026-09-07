package app.fashionflow.mobile;

import android.content.res.Configuration;
import android.content.res.Resources;
import android.os.Bundle;
import android.util.DisplayMetrics;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // Android WebView inherits the device's system font-scale (Settings > Display > Font size)
    // as its native text zoom by default — completely separate from any CSS, and not touched by
    // `text-size-adjust`. Chrome the browser doesn't apply that scale the same way, which is why
    // the same page can look normal in a browser tab but render every piece of text (and, in turn,
    // anything whose layout depends on text, like a button that has to grow to fit it) noticeably
    // larger inside the packaged app — on any device where the user (or the OEM's default, as on
    // several OnePlus/OxygenOS builds) has font size set above 100%. Pinning textZoom to 100
    // makes the app's type scale match what the design/CSS actually specifies, exactly like a
    // browser tab, on every device regardless of that setting.
    getBridge().getWebView().getSettings().setTextZoom(100);
  }

  // Deliberate, requested override: Android's system "Display size" (Settings > Display >
  // Display size, sometimes "Screen zoom") works by changing the density every app is handed —
  // unlike the font-scale/textZoom fix above, this one scales the whole layout, icons included,
  // consistently with the rest of the OS, so it's expected behavior rather than a bug on its own.
  // It's overridden here only because it was explicitly asked for: this pins the WebView to the
  // device's native, physical density (DENSITY_DEVICE_STABLE — unaffected by that setting) rather
  // than whatever value the user's chosen Display size maps to, so the app renders at one fixed
  // physical size regardless of it, the same way the textZoom fix does for font scale.
  @Override
  public Resources getResources() {
    Resources resources = super.getResources();
    Configuration config = resources.getConfiguration();
    if (config.densityDpi != DisplayMetrics.DENSITY_DEVICE_STABLE) {
      config.densityDpi = DisplayMetrics.DENSITY_DEVICE_STABLE;
      resources.updateConfiguration(config, resources.getDisplayMetrics());
    }
    return resources;
  }
}
