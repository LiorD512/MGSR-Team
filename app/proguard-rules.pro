# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ── Suppress R8 warnings for missing optional dependencies ────────────────
-dontwarn com.gemalto.jp2.JP2Decoder

# ── Firebase Firestore model classes (need no-arg constructors) ───────────
# Keep all model/data classes that Firestore deserializes via toObjects/toObject.
-keep class com.liordahan.mgsrteam.features.players.models.** { *; }
-keep class com.liordahan.mgsrteam.features.login.models.** { *; }
-keep class com.liordahan.mgsrteam.features.home.models.** { *; }
-keep class com.liordahan.mgsrteam.features.contacts.models.** { *; }
-keep class com.liordahan.mgsrteam.features.requests.models.** { *; }
-keep class com.liordahan.mgsrteam.features.shortlist.** { <init>(...); *; }
-keep class com.liordahan.mgsrteam.features.players.playerinfo.documents.PlayerDocument { *; }
-keep class com.liordahan.mgsrteam.features.players.playerinfo.documents.DocumentType { *; }
-keep class com.liordahan.mgsrteam.features.home.DocumentReminder { *; }
-keep class com.liordahan.mgsrteam.features.home.HomeDashboardState { *; }
-keep class com.liordahan.mgsrteam.features.players.PlayersUiState { *; }
-keep class com.liordahan.mgsrteam.features.players.PlayerWithMandateExpiry { *; }
-keep class com.liordahan.mgsrteam.features.releases.ReleasesUiState { *; }

# ── Keep enums used by Firestore ──────────────────────────────────────────
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# ── Transfermarkt models (used in Firestore and network) ──────────────────
-keep class com.liordahan.mgsrteam.transfermarket.** { *; }