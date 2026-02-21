plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.google.play.services)
    alias(libs.plugins.kotlin.parcelize)
}

android {
    namespace = "com.liordahan.mgsrteam"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.liordahan.mgsrteam"
        minSdk = 28
        targetSdk = 36
        versionCode = 8
        versionName = "1.0.7"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // Google Cloud Vision API key for passport OCR (1000 free/month). Add to local.properties: VISION_API_KEY=your_key
        val localPropertiesFile = rootProject.file("local.properties")
        val visionApiKey = if (localPropertiesFile.exists()) {
            localPropertiesFile.readLines()
                .filter { it.contains("=") && !it.trim().startsWith("#") }
                .mapNotNull { line ->
                    val (key, value) = line.split("=", limit = 2).map { it.trim() }
                    if (key == "VISION_API_KEY") value else null
                }.firstOrNull() ?: ""
        } else ""
        buildConfigField("String", "VISION_API_KEY", "\"$visionApiKey\"")
        // YouTube Data API v3 key for highlights search. Add to local.properties: YOUTUBE_API_KEY=your_key
        val youtubeApiKey = if (localPropertiesFile.exists()) {
            localPropertiesFile.readLines()
                .filter { it.contains("=") && !it.trim().startsWith("#") }
                .mapNotNull { line ->
                    val (key, value) = line.split("=", limit = 2).map { it.trim() }
                    if (key == "YOUTUBE_API_KEY") value else null
                }.firstOrNull() ?: ""
        } else ""
        buildConfigField("String", "YOUTUBE_API_KEY", "\"$youtubeApiKey\"")
        // Bing Video Search API - searches across the web (YouTube, Dailymotion, Vimeo, Instagram, TikTok, etc.)
        val bingApiKey = if (localPropertiesFile.exists()) {
            localPropertiesFile.readLines()
                .filter { it.contains("=") && !it.trim().startsWith("#") }
                .mapNotNull { line ->
                    val (key, value) = line.split("=", limit = 2).map { it.trim() }
                    if (key == "BING_SEARCH_API_KEY") value else null
                }.firstOrNull() ?: ""
        } else ""
        buildConfigField("String", "BING_SEARCH_API_KEY", "\"$bingApiKey\"")
        // Vimeo API - search videos. Add to local.properties: VIMEO_ACCESS_TOKEN=your_token
        val vimeoToken = if (localPropertiesFile.exists()) {
            localPropertiesFile.readLines()
                .filter { it.contains("=") && !it.trim().startsWith("#") }
                .mapNotNull { line ->
                    val (key, value) = line.split("=", limit = 2).map { it.trim() }
                    if (key == "VIMEO_ACCESS_TOKEN") value else null
                }.firstOrNull() ?: ""
        } else ""
        buildConfigField("String", "VIMEO_ACCESS_TOKEN", "\"$vimeoToken\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        create("benchmark") {
            initWith(getByName("release"))
            isDebuggable = false
            signingConfig = signingConfigs.getByName("debug")
            matchingFallbacks += listOf("release")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

composeCompiler {
    stabilityConfigurationFile = rootProject.layout.projectDirectory.file("compose-stability.conf")
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21)
    }
}

dependencies {

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.exifinterface)
    implementation(libs.splash.screen)
    implementation(libs.compose.constraintLayout)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.material.icons)
    implementation(libs.navigation)
    implementation(libs.jsoup)
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.ui.test.junit4)
    debugImplementation(libs.androidx.ui.tooling)
    debugImplementation(libs.androidx.ui.test.manifest)

    //Koin
    implementation(libs.koin.core)
    implementation(libs.koin.android)
    implementation(libs.koin.compose)

    //Firebase
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)
    implementation(libs.firebase.auth)
    implementation(libs.firebase.storage)
    implementation(libs.firebase.store)
    implementation(libs.firebase.analytics)

    //Coroutines
    implementation(libs.coroutines)
    implementation(libs.coroutines.play.service)

    //Coil
    implementation(libs.coil.core)
    implementation(libs.coil.svg)
    implementation(libs.coil.gif)
    implementation(libs.coil.compose)

    implementation(libs.okhttp)
    implementation(project(":transfermarkt"))

    // Firebase AI Logic (Gemini)
    implementation("com.google.firebase:firebase-ai")

    // ML Kit for document type detection (passport OCR)
    implementation(libs.mlkit.text.recognition)

    // PdfBox-Android for extracting text from mandate PDFs (Term section date)
    implementation(libs.pdfbox.android)

    // Glance for home screen widget
    implementation(libs.glance.appwidget)
    implementation(libs.glance.material3)

    // Google Play In-App Update (mandatory update flow)
    implementation(libs.play.app.update)
    implementation(libs.play.app.update.ktx)
}