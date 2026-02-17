
import sqlite3
import os
import sys
from pathlib import Path

# Try to find the extension
def find_extension():
    # Check package internal lib
    pkg_lib = Path(__file__).parent.parent / "src" / "atracker" / "lib"
    files = list(pkg_lib.glob("crsqlite.*")) + list(pkg_lib.glob("libcrsqlite.*"))
    if files:
        return str(files[0])
    return None

def main():
    ext = find_extension()
    db_path = os.path.expanduser("~/.local/share/atracker/atracker.db")
    
    if not ext:
        print("Error: Could not find crsqlite extension.")
        sys.exit(1)
        
    print(f"To open the database with the extension loaded, use:")
    print(f"\nsqlite3 -cmd \".load {ext}\" {db_path}")
    
    # Also offer to run it if sqlite3 is available
    import subprocess
    try:
        subprocess.run(["sqlite3", "--version"], capture_output=True)
        print("\nRunning sqlite3 now...")
        subprocess.run(["sqlite3", "-cmd", f".load {ext}", db_path])
    except:
        print("\nsqlite3 command not found. Please install it or use the command above in your preferred tool.")

if __name__ == "__main__":
    main()
