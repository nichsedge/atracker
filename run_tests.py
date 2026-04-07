import subprocess
import sys

if __name__ == "__main__":
    result = subprocess.run(["uv", "run", "pytest"], capture_output=True, text=True)
    print(result.stdout)
    if result.stderr:
        print("STDERR:")
        print(result.stderr)
    sys.exit(result.returncode)
