import urllib.request
import json
from datetime import datetime, timedelta

def main():
    end_date = datetime.now()
    start_date = end_date - timedelta(days=30)
    
    url = f"http://localhost:8932/api/range/summary?start={start_date.strftime('%Y-%m-%d')}&end={end_date.strftime('%Y-%m-%d')}"
    
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
    except Exception as e:
        print(f"Error fetching data: {e}")
        return

    summary = data.get("summary", [])
    
    candidates = []
    for item in summary:
        cat = item.get("category_name", "Uncategorized")
        if cat == "Uncategorized":
            candidates.append(item)
    
    # Sort descending by total_secs
    candidates.sort(key=lambda x: x.get("total_secs", 0), reverse=True)
    
    print("Top Uncategorized Items:")
    for item in candidates[:50]:
        print(f"Class: {item.get('wm_class')}, Title: {item.get('title')}, Time: {item.get('total_formatted')}")

if __name__ == "__main__":
    main()
