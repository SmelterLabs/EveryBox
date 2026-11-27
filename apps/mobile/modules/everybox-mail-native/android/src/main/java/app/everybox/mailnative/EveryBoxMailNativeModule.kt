package app.everybox.mailnative

import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class EveryBoxMailNativeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("EveryBoxMailNative")

    Function("getNativeBridgeStatus") {
      mapOf(
        "engine" to "everybox-mail-native",
        "platform" to "android",
        "sdkInt" to Build.VERSION.SDK_INT,
        "ready" to true
      )
    }
  }
}
