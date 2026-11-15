/// Bundle ids of the apps whose computer-use sidecar may drive this helper.
public enum TrustedDolphinApplication {
    public static func isTrusted(bundleId: String) -> Bool {
        // Why: `pnpm dev` launches as `com.stablyai.dolphin.dev` and per-worktree wrapper apps use
        // `com.stablyai.dolphin.dev.<name>`; the sidecar peer check must authorize both (#26498).
        bundleId == "com.stablyai.dolphin" ||
            bundleId == "com.stablyai.dolphin.dev" ||
            bundleId.hasPrefix("com.stablyai.dolphin.dev.") ||
            bundleId == "com.github.Electron"
    }
}
