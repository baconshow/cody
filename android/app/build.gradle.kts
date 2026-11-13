import java.util.Properties

plugins {
    id("com.android.application")
}

// Release signing: android/keystore.properties (never committed) with storeFile, storePassword, keyAlias,
// keyPassword. Without it the release build is unsigned (the debug build signs itself).
val keystore = rootProject.file("keystore.properties")
val signing = Properties().apply { if (keystore.exists()) keystore.inputStream().use { load(it) } }

android {
    namespace = "io.github.baconshow.cody"
    compileSdk = 36

    defaultConfig {
        applicationId = "io.github.baconshow.cody"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.2.0"
    }

    signingConfigs {
        if (signing.isNotEmpty()) {
            create("release") {
                storeFile = rootProject.file(signing.getProperty("storeFile"))
                storePassword = signing.getProperty("storePassword")
                keyAlias = signing.getProperty("keyAlias")
                keyPassword = signing.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (signing.isNotEmpty()) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

dependencies {
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.7.4")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20260814")
}
