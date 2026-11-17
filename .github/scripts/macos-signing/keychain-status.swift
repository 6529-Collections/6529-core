import Darwin
import Security

var status: SecKeychainStatus = 0
let result = SecKeychainGetStatus(nil, &status)
guard result == errSecSuccess else {
    print("[mac signing] Could not read default keychain status (OSStatus \(result))")
    exit(EXIT_FAILURE)
}

let unlocked = status & kSecUnlockStateStatus != 0
print("[mac signing] Default keychain before signing: \(unlocked ? "unlocked" : "locked")")
exit(unlocked ? EXIT_SUCCESS : EXIT_FAILURE)
