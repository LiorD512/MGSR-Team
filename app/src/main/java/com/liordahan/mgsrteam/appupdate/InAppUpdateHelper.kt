package com.liordahan.mgsrteam.appupdate

import android.app.Activity
import android.util.Log
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.IntentSenderRequest
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.UpdateAvailability

/**
 * Handles Google Play In-App Update flow. When a newer version is available on the store,
 * prompts the user with a mandatory (immediate) update dialog. The user must update to continue.
 */
class InAppUpdateHelper(
    private val activity: Activity,
    private val updateLauncher: ActivityResultLauncher<IntentSenderRequest>
) {
    private val appUpdateManager: AppUpdateManager =
        AppUpdateManagerFactory.create(activity)

    companion object {
        private const val TAG = "InAppUpdate"
    }

    /**
     * Checks for update availability and starts the immediate update flow if a newer version
     * is available on the Play Store. For mandatory updates, the user cannot dismiss the dialog
     * without updating. If they cancel, the app is finished.
     */
    fun checkForUpdate(onNoUpdateNeeded: () -> Unit = {}) {
        appUpdateManager.appUpdateInfo
            .addOnSuccessListener { appUpdateInfo ->
                if (appUpdateInfo.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE
                    && appUpdateInfo.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)
                ) {
                    val options = AppUpdateOptions.newBuilder(AppUpdateType.IMMEDIATE).build()
                    appUpdateManager.startUpdateFlowForResult(
                        appUpdateInfo,
                        updateLauncher,
                        options
                    )
                    Log.i(TAG, "In-app update flow started (immediate/mandatory)")
                } else {
                    when (appUpdateInfo.updateAvailability()) {
                        UpdateAvailability.UPDATE_AVAILABLE -> {
                            Log.w(TAG, "Update available but IMMEDIATE not allowed")
                        }
                        UpdateAvailability.UPDATE_NOT_AVAILABLE -> {
                            Log.d(TAG, "No update available")
                        }
                        else -> {
                            Log.d(TAG, "Update not available (availability=${appUpdateInfo.updateAvailability()})")
                        }
                    }
                    onNoUpdateNeeded()
                }
            }
            .addOnFailureListener { e ->
                Log.e(TAG, "Failed to check for update", e)
                onNoUpdateNeeded()
            }
    }

    /**
     * Call when the update flow returns. For mandatory updates, if the user did not complete
     * the update (e.g. pressed back), finish the activity so they cannot use the app.
     */
    fun onUpdateFlowResult(resultCode: Int) {
        if (resultCode != Activity.RESULT_OK) {
            Log.w(TAG, "Update flow cancelled or failed (resultCode=$resultCode), finishing app")
            activity.finish()
        }
    }
}
