fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        // NSWorkspace is resolved at runtime via objc_getClass, which only
        // works if AppKit is actually linked into the binary.
        println!("cargo:rustc-link-lib=framework=AppKit");
    }
}
