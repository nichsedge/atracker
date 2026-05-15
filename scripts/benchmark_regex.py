import re
import time
import timeit


def match_uncompiled(categories, wm_class, title):
    wm_lower = wm_class.lower()
    title_lower = title.lower()
    for cat in categories:
        title_pattern = cat.get("title_pattern", "")
        if title_pattern:
            is_cs = bool(cat.get("is_case_sensitive"))
            if is_cs:
                if re.search(title_pattern, title):
                    return cat
            else:
                if re.search(title_pattern, title_lower, re.IGNORECASE):
                    return cat

    for cat in categories:
        wm_pattern = cat.get("wm_class_pattern", "")
        if wm_pattern:
            is_cs = bool(cat.get("is_case_sensitive"))
            if is_cs:
                if re.search(wm_pattern, wm_class):
                    return cat
            else:
                if re.search(wm_pattern, wm_lower, re.IGNORECASE):
                    return cat

    return {"name": "Uncategorized", "color": "#64748b"}


_regex_cache = {}


def get_compiled_regex(pattern, is_cs, is_title):
    # key: (pattern, is_cs, is_title) is not strictly needed if we just use (pattern, flags)
    flags = 0 if is_cs else re.IGNORECASE
    key = (pattern, flags)
    if key not in _regex_cache:
        _regex_cache[key] = re.compile(pattern, flags)
    return _regex_cache[key]


def match_compiled_cache(categories, wm_class, title):
    wm_lower = wm_class.lower()
    title_lower = title.lower()
    for cat in categories:
        title_pattern = cat.get("title_pattern", "")
        if title_pattern:
            is_cs = bool(cat.get("is_case_sensitive"))
            reg = get_compiled_regex(title_pattern, is_cs, True)
            if is_cs:
                if reg.search(title):
                    return cat
            else:
                if reg.search(title_lower):
                    return cat

    for cat in categories:
        wm_pattern = cat.get("wm_class_pattern", "")
        if wm_pattern:
            is_cs = bool(cat.get("is_case_sensitive"))
            reg = get_compiled_regex(wm_pattern, is_cs, False)
            if is_cs:
                if reg.search(wm_class):
                    return cat
            else:
                if reg.search(wm_lower):
                    return cat

    return {"name": "Uncategorized", "color": "#64748b"}


# Pre-compile during category generation
def prepare_categories(categories):
    for cat in categories:
        is_cs = bool(cat.get("is_case_sensitive"))
        flags = 0 if is_cs else re.IGNORECASE

        tp = cat.get("title_pattern", "")
        if tp:
            cat["_compiled_title"] = re.compile(tp, flags)

        wp = cat.get("wm_class_pattern", "")
        if wp:
            cat["_compiled_wm"] = re.compile(wp, flags)
    return categories


def match_precompiled(categories, wm_class, title):
    wm_lower = wm_class.lower()
    title_lower = title.lower()
    for cat in categories:
        if "_compiled_title" in cat:
            if cat.get("is_case_sensitive"):
                if cat["_compiled_title"].search(title):
                    return cat
            else:
                if cat["_compiled_title"].search(title_lower):
                    return cat

    for cat in categories:
        if "_compiled_wm" in cat:
            if cat.get("is_case_sensitive"):
                if cat["_compiled_wm"].search(wm_class):
                    return cat
            else:
                if cat["_compiled_wm"].search(wm_lower):
                    return cat

    return {"name": "Uncategorized", "color": "#64748b"}


cats = [
    {
        "title_pattern": f"title{i}",
        "wm_class_pattern": f"wm{i}",
        "is_case_sensitive": False,
    }
    for i in range(100)
]
cats_precompiled = prepare_categories([c.copy() for c in cats])


def run_uncompiled():
    match_uncompiled(cats, "wm99", "title99")


def run_compiled_cache():
    match_compiled_cache(cats, "wm99", "title99")


def run_precompiled():
    match_precompiled(cats_precompiled, "wm99", "title99")


print("Uncompiled:", timeit.timeit(run_uncompiled, number=10000))
print("Compiled cache:", timeit.timeit(run_compiled_cache, number=10000))
print("Precompiled dict:", timeit.timeit(run_precompiled, number=10000))
