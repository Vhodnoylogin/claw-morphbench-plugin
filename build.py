"""Build the independent CLAW Morphbench plugin; see README.md."""
from pathlib import Path
import runpy

if __name__ == "__main__":
    runpy.run_path(str(Path(__file__).resolve().parent / "src/main/morphbench-plugin/build.py"), run_name="__main__")
