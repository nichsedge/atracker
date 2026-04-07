import re
import timeit
import uuid

from atracker.api import _get_matched_category

categories = [
    {
        "id": str(uuid.uuid4()),
        "name": f"Category {i}",
        "wm_class_pattern": f"wm{i}",
        "title_pattern": f"title{i}",
        "color": "#000000",
        "daily_goal_secs": 0,
        "daily_limit_secs": 0,
        "is_case_sensitive": False
    } for i in range(100)
]

def run_uncompiled():
    _get_matched_category("wm99", "title99", categories)

if __name__ == "__main__":
    baseline = timeit.timeit(run_uncompiled, number=10000)
    print(f"After compiled cache: {baseline:.6f} s")
