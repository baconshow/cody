// The Android app: a Trusted Web Activity that opens the mascot page served by your computer (see README.md,
// "Put it on your phone"), plus the parts a web page cannot do: notifications with the app closed and a widget.
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "Cody"
include(":app")
