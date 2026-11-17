#import <Foundation/Foundation.h>
#include <errno.h>
#include <stdio.h>
#include <sys/event.h>
#include <sys/stat.h>
#include <unistd.h>

static BOOL waitForExit(pid_t pid) {
    int queue = kqueue();
    if (queue == -1) return NO;

    struct kevent change, event;
    EV_SET(&change, pid, EVFILT_PROC, EV_ADD | EV_ONESHOT, NOTE_EXIT, 0, NULL);
    const struct timespec timeout = { .tv_sec = 15 };
    int result = kevent(queue, &change, 1, &event, 1, &timeout);
    BOOL exited = result == 1
        ? !(event.flags & EV_ERROR) || event.data == ESRCH
        : result == -1 && errno == ESRCH;
    close(queue);
    return exited;
}

static BOOL openBundle(NSString *bundlePath, NSString *skipMoveArg) {
    NSTask *open = [[NSTask alloc] init];
    open.executableURL = [NSURL fileURLWithPath:@"/usr/bin/open"];
    open.arguments = @[ @"-a", bundlePath, @"--args", skipMoveArg ];
    NSError *error = nil;
    if (![open launchAndReturnError:&error]) {
        NSLog(@"[Classic bundle move] Could not launch open: %@", error);
        return NO;
    }
    [open waitUntilExit];
    return open.terminationStatus == 0;
}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc != 7) return 1;
        char action;
        if (read(STDIN_FILENO, &action, 1) != 1 || action != 'M') return 0;

        NSString *source = @(argv[1]);
        NSString *destination = @(argv[2]);
        pid_t pid = (pid_t)strtol(argv[3], NULL, 10);
        if (pid <= 1 || !waitForExit(pid)) {
            NSLog(@"[Classic bundle move] The app did not exit before the move deadline");
            return 1;
        }

        struct stat current;
        if (lstat(source.fileSystemRepresentation, &current) != 0 ||
            !S_ISDIR(current.st_mode) ||
            current.st_dev != strtoll(argv[4], NULL, 10) ||
            current.st_ino != strtoull(argv[5], NULL, 10)) {
            NSLog(@"[Classic bundle move] The app bundle changed before it could be moved");
            return 1;
        }

        // Atomic and non-overwriting even if another copy appeared after startup.
        if (renamex_np(source.fileSystemRepresentation, destination.fileSystemRepresentation, RENAME_EXCL) != 0) {
            NSLog(@"[Classic bundle move] Could not rename the bundle (errno %d)", errno);
        } else {
            if (openBundle(destination, @(argv[6]))) return 0;
            NSLog(@"[Classic bundle move] Could not reopen the renamed app; restoring the old path");
            if (renamex_np(destination.fileSystemRepresentation, source.fileSystemRepresentation, RENAME_EXCL) != 0) {
                NSLog(@"[Classic bundle move] Could not restore the old path (errno %d)", errno);
                return 1;
            }
        }
        return openBundle(source, @(argv[6])) ? 0 : 1;
    }
}
