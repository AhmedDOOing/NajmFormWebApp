import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { WebView, type WebViewNavigation } from "react-native-webview";

// ⚠️ CHANGE THIS to your Mac's LAN IP running the Next app (`npm run dev:lan`).
// Your phone and Mac must be on the same Wi-Fi. Find it: ipconfig getifaddr en0
const SERVER_URL = "http://192.168.100.195:3000";

// Najm dark-theme background so there's no white flash before the page paints.
const BG = "#0C1512";

export default function App() {
  const webRef = useRef<WebView>(null);
  const canGoBack = useRef(false);
  const [error, setError] = useState<string | null>(null);

  // Android hardware back → walk the web history instead of exiting the app.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack.current) {
        webRef.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, []);

  const onNav = (s: WebViewNavigation) => {
    canGoBack.current = s.canGoBack;
  };

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        {error ? (
          <View style={styles.center}>
            <Text style={styles.title}>Can’t reach the server</Text>
            <Text style={styles.mono}>{SERVER_URL}</Text>
            <Text style={styles.hint}>
              Make sure the Next.js app is running with `npm run dev:lan`{"\n"}
              and your phone is on the same Wi-Fi.
            </Text>
            <TouchableOpacity
              style={styles.btn}
              onPress={() => {
                setError(null);
                webRef.current?.reload();
              }}
            >
              <Text style={styles.btnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <WebView
            ref={webRef}
            source={{ uri: SERVER_URL }}
            style={styles.web}
            // network / content
            originWhitelist={["*"]}
            mixedContentMode="always"
            javaScriptEnabled
            domStorageEnabled
            // cookies (language gate + SSR resolver)
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            // camera + photo picker for the accident photos (<input capture>)
            allowsInlineMediaPlayback
            mediaCapturePermissionGrantType="grant"
            allowFileAccess
            allowsFullscreenVideo
            // ux
            startInLoadingState
            renderLoading={() => (
              <View style={styles.center}>
                <ActivityIndicator size="large" color="#22c55e" />
              </View>
            )}
            onNavigationStateChange={onNav}
            onError={(e) => setError(e.nativeEvent.description || "load error")}
            onHttpError={(e) => setError(`HTTP ${e.nativeEvent.statusCode} from server`)}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  web: { flex: 1, backgroundColor: BG },
  center: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BG,
    padding: 24,
    gap: 10,
  },
  title: { color: "#fff", fontSize: 18, fontWeight: "700" },
  mono: { color: "#9ca3af", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  hint: { color: "#6b7280", textAlign: "center", lineHeight: 20, marginTop: 4 },
  btn: {
    marginTop: 12,
    backgroundColor: "#22c55e",
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 14,
  },
  btnText: { color: "#04120b", fontWeight: "700" },
});
