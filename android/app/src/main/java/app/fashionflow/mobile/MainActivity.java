package app.fashionflow.mobile;

import android.os.Bundle;
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
}
