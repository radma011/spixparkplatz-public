package com.spixparkplatz

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    // Firebase auto-init can fail when applicationId != namespace (resource lookup is by packageName).
    // Ensure a DEFAULT app exists before any JS module accesses Firestore/Auth/etc.
    if (FirebaseApp.getApps(this).isEmpty()) {
      try {
        // Load resources from applicationId package (where google-services.json resources are generated)
        val appId = applicationInfo.packageName // "com.radisoglou.parkplatz"
        val appResources = packageManager.getResourcesForApplication(appId)
        
        val googleAppIdResId = appResources.getIdentifier("google_app_id", "string", appId)
        val googleApiKeyResId = appResources.getIdentifier("google_api_key", "string", appId)
        val gcmSenderIdResId = appResources.getIdentifier("gcm_defaultSenderId", "string", appId)
        val projectIdResId = appResources.getIdentifier("project_id", "string", appId)
        val storageBucketResId = appResources.getIdentifier("google_storage_bucket", "string", appId)
        
        if (googleAppIdResId != 0 && googleApiKeyResId != 0) {
          val options =
            FirebaseOptions.Builder()
              .setApplicationId(appResources.getString(googleAppIdResId))
              .setApiKey(appResources.getString(googleApiKeyResId))
              .setGcmSenderId(if (gcmSenderIdResId != 0) appResources.getString(gcmSenderIdResId) else null)
              .setProjectId(if (projectIdResId != 0) appResources.getString(projectIdResId) else null)
              .setStorageBucket(if (storageBucketResId != 0) appResources.getString(storageBucketResId) else null)
              .build()
          FirebaseApp.initializeApp(this, options)
        } else {
          // Fallback: try namespace package resources (if google-services plugin generated them there)
          val options =
            FirebaseOptions.Builder()
              .setApplicationId(getString(R.string.google_app_id))
              .setApiKey(getString(R.string.google_api_key))
              .setGcmSenderId(getString(R.string.gcm_defaultSenderId))
              .setProjectId(getString(R.string.project_id))
              .setStorageBucket(getString(R.string.google_storage_bucket))
              .build()
          FirebaseApp.initializeApp(this, options)
        }
      } catch (e: Exception) {
        // If manual init fails, FirebaseInitProvider should handle it (but it might be too late)
        android.util.Log.e("MainApplication", "Failed to initialize Firebase manually", e)
      }
    }
    
    // Create notification channel for Android 8.0+ (required for push notifications to be displayed)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channelId = "parkplatz_default_channel"
      val channelName = "Parkplatz Benachrichtigungen"
      val channelDescription = "Benachrichtigungen für Parkplatz-Anfragen und Angebote"
      val importance = NotificationManager.IMPORTANCE_HIGH
      val channel = NotificationChannel(channelId, channelName, importance)
      channel.description = channelDescription
      channel.enableVibration(true)
      channel.enableLights(true)
      
      val notificationManager = getSystemService(NotificationManager::class.java)
      notificationManager?.createNotificationChannel(channel)
    }
    
    loadReactNative(this)
  }
}
