"""Backward-compatibility shim — imports everything from preprocess.py.

Use preprocess.py directly for new code.
"""
from .preprocess import *  # noqa: F401, F403
from .preprocess import main

if __name__ == "__main__":
    main()
