#import <Foundation/Foundation.h>
#import <Security/Security.h>
#include <node_api.h>
#include <memory>
#include <string>

enum class Action { Contains, Read, Save, Forget };

struct Job {
  napi_deferred deferred = nullptr;
  napi_async_work work = nullptr;
  Action action = Action::Read;
  std::string service;
  std::string account;
  std::string password;
  OSStatus status = errSecInternalComponent;
  bool found = false;

  ~Job() {
    volatile char *bytes = password.data();
    for (size_t i = 0; i < password.size(); ++i) bytes[i] = 0;
  }
};

static bool ReadString(napi_env env, napi_value value, std::string &result, size_t maxBytes) {
  size_t size = 0;
  if (napi_get_value_string_utf8(env, value, nullptr, 0, &size) != napi_ok ||
      size == 0 || size > maxBytes) return false;
  result.resize(size + 1);
  if (napi_get_value_string_utf8(env, value, result.data(), result.size(), &size) != napi_ok) {
    return false;
  }
  result.resize(size);
  return true;
}

static NSDictionary *ItemQuery(const Job &job) {
  return @{
    (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
    (__bridge id)kSecAttrService: @(job.service.c_str()),
    (__bridge id)kSecAttrAccount: @(job.account.c_str()),
  };
}

static void FindItem(Job &job, NSMutableDictionary *query) {
  query[(__bridge id)kSecReturnAttributes] = @YES;
  query[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;
  CFTypeRef result = nullptr;
  job.status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);
  if (result) CFRelease(result);
  job.found = job.status == errSecSuccess;
  if (job.status == errSecItemNotFound) job.status = errSecSuccess;
}

static void ReadPassword(Job &job, NSMutableDictionary *query) {
  query[(__bridge id)kSecReturnData] = @YES;
  query[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;
  CFTypeRef result = nullptr;
  job.status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);
  if (job.status == errSecItemNotFound) {
    job.status = errSecSuccess;
    return;
  }
  if (job.status != errSecSuccess) return;
  NSData *password = CFBridgingRelease(result);
  if (![password isKindOfClass:NSData.class] || password.length == 0) {
    job.status = errSecDecode;
    return;
  }
  job.password.assign(static_cast<const char *>(password.bytes), password.length);
  job.found = true;
}

static OSStatus SavePassword(const Job &job, NSDictionary *identity,
                             NSDictionary *query, SecKeychainRef keychain) {
  NSData *data = [NSData dataWithBytes:job.password.data() length:job.password.size()];
  NSMutableDictionary *add = [identity mutableCopy];
  add[(__bridge id)kSecUseKeychain] = (__bridge id)keychain;
  add[(__bridge id)kSecValueData] = data;
  add[(__bridge id)kSecAttrLabel] = @"6529 Core wallet password";
  OSStatus added = SecItemAdd((__bridge CFDictionaryRef)add, nullptr);
  if (added != errSecDuplicateItem) return added;
  NSDictionary *update = @{(__bridge id)kSecValueData: data};
  return SecItemUpdate((__bridge CFDictionaryRef)query, (__bridge CFDictionaryRef)update);
}

static void Execute(napi_env, void *context) {
  Job &job = *static_cast<Job *>(context);
  @autoreleasepool {
    // Use the default file-based user keychain. This item never opts into iCloud.
    SecKeychainRef keychain = nullptr;
    job.status = SecKeychainCopyDomainDefault(kSecPreferencesDomainUser, &keychain);
    if (job.status != errSecSuccess) return;
    NSDictionary *identity = ItemQuery(job);
    NSMutableDictionary *query = [identity mutableCopy];
    query[(__bridge id)kSecMatchSearchList] = @[(__bridge id)keychain];
    switch (job.action) {
      case Action::Contains:
        FindItem(job, query);
        break;
      case Action::Read:
        ReadPassword(job, query);
        break;
      case Action::Save:
        job.status = SavePassword(job, identity, query, keychain);
        break;
      case Action::Forget:
        job.status = SecItemDelete((__bridge CFDictionaryRef)query);
        if (job.status == errSecItemNotFound) job.status = errSecSuccess;
        break;
    }
    CFRelease(keychain);
  }
}

static void Reject(napi_env env, napi_deferred deferred) {
  napi_value message;
  napi_value error;
  napi_create_string_utf8(env, "macOS Keychain operation failed", NAPI_AUTO_LENGTH, &message);
  napi_create_error(env, nullptr, message, &error);
  napi_reject_deferred(env, deferred, error);
}

static void Complete(napi_env env, napi_status status, void *context) {
  std::unique_ptr<Job> job(static_cast<Job *>(context));
  if (status != napi_ok || job->status != errSecSuccess) {
    Reject(env, job->deferred);
  } else {
    napi_value result;
    if (job->action == Action::Contains) {
      napi_get_boolean(env, job->found, &result);
    } else if (job->found) {
      napi_create_string_utf8(env, job->password.data(), job->password.size(), &result);
    } else {
      napi_get_null(env, &result);
    }
    napi_resolve_deferred(env, job->deferred, result);
  }
  napi_delete_async_work(env, job->work);
}

static napi_value Start(napi_env env, napi_callback_info info, Action action) {
  size_t argc = 3;
  napi_value args[3];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  std::unique_ptr<Job> job = std::make_unique<Job>();
  job->action = action;
  napi_value promise;
  napi_create_promise(env, &job->deferred, &promise);
  const bool hasPassword = action == Action::Save;
  if (argc != (hasPassword ? 3u : 2u) ||
      !ReadString(env, args[0], job->service, 200) ||
      !ReadString(env, args[1], job->account, 42) ||
      (hasPassword && !ReadString(env, args[2], job->password, 16384))) {
    Reject(env, job->deferred);
    return promise;
  }

  napi_value name;
  napi_create_string_utf8(env, "6529 Wallet Keychain", NAPI_AUTO_LENGTH, &name);
  if (napi_create_async_work(env, nullptr, name, Execute, Complete,
                             job.get(), &job->work) != napi_ok) {
    Reject(env, job->deferred);
    return promise;
  }
  if (napi_queue_async_work(env, job->work) != napi_ok) {
    napi_delete_async_work(env, job->work);
    Reject(env, job->deferred);
    return promise;
  }
  job.release();
  return promise;
}

static napi_value Contains(napi_env env, napi_callback_info info) {
  return Start(env, info, Action::Contains);
}

static napi_value Read(napi_env env, napi_callback_info info) {
  return Start(env, info, Action::Read);
}
static napi_value Save(napi_env env, napi_callback_info info) {
  return Start(env, info, Action::Save);
}
static napi_value Forget(napi_env env, napi_callback_info info) {
  return Start(env, info, Action::Forget);
}

NAPI_MODULE_INIT() {
  napi_property_descriptor methods[] = {
    {"contains", nullptr, Contains, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"read", nullptr, Read, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"save", nullptr, Save, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"forget", nullptr, Forget, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, sizeof(methods) / sizeof(methods[0]), methods);
  return exports;
}
