#!/usr/bin/env python3
import asyncio
import sys
from atracker import db

async def run_query(sql, *args):
    async with db._aconn() as conn:
        cursor = await conn.execute(sql, args)
        if sql.strip().upper().startswith("SELECT"):
            rows = await cursor.fetchall()
            for row in rows:
                print("|".join(str(v) for v in row))
        else:
            await conn.commit()
            print(f"Executed: {sql}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python db_query.py \"SQL QUERY\" [args...]")
        sys.exit(1)
    
    query = sys.argv[1]
    params = sys.argv[2:]
    asyncio.run(run_query(query, *params))
