/**
 * Patches native Android dependency crashes seen in Firebase Crashlytics.
 *
 * 1. react-native-screens 3.29.0 can compile MutableList.removeLast() into a
 *    java.util.List.removeLast() interface call. That method is not present on
 *    many Android runtimes, causing ScreenStack.obtainDrawingOp crashes.
 * 2. expo-notifications 0.27.8 can crash NotificationForwarderActivity when a
 *    notification response intent is recreated without notification/action
 *    extras. In that case we close the trampoline activity instead of crashing.
 *
 * Run automatically via package.json postinstall.
 */
const fs = require('fs');
const path = require('path');

function patchFile(label, relativePath, broken, fixed) {
  const filePath = path.join(__dirname, '..', relativePath);

  if (!fs.existsSync(filePath)) {
    console.log(`[${label}] File not found, skipping.`);
    return;
  }

  const original = fs.readFileSync(filePath, 'utf8');

  if (original.includes(fixed)) {
    console.log(`[${label}] Already patched, skipping.`);
    return;
  }

  if (!original.includes(broken)) {
    console.log(`[${label}] WARNING: Pattern not found. Review dependency version manually.`);
    return;
  }

  fs.writeFileSync(filePath, original.replace(broken, fixed), 'utf8');
  console.log(`[${label}] Patch applied.`);
}

patchFile(
  'patch-react-native-screens-remove-last',
  'node_modules/react-native-screens/android/src/main/java/com/swmansion/rnscreens/ScreenStack.kt',
  'if (drawingOpPool.isEmpty()) DrawingOp() else drawingOpPool.removeLast()',
  'if (drawingOpPool.isEmpty()) DrawingOp() else drawingOpPool.removeAt(drawingOpPool.size - 1)',
);

patchFile(
  'patch-expo-notifications-forwarder',
  'node_modules/expo-notifications/android/src/main/java/expo/modules/notifications/service/NotificationForwarderActivity.kt',
  `    val broadcastIntent =
      NotificationsService.createNotificationResponseBroadcastIntent(applicationContext, intent.extras)
    val notificationResponse = NotificationsService.getNotificationResponseFromBroadcastIntent(broadcastIntent)
    ExpoHandlingDelegate.openAppToForeground(this, notificationResponse)
    sendBroadcast(broadcastIntent)
    finish()`,
  `    try {
      val broadcastIntent =
        NotificationsService.createNotificationResponseBroadcastIntent(applicationContext, intent.extras)
      val notificationResponse = NotificationsService.getNotificationResponseFromBroadcastIntent(broadcastIntent)
      ExpoHandlingDelegate.openAppToForeground(this, notificationResponse)
      sendBroadcast(broadcastIntent)
    } catch (_: IllegalArgumentException) {
      // Missing notification/action extras should not crash the host app.
    }
    finish()`,
);
