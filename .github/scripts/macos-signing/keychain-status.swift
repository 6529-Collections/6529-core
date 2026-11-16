import Security

var status: SecKeychainStatus = 0
let result = SecKeychainGetStatus(nil, &status)
if result == errSecSuccess {
    let unlocked = status & kSecUnlockStateStatus != 0
    print("[mac signing] Default keychain before signing: \(unlocked ? "unlocked" : "locked")")
} else {
    print("[mac signing] Could not read default keychain status (OSStatus \(result))")
}
