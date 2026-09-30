import UIKit

/// iOS 27+ requires UIScene lifecycle for apps built with the latest SDK.
/// Attach the React Native window created in AppDelegate to the system scene.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard
      let windowScene = scene as? UIWindowScene,
      let appDelegate = UIApplication.shared.delegate as? AppDelegate,
      let appWindow = appDelegate.window
    else {
      return
    }

    appWindow.windowScene = windowScene
    window = appWindow
    window?.makeKeyAndVisible()
  }
}
