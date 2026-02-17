# CR-SQLite Library Download Instructions

The automated download of cr-sqlite failed. You'll need to manually download the library:

## Download Links

Visit: https://github.com/vlcn-io/cr-sqlite/releases/latest

Download these files:
- `crsqlite-android-aarch64.tar.gz` (for arm64-v8a devices - most modern Android phones)
- `crsqlite-android-armv7.tar.gz` (for armeabi-v7a devices - older phones)
- `crsqlite-android-x86_64.tar.gz` (for x86_64 emulators)

## Installation

1. Extract each tar.gz file
2. Rename the extracted `crsqlite.so` to `libcrsqlite.so`
3. Place them in the corresponding directories:
   - `android/app/src/main/jniLibs/arm64-v8a/libcrsqlite.so`
   - `android/app/src/main/jniLibs/armeabi-v7a/libcrsqlite.so`
   - `android/app/src/main/jniLibs/x86_64/libcrsqlite.so`

## Note

The app will compile and run without these libraries, but **sync functionality will not work** until the cr-sqlite extension is available. The app will log warnings about the missing library but will continue to track activity locally.
